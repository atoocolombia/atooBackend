import { personNamesMatch } from "./identityFieldMatch.js";
import { documentMessage, platformMessage } from "./userFacingMessage.js";
import {
  extractJsonObjectFromModelText,
  geminiErrorToUserFacing,
  generateContentWithModelChain,
  type GeminiContentPart,
} from "./geminiChainedContent.js";
import { inlineMimeForGeminiMedia } from "./geminiMediaMimes.js";
import type { PlatformUiSlot } from "./platformWorkPhotoKinds.js";

const LOG_PREFIX = "[work-address-docs-ai]";
const MAX_BYTES = 40 * 1024 * 1024;
const MIN_BYTES = 400;

const USER = {
  fileTooSmall: documentMessage("El archivo parece vacío o dañado. Prueba con otra foto o PDF."),
  fileTooBig: documentMessage("El archivo es demasiado grande (máx. 40 MB). Reduce el tamaño e inténtalo de nuevo."),
  mimeUnsupported: documentMessage(
    "Formato no admitido. Usa imagen, PDF o video MP4/WebM de pantallas de la app.",
  ),
  multiAppPdfGeneric: documentMessage(
    "No pudimos leer perfiles de conductor en el PDF. Sube capturas más legibles o un PDF con pantallas de las apps.",
  ),
  aiUnavailable: platformMessage("No pudimos conectar con el servicio de revisión. Inténtalo de nuevo en unos minutos."),
  needIdentityFirst: documentMessage(
    "No tenemos nombres extraídos de tu documento de identidad para comparar. Si ya validaste la cédula, configura GEMINI_API_KEY y vuelve a ejecutar la revisión del frente en el paso 2; o activa DATA_TREATMENT_SKIP_AI_VERIFY en desarrollo.",
  ),
  platformGeneric: documentMessage(
    "No pudimos validar la captura. Asegúrate de que se vea bien tu nombre como en la cédula y una calificación mayor a 4.",
  ),
  platformNotApp: documentMessage(
    "La imagen no parece una pantalla de perfil o calificación de conductor (nombre y puntaje). Sube una captura más clara.",
  ),
  platformNameMismatch: documentMessage(
    "En la captura no se distingue un nombre que coincida con el titular de tu documento de identidad. Sube una captura donde se lea bien tu nombre.",
  ),
  platformRating: documentMessage(
    "El puntaje visible debe ser **mayor que 4** (por ejemplo más de 4.0 en escala hasta 5). Sube una captura más reciente o más legible.",
  ),
  platformDuplicateApp: documentMessage(
    "Esta captura muestra la misma app que otra que ya enviaste (marca o logo claro y repetido). Si no se ve el nombre de la app, no debería aplicar esta regla; prueba otra imagen o revisa el mensaje de la verificación.",
  ),
  bankGeneric: documentMessage(
    "No pudimos validar el documento bancario. Sube un certificado o extracto legible donde se vea el titular.",
  ),
  bankMismatch: documentMessage(
    "El titular o datos del documento bancario no coinciden de forma clara con tu identificación ya registrada.",
  ),
  creditGeneric: documentMessage(
    "No pudimos validar el historial crediticio. Sube un informe de DataCrédito o centrales de riesgo legible.",
  ),
  creditMismatch: documentMessage(
    "El nombre en el historial crediticio no coincide de forma clara con tu identificación ya registrada.",
  ),
  utilityGeneric: documentMessage(
    "No pudimos leer el recibo. Sube un servicio público o recibo reciente con la dirección del domicilio legible.",
  ),
  utilityNoAddress: documentMessage(
    "No pudimos extraer una dirección de vivienda clara del recibo. Prueba con otro archivo más nítido.",
  ),
  utilityNameMismatch: documentMessage(
    "El recibo debe estar a tu nombre (como en tu documento de identidad). Sube un recibo donde figuren tus nombres y apellidos como titular del servicio.",
  ),
  platformYearsExperience: documentMessage(
    "En la captura deben verse con claridad tus años o tiempo de experiencia como conductor en la plataforma.",
  ),
  platformComfortBlack: documentMessage(
    "La captura debe mostrar si has manejado categorías tipo Comfort, Black, Premium o equivalentes (cuando la app las muestre en el perfil).",
  ),
  platformElectricMismatch: documentMessage(
    "Indicaste que sí has conducido vehículo eléctrico, pero la captura no muestra indicios claros (categoría verde, EV, eléctrico, etc.). Sube otra pantalla donde se vea esa información o corrige tu respuesta.",
  ),
  platformPartialEmpty: documentMessage(
    "Esta captura no muestra datos legibles del perfil (nombre, calificación, experiencia o categorías). Sube otra pantalla de la misma app.",
  ),
} as const;

function bool(v: unknown): boolean {
  return v === true;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = parseFloat(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function logDiagnostic(message: string, extra?: unknown): void {
  if (extra !== undefined) {
    console.error(`${LOG_PREFIX} ${message}`, extra);
  } else {
    console.error(`${LOG_PREFIX} ${message}`);
  }
}

function skipAi(): boolean {
  return !process.env.GEMINI_API_KEY?.trim() || process.env.DATA_TREATMENT_SKIP_AI_VERIFY === "true";
}

export type PlatformCaptureExtraction = {
  appKey: string;
  rating: number | null;
  yearsExperience: string | null;
  drivenComfortOrBlack: boolean;
  comfortOrBlackNotApplicable: boolean;
  /** Etiquetas leídas (Comfort, Black, etc.); null si no se ven en esta captura. */
  comfortOrBlackTierText: string | null;
  electricVehicleIndicated: boolean;
  nameMatchesCedula: boolean;
};

export type WorkAddressBankExtraction = { matchesIdentity: boolean };

export type WorkAddressUtilityExtraction = {
  serviceAddressLine: string;
  dwellingType: string | null;
  addressComplement: string | null;
  billHolderName: string | null;
};

export type PlatformVerifyResult =
  | { ok: true; extraction: PlatformCaptureExtraction }
  | { ok: false; message: string };

export type BankVerifyResult =
  | { ok: true; extraction: WorkAddressBankExtraction }
  | { ok: false; message: string };

export type UtilityVerifyResult =
  | { ok: true; extraction: WorkAddressUtilityExtraction }
  | { ok: false; message: string };

function buildPlatformPrompt(ctx: {
  expectedFirstName: string;
  expectedLastName: string;
  forbiddenAppLabels: string;
  applicantDeclaredElectricVehicle: boolean | null;
  mediaDescription: string;
}): string {
  const electricLine =
    ctx.applicantDeclaredElectricVehicle === true
      ? "El solicitante declaró que SÍ ha conducido vehículo eléctrico: la captura debe mostrar indicios legibles (texto EV, eléctrico, categoría verde, etc.) si la app los expone."
      : ctx.applicantDeclaredElectricVehicle === false
        ? "El solicitante declaró que NO ha conducido vehículo eléctrico: no exijas indicadores de EV."
        : "Declaración de vehículo eléctrico no disponible; no exijas indicadores de EV.";
  const forbiddenLine =
    ctx.forbiddenAppLabels && ctx.forbiddenAppLabels !== "(ninguna)"
      ? `Si en esta captura SÍ puedes leer de qué app es (marca o logo claro) y el identificador coincide con alguna de estas apps ya usadas en otra captura del mismo trámite, debe ser **distinta**: ${ctx.forbiddenAppLabels}. Si no ves la marca de la app, no aplica esta comparación.`
      : "No hay otras capturas con app identificada aún; no aplica comparar marcas entre capturas.";

  return `Analiza este archivo (${ctx.mediaDescription}). Debe mostrar pantallas de **conductor en plataforma de movilidad** (perfil, calificaciones, cuenta, etc.). Si es PDF revisa todas las páginas; si es video usa los fotogramas legibles.

**Validación por una sola imagen:** el solicitante puede subir **varias capturas de la misma app**. En **esta** imagen solo extrae lo que se vea legible; **no exijas** que aparezcan a la vez nombre, calificación, años de experiencia y categorías Comfort/Black.

**No exijas** que en la imagen se lea el **nombre de la app** (Uber, DiDi, etc.) ni un logo claro. Si la marca de la app **no** se distingue en la captura, indica appBrandVisibleInCapture=false y appBrandNormalized="unknown".

${electricLine}

Datos que pueden aparecer (según pantalla):
- **Nombre del conductor** (comparar con cédula).
- **Calificación / rating** (escala usual hasta 5).
- **Años o tiempo de experiencia** (p. ej. "3 años", antigüedad).
- **Categorías** Comfort, Black, Premium, XL o equivalentes.
- Indicios de **vehículo eléctrico / EV** si aplican.

Datos de referencia del titular (cédula validada):
- Nombres de pila: "${ctx.expectedFirstName}"
- Apellidos: "${ctx.expectedLastName}"

${forbiddenLine}

Requisitos:
1) isRideshareDriverAppScreenshot: parece pantalla de app/servicio de conductor o cuenta con nombre y calificación (no banco, no recibo de servicios, no foto irrelevante).
2) appBrandVisibleInCapture: true solo si el nombre de la app o el logo permiten identificar la marca con claridad; si no, false.
3) appBrandNormalized: si appBrandVisibleInCapture es true, token corto en minúsculas sin espacios (uber, didi, cabify, indrive, beat, etc.); si es false, el string exacto "unknown".
4) nameVisibleInCapture: true si se lee un nombre de persona en la captura.
5) nameMatchesCedula: si nameVisibleInCapture es true, el nombre coincide con el titular esperado; si no hay nombre visible, puede ser false.
6) ratingVisible: se ve el número de calificación/puntaje del conductor.
7) ratingValue: número decimal leído (principal del conductor) o null.
8) ratingStrictlyGreaterThan4: si ratingVisible, ratingValue debe ser **estrictamente mayor que 4** (4.0 NO vale).
9) yearsExperienceVisible: se distingue tiempo de experiencia en esta captura.
10) yearsExperienceText: texto leído (p. ej. "2 años") o null.
11) comfortOrBlackTierVisible: se ven categorías Comfort/Black/Premium/XL o equivalentes en esta captura (opcional; no es obligatorio que aparezcan).
12) comfortOrBlackTierText: texto leído de esas categorías o null.
13) comfortOrBlackNotApplicable: true si en esta pantalla la app claramente no expone esas categorías.
14) electricVehicleIndicated: true si hay indicios de EV/eléctrico en **esta** imagen.
15) appNotInForbiddenList: si appBrandNormalized es "unknown", debe ser true. Si identificas app concreta, true solo si no está en la lista de apps ya usadas en **otra plataforma** del trámite.
16) qualityAcceptableForReview: legible lo que se pretende leer en esta captura.

Responde ÚNICAMENTE un JSON válido (sin markdown, sin texto adicional) con esta forma exacta:
{"isRideshareDriverAppScreenshot":boolean,"appBrandVisibleInCapture":boolean,"appBrandNormalized":"string","nameVisibleInCapture":boolean,"nameMatchesCedula":boolean,"ratingVisible":boolean,"ratingValue":number|null,"ratingStrictlyGreaterThan4":boolean,"yearsExperienceVisible":boolean,"yearsExperienceText":string|null,"comfortOrBlackTierVisible":boolean,"comfortOrBlackTierText":string|null,"comfortOrBlackNotApplicable":boolean,"electricVehicleIndicated":boolean,"appNotInForbiddenList":boolean,"qualityAcceptableForReview":boolean,"userMessageEs":"string breve en español si algo falla"}`;
}

function buildUtilityPrompt(ctx: { expectedFirstName: string; expectedLastName: string }): string {
  return `Analiza este archivo (imagen o PDF). Debe ser un **recibo de servicio público o privado** (luz, agua, gas, internet, administración, etc.) en Colombia con **dirección de servicio** legible.

El recibo debe estar a nombre del **titular del trámite** (persona que solicita), no de un tercero sin relación:
- Nombres de pila: "${ctx.expectedFirstName}"
- Apellidos: "${ctx.expectedLastName}"

Extrae:
- serviceAddressLine: dirección principal (calle/carrera/número, barrio, ciudad)
- dwellingType: "CASA", "APARTAMENTO" u "OTRO" según lo que indique el documento
- addressComplement: apartamento, torre, interior, manzana, casa #, etc.; null si no consta o es casa sin complemento
- billHolderName: nombre del titular del recibo tal como figure

Evalúa:
1) looksLikeUtilityOrHousingReceipt
2) addressLegible
3) billHolderNameMatchesApplicant: el titular del recibo coincide razonablemente con el solicitante (nombres/apellidos)
4) qualityAcceptableForReview

Responde ÚNICAMENTE JSON válido:
{"looksLikeUtilityOrHousingReceipt":boolean,"addressLegible":boolean,"billHolderNameMatchesApplicant":boolean,"billHolderName":"string|null","serviceAddressLine":"string","dwellingType":"CASA|APARTAMENTO|OTRO|null","addressComplement":"string|null","qualityAcceptableForReview":boolean,"allRequirementsMet":boolean,"userMessageEs":"string breve en español si algo falla"}

allRequirementsMet true solo si es recibo pertinente, dirección legible, titular coincide con el solicitante y serviceAddressLine no está vacía.`;
}

function buildBankPrompt(ctx: { expectedFirstName: string; expectedLastName: string; expectedIdNumber: string | null }): string {
  const idLine = ctx.expectedIdNumber
    ? `Número de documento de identidad esperado (si aparece en el banco, debe coincidir): "${ctx.expectedIdNumber}"`
    : "Número de documento: no disponible en el trámite; no exijas coincidencia numérica si no está en el documento bancario.";
  return `Analiza este archivo (imagen o PDF de certificación bancaria, carta o extracto). Debe ser un **documento bancario** donde se identifique el **titular de la cuenta** con nombre legible.

Titular esperado según identificación ya validada:
- Nombres: "${ctx.expectedFirstName}"
- Apellidos: "${ctx.expectedLastName}"
${idLine}

Evalúa:
1) looksLikeBankDocument: parece documento bancario oficial o extracto con titular (no un recibo de servicios como único contenido).
2) holderNameLegible: se lee un nombre de persona natural o razón social del titular.
3) holderNameMatchesExpected: el titular coincide de forma razonable con el nombre esperado (orden y tildes pueden variar).
4) idMatchesIfPresent: si el documento muestra cédula/NIT/identificación del titular y tenemos número esperado, debe coincidir; si no hay número en el banco o no tenemos referencia, puede ser true.
5) qualityAcceptableForReview: legible lo suficiente.

Responde ÚNICAMENTE JSON válido:
{"looksLikeBankDocument":boolean,"holderNameLegible":boolean,"holderNameMatchesExpected":boolean,"idMatchesIfPresent":boolean,"qualityAcceptableForReview":boolean,"allRequirementsMet":boolean,"userMessageEs":"string breve en español si algo falla"}

allRequirementsMet true solo si las condiciones coherentes con el archivo son true.`;
}

function buildCreditReportPrompt(ctx: { expectedFirstName: string; expectedLastName: string }): string {
  return `Analiza este archivo (imagen o PDF). Debe ser un **informe de historial crediticio** de Colombia (DataCrédito, TransUnion, Experian u otra central de riesgo reconocida).

Titular esperado según identificación ya validada:
- Nombres: "${ctx.expectedFirstName}"
- Apellidos: "${ctx.expectedLastName}"

Evalúa:
1) looksLikeCreditReport: parece informe crediticio o consulta de centrales de riesgo (no un extracto bancario genérico ni recibo).
2) subjectNameLegible: se lee el nombre de la persona consultada.
3) subjectNameMatchesExpected: el nombre coincide de forma razonable con el titular esperado.
4) qualityAcceptableForReview: legible lo suficiente.

Responde ÚNICAMENTE JSON válido:
{"looksLikeCreditReport":boolean,"subjectNameLegible":boolean,"subjectNameMatchesExpected":boolean,"qualityAcceptableForReview":boolean,"allRequirementsMet":boolean,"userMessageEs":"string breve en español si algo falla"}

allRequirementsMet true solo si las condiciones coherentes son true.`;
}

export async function verifyPlatformWorkCapture(
  buffer: Buffer,
  mimeType: string,
  ctx: {
    expectedFirstName: string;
    expectedLastName: string;
    forbiddenAppKeys: string[];
    applicantDeclaredElectricVehicle: boolean | null;
  },
): Promise<PlatformVerifyResult> {
  if (buffer.length < MIN_BYTES) return { ok: false, message: USER.fileTooSmall };
  if (buffer.length > MAX_BYTES) return { ok: false, message: USER.fileTooBig };
  const inlineMime = inlineMimeForGeminiMedia(mimeType);
  if (!inlineMime) return { ok: false, message: USER.mimeUnsupported };

  const mediaDescription =
    inlineMime === "application/pdf"
      ? "PDF"
      : inlineMime.startsWith("video/")
        ? "video"
        : "imagen";

  /** Con IA omitida no comparamos contra la BD: no exigir nombres aquí (pueden faltar si no hubo extracción). */
  if (skipAi()) {
    const devKey = `dev-${ctx.forbiddenAppKeys.filter((k) => k && k !== "unknown").length}`;
    return {
      ok: true,
      extraction: {
        appKey: devKey,
        rating: 4.95,
        yearsExperience: "N/D",
        drivenComfortOrBlack: true,
        comfortOrBlackNotApplicable: false,
        comfortOrBlackTierText: null,
        electricVehicleIndicated: ctx.applicantDeclaredElectricVehicle === true,
        nameMatchesCedula: true,
      },
    };
  }

  const fn = ctx.expectedFirstName.trim();
  const ln = ctx.expectedLastName.trim();
  if (!fn && !ln) return { ok: false, message: USER.needIdentityFirst };

  const forbiddenAppLabels =
    ctx.forbiddenAppKeys.length > 0 ? ctx.forbiddenAppKeys.map((k) => `"${k}"`).join(", ") : "(ninguna)";

  const parts: GeminiContentPart[] = [
    { inlineData: { mimeType: inlineMime, data: buffer.toString("base64") } },
    {
      text: buildPlatformPrompt({
        expectedFirstName: fn || "—",
        expectedLastName: ln || "—",
        forbiddenAppLabels,
        applicantDeclaredElectricVehicle: ctx.applicantDeclaredElectricVehicle,
        mediaDescription,
      }),
    },
  ];

  try {
    const apiKey = process.env.GEMINI_API_KEY!.trim();
    const { text } = await generateContentWithModelChain(apiKey, parts, LOG_PREFIX);
    const parsed = extractJsonObjectFromModelText(text);

    const ratingValue = num(parsed.ratingValue);
    const ratingOk = bool(parsed.ratingStrictlyGreaterThan4) && ratingValue != null && ratingValue > 4;

    const rawBrand = str(parsed.appBrandNormalized)?.toLowerCase().replace(/\s+/g, "") || "";
    const isUnknownToken = (s: string) =>
      !s || s === "unknown" || s === "otro" || s === "n/a" || s === "desconocido" || s === "noaplica";

    const explicitVisible = parsed.appBrandVisibleInCapture;
    let brandVisible: boolean;
    if (typeof explicitVisible === "boolean") {
      brandVisible = explicitVisible;
    } else {
      brandVisible = !isUnknownToken(rawBrand);
    }

    let appKeyFinal: string;
    if (!brandVisible || isUnknownToken(rawBrand)) {
      appKeyFinal = "unknown";
    } else {
      appKeyFinal = rawBrand;
    }

    const dupCheckNeeded = appKeyFinal !== "unknown";
    const forbiddenNorm = new Set(
      ctx.forbiddenAppKeys.map((k) => k.toLowerCase().replace(/\s+/g, "")).filter((k) => k && k !== "unknown"),
    );
    const duplicateLocal = dupCheckNeeded && forbiddenNorm.has(appKeyFinal);

    const modelAppListOk = !dupCheckNeeded || bool(parsed.appNotInForbiddenList);
    const yearsOk = bool(parsed.yearsExperienceVisible);
    const comfortTier = bool(parsed.comfortOrBlackTierVisible);
    const comfortText = str(parsed.comfortOrBlackTierText);
    const comfortSeen = comfortTier || Boolean(comfortText);
    const comfortNa = bool(parsed.comfortOrBlackNotApplicable);
    const electricOk = bool(parsed.electricVehicleIndicated);
    const nameVisible = bool(parsed.nameVisibleInCapture);
    const nameOk = bool(parsed.nameMatchesCedula);
    const nameBad = nameVisible && !nameOk;
    const ratingVisible = bool(parsed.ratingVisible);
    const ratingBad = ratingVisible && !ratingOk;

    const hasUsefulPartial =
      (nameVisible && nameOk) ||
      (ratingVisible && ratingOk) ||
      yearsOk ||
      comfortSeen ||
      comfortNa ||
      electricOk;

    if (
      bool(parsed.isRideshareDriverAppScreenshot) &&
      bool(parsed.qualityAcceptableForReview) &&
      hasUsefulPartial &&
      modelAppListOk &&
      !duplicateLocal &&
      !nameBad &&
      !ratingBad
    ) {
      return {
        ok: true,
        extraction: {
          appKey: appKeyFinal,
          rating: ratingVisible && ratingOk && ratingValue != null ? ratingValue : null,
          yearsExperience: yearsOk ? str(parsed.yearsExperienceText) : null,
          drivenComfortOrBlack: comfortSeen,
          comfortOrBlackNotApplicable: comfortNa,
          comfortOrBlackTierText: comfortText,
          electricVehicleIndicated: electricOk,
          nameMatchesCedula: nameVisible && nameOk,
        },
      };
    }

    if (duplicateLocal) {
      return { ok: false, message: USER.platformDuplicateApp };
    }
    if (!bool(parsed.isRideshareDriverAppScreenshot)) {
      return { ok: false, message: USER.platformNotApp };
    }
    if (nameBad) {
      return { ok: false, message: USER.platformNameMismatch };
    }
    if (ratingBad) {
      return { ok: false, message: USER.platformRating };
    }
    if (dupCheckNeeded && !bool(parsed.appNotInForbiddenList)) {
      return { ok: false, message: USER.platformDuplicateApp };
    }
    if (!hasUsefulPartial) {
      return { ok: false, message: USER.platformPartialEmpty };
    }

    const hint = str(parsed.userMessageEs);
    return { ok: false, message: hint ?? USER.platformGeneric };
  } catch (err) {
    return {
      ok: false,
      message: platformMessage(geminiErrorToUserFacing(err, LOG_PREFIX, "verifyPlatformWorkCapture")),
    };
  }
}

export type MultiAppPdfVerifyResult =
  | { ok: true; bySlot: Partial<Record<PlatformUiSlot, PlatformCaptureExtraction>> }
  | { ok: false; message: string };

function platformExtractionFromModelBlock(
  block: Record<string, unknown>,
): PlatformCaptureExtraction | null {
  const ratingValue = num(block.ratingValue);
  const ratingOk = bool(block.ratingStrictlyGreaterThan4) && ratingValue != null && ratingValue > 4;
  const comfortTier = bool(block.comfortOrBlackTierVisible);
  const comfortText = str(block.comfortOrBlackTierText);
  const comfortSeen = comfortTier || Boolean(comfortText);
  const comfortNa = bool(block.comfortOrBlackNotApplicable);
  const yearsOk = bool(block.yearsExperienceVisible);
  const nameVisible = bool(block.nameVisibleInCapture);
  const nameOk = bool(block.nameMatchesCedula);
  const ratingVisible = bool(block.ratingVisible);
  const electricOk = bool(block.electricVehicleIndicated);

  const rawBrand = str(block.appBrandNormalized)?.toLowerCase().replace(/\s+/g, "") || "unknown";
  const appKey = rawBrand && rawBrand !== "unknown" ? rawBrand : "unknown";

  const hasUsefulPartial =
    (nameVisible && nameOk) ||
    (ratingVisible && ratingOk) ||
    yearsOk ||
    comfortSeen ||
    comfortNa ||
    electricOk;

  if (!hasUsefulPartial) return null;

  return {
    appKey,
    rating: ratingVisible && ratingOk && ratingValue != null ? ratingValue : null,
    yearsExperience: yearsOk ? str(block.yearsExperienceText) : null,
    drivenComfortOrBlack: comfortSeen,
    comfortOrBlackNotApplicable: comfortNa,
    comfortOrBlackTierText: comfortText,
    electricVehicleIndicated: electricOk,
    nameMatchesCedula: nameVisible && nameOk,
  };
}

function buildMultiAppPdfPrompt(ctx: {
  expectedFirstName: string;
  expectedLastName: string;
  applicantDeclaredElectricVehicle: boolean | null;
}): string {
  const electricLine =
    ctx.applicantDeclaredElectricVehicle === true
      ? "El solicitante declaró que SÍ ha conducido vehículo eléctrico."
      : "Declaración EV: no exijas indicadores de eléctrico salvo que aparezcan.";
  return `Analiza este PDF. Puede reunir capturas de **una o varias apps** de conductor (Uber, DiDi, etc.) para la misma persona.

Titular esperado (cédula):
- Nombres: "${ctx.expectedFirstName}"
- Apellidos: "${ctx.expectedLastName}"

${electricLine}

Por cada app distinta que identifiques en el documento, extrae datos parciales (no exijas todo en un bloque). Asigna suggestedSlot 1, 2 o 3 para la primera, segunda y tercera app distinta (máximo 3).

Responde ÚNICAMENTE JSON válido:
{"apps":[{"suggestedSlot":number|null,"appBrandNormalized":"string","nameVisibleInCapture":boolean,"nameMatchesCedula":boolean,"ratingVisible":boolean,"ratingValue":number|null,"ratingStrictlyGreaterThan4":boolean,"yearsExperienceVisible":boolean,"yearsExperienceText":string|null,"comfortOrBlackTierVisible":boolean,"comfortOrBlackTierText":string|null,"comfortOrBlackNotApplicable":boolean,"electricVehicleIndicated":boolean}],"qualityAcceptableForReview":boolean,"userMessageEs":"string|null"}

qualityAcceptableForReview true si al menos una app aporta datos útiles legibles.`;
}

export async function verifyPlatformMobilityMultiAppPdf(
  buffer: Buffer,
  mimeType: string,
  ctx: {
    expectedFirstName: string;
    expectedLastName: string;
    applicantDeclaredElectricVehicle: boolean | null;
  },
): Promise<MultiAppPdfVerifyResult> {
  if (buffer.length < MIN_BYTES) return { ok: false, message: USER.fileTooSmall };
  if (buffer.length > MAX_BYTES) return { ok: false, message: USER.fileTooBig };
  if (mimeType !== "application/pdf") return { ok: false, message: USER.mimeUnsupported };

  if (skipAi()) {
    return {
      ok: true,
      bySlot: {
        1: {
          appKey: "dev-multi",
          rating: 4.9,
          yearsExperience: "N/D",
          drivenComfortOrBlack: false,
          comfortOrBlackNotApplicable: true,
          comfortOrBlackTierText: null,
          electricVehicleIndicated: ctx.applicantDeclaredElectricVehicle === true,
          nameMatchesCedula: true,
        },
      },
    };
  }

  const fn = ctx.expectedFirstName.trim();
  const ln = ctx.expectedLastName.trim();
  if (!fn && !ln) return { ok: false, message: USER.needIdentityFirst };

  const parts: GeminiContentPart[] = [
    { inlineData: { mimeType: "application/pdf", data: buffer.toString("base64") } },
    {
      text: buildMultiAppPdfPrompt({
        expectedFirstName: fn || "—",
        expectedLastName: ln || "—",
        applicantDeclaredElectricVehicle: ctx.applicantDeclaredElectricVehicle,
      }),
    },
  ];

  try {
    const apiKey = process.env.GEMINI_API_KEY!.trim();
    const { text } = await generateContentWithModelChain(apiKey, parts, LOG_PREFIX);
    const parsed = extractJsonObjectFromModelText(text);
    if (!bool(parsed.qualityAcceptableForReview)) {
      const hint = str(parsed.userMessageEs);
      return { ok: false, message: hint ?? USER.multiAppPdfGeneric };
    }

    const appsRaw = parsed.apps;
    if (!Array.isArray(appsRaw) || appsRaw.length === 0) {
      return { ok: false, message: USER.multiAppPdfGeneric };
    }

    const bySlot: Partial<Record<PlatformUiSlot, PlatformCaptureExtraction>> = {};
    const usedSlots = new Set<PlatformUiSlot>();

    for (const item of appsRaw) {
      if (!isRecord(item)) continue;
      const extraction = platformExtractionFromModelBlock(item);
      if (!extraction) continue;

      const suggested = num(item.suggestedSlot);
      let slotKey: PlatformUiSlot | null =
        suggested === 1 || suggested === 2 || suggested === 3 ? (suggested as PlatformUiSlot) : null;
      if (!slotKey) {
        for (const s of [1, 2, 3] as const) {
          if (!usedSlots.has(s) && !bySlot[s]) {
            slotKey = s;
            break;
          }
        }
      }
      if (!slotKey || bySlot[slotKey]) continue;
      usedSlots.add(slotKey);
      bySlot[slotKey] = extraction;
    }

    if (Object.keys(bySlot).length === 0) {
      return { ok: false, message: USER.multiAppPdfGeneric };
    }

    return { ok: true, bySlot };
  } catch (err) {
    return {
      ok: false,
      message: platformMessage(geminiErrorToUserFacing(err, LOG_PREFIX, "verifyPlatformMobilityMultiAppPdf")),
    };
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export async function verifyBankDocumentAgainstIdentity(
  buffer: Buffer,
  mimeType: string,
  ctx: { expectedFirstName: string; expectedLastName: string; expectedIdNumber: string | null },
): Promise<BankVerifyResult> {
  if (buffer.length < MIN_BYTES) return { ok: false, message: USER.fileTooSmall };
  if (buffer.length > MAX_BYTES) return { ok: false, message: USER.fileTooBig };
  const inlineMime = inlineMimeForGeminiMedia(mimeType);
  if (!inlineMime) return { ok: false, message: USER.mimeUnsupported };

  if (skipAi()) {
    return { ok: true, extraction: { matchesIdentity: true } };
  }

  const fn = ctx.expectedFirstName.trim();
  const ln = ctx.expectedLastName.trim();
  if (!fn && !ln) return { ok: false, message: USER.needIdentityFirst };

  const parts: GeminiContentPart[] = [
    { inlineData: { mimeType: inlineMime, data: buffer.toString("base64") } },
    {
      text: buildBankPrompt({
        expectedFirstName: fn || "—",
        expectedLastName: ln || "—",
        expectedIdNumber: ctx.expectedIdNumber?.trim() || null,
      }),
    },
  ];

  try {
    const apiKey = process.env.GEMINI_API_KEY!.trim();
    const { text } = await generateContentWithModelChain(apiKey, parts, LOG_PREFIX);
    const parsed = extractJsonObjectFromModelText(text);

    const idOk = bool(parsed.idMatchesIfPresent);
    const allMet = bool(parsed.allRequirementsMet);

    if (
      allMet &&
      bool(parsed.looksLikeBankDocument) &&
      bool(parsed.holderNameLegible) &&
      bool(parsed.holderNameMatchesExpected) &&
      idOk &&
      bool(parsed.qualityAcceptableForReview)
    ) {
      return { ok: true, extraction: { matchesIdentity: true } };
    }

    if (bool(parsed.looksLikeBankDocument) && !bool(parsed.holderNameMatchesExpected)) {
      return { ok: false, message: USER.bankMismatch };
    }

    const hint = str(parsed.userMessageEs);
    return { ok: false, message: hint ?? USER.bankGeneric };
  } catch (err) {
    return {
      ok: false,
      message: platformMessage(geminiErrorToUserFacing(err, LOG_PREFIX, "verifyBankDocumentAgainstIdentity")),
    };
  }
}

export async function verifyUtilityReceiptAddress(
  buffer: Buffer,
  mimeType: string,
  ctx: { expectedFirstName: string; expectedLastName: string },
): Promise<UtilityVerifyResult> {
  if (buffer.length < MIN_BYTES) return { ok: false, message: USER.fileTooSmall };
  if (buffer.length > MAX_BYTES) return { ok: false, message: USER.fileTooBig };
  const inlineMime = inlineMimeForGeminiMedia(mimeType);
  if (!inlineMime) return { ok: false, message: USER.mimeUnsupported };

  const fn = ctx.expectedFirstName.trim();
  const ln = ctx.expectedLastName.trim();
  if (!skipAi() && !fn && !ln) {
    return { ok: false, message: USER.needIdentityFirst };
  }

  if (skipAi()) {
    return {
      ok: true,
      extraction: {
        serviceAddressLine: "Dirección no extraída (verificación IA desactivada en entorno).",
        dwellingType: null,
        addressComplement: null,
        billHolderName: null,
      },
    };
  }

  const parts: GeminiContentPart[] = [
    { inlineData: { mimeType: inlineMime, data: buffer.toString("base64") } },
    { text: buildUtilityPrompt({ expectedFirstName: fn || "—", expectedLastName: ln || "—" }) },
  ];

  try {
    const apiKey = process.env.GEMINI_API_KEY!.trim();
    const { text } = await generateContentWithModelChain(apiKey, parts, LOG_PREFIX);
    const parsed = extractJsonObjectFromModelText(text);

    const line = str(parsed.serviceAddressLine);
    const allMet = bool(parsed.allRequirementsMet);
    const holderName = str(parsed.billHolderName);
    const holderOkModel = bool(parsed.billHolderNameMatchesApplicant);
    const holderOkServer =
      holderOkModel ||
      (holderName != null &&
        (personNamesMatch(fn, holderName) ||
          personNamesMatch(ln, holderName) ||
          personNamesMatch(`${fn} ${ln}`.trim(), holderName)));

    if (
      allMet &&
      bool(parsed.looksLikeUtilityOrHousingReceipt) &&
      bool(parsed.addressLegible) &&
      line &&
      holderOkServer &&
      bool(parsed.qualityAcceptableForReview)
    ) {
      const complement = str(parsed.addressComplement);
      const dwelling = str(parsed.dwellingType);
      const fullLine = complement ? `${line} — ${complement}` : line;
      return {
        ok: true,
        extraction: {
          serviceAddressLine: fullLine,
          dwellingType: dwelling,
          addressComplement: complement,
          billHolderName: holderName,
        },
      };
    }

    if (bool(parsed.looksLikeUtilityOrHousingReceipt) && !holderOkServer) {
      return { ok: false, message: USER.utilityNameMismatch };
    }

    if (!line || !bool(parsed.addressLegible)) {
      return { ok: false, message: USER.utilityNoAddress };
    }

    const hint = str(parsed.userMessageEs);
    return { ok: false, message: hint ?? USER.utilityGeneric };
  } catch (err) {
    return {
      ok: false,
      message: platformMessage(geminiErrorToUserFacing(err, LOG_PREFIX, "verifyUtilityReceiptAddress")),
    };
  }
}

export async function verifyCreditReportAgainstIdentity(
  buffer: Buffer,
  mimeType: string,
  ctx: { expectedFirstName: string; expectedLastName: string },
): Promise<BankVerifyResult> {
  if (buffer.length < MIN_BYTES) return { ok: false, message: USER.fileTooSmall };
  if (buffer.length > MAX_BYTES) return { ok: false, message: USER.fileTooBig };
  const inlineMime = inlineMimeForGeminiMedia(mimeType);
  if (!inlineMime) return { ok: false, message: USER.mimeUnsupported };

  if (skipAi()) {
    return { ok: true, extraction: { matchesIdentity: true } };
  }

  const fn = ctx.expectedFirstName.trim();
  const ln = ctx.expectedLastName.trim();
  if (!fn && !ln) return { ok: false, message: USER.needIdentityFirst };

  const parts: GeminiContentPart[] = [
    { inlineData: { mimeType: inlineMime, data: buffer.toString("base64") } },
    {
      text: buildCreditReportPrompt({
        expectedFirstName: fn || "—",
        expectedLastName: ln || "—",
      }),
    },
  ];

  try {
    const apiKey = process.env.GEMINI_API_KEY!.trim();
    const { text } = await generateContentWithModelChain(apiKey, parts, LOG_PREFIX);
    const parsed = extractJsonObjectFromModelText(text);
    const allMet = bool(parsed.allRequirementsMet);

    if (
      allMet &&
      bool(parsed.looksLikeCreditReport) &&
      bool(parsed.subjectNameLegible) &&
      bool(parsed.subjectNameMatchesExpected) &&
      bool(parsed.qualityAcceptableForReview)
    ) {
      return { ok: true, extraction: { matchesIdentity: true } };
    }

    if (bool(parsed.looksLikeCreditReport) && !bool(parsed.subjectNameMatchesExpected)) {
      return { ok: false, message: USER.creditMismatch };
    }

    const hint = str(parsed.userMessageEs);
    return { ok: false, message: hint ?? USER.creditGeneric };
  } catch (err) {
    return {
      ok: false,
      message: platformMessage(
        geminiErrorToUserFacing(err, LOG_PREFIX, "verifyCreditReportAgainstIdentity"),
      ),
    };
  }
}
