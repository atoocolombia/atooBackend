import { documentMessage, platformMessage } from "./userFacingMessage.js";
import { extractJsonObjectFromModelText, generateContentWithModelChain, type GeminiContentPart } from "./geminiChainedContent.js";

const LOG_PREFIX = "[judicial-docs-ai]";
const MAX_BYTES = 15 * 1024 * 1024;
const MIN_BYTES = 400;

const GEMINI_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

const USER = {
  fileTooSmall: documentMessage("El archivo parece vacío o dañado. Prueba con otra foto o PDF."),
  fileTooBig: documentMessage("El archivo es demasiado grande (máx. 15 MB)."),
  mimeUnsupported: documentMessage("Usa PDF o imagen JPG, PNG, GIF o WebP."),
  aiUnavailable: platformMessage("No pudimos conectar con el servicio de revisión. Inténtalo de nuevo más tarde."),
  needIdentityData: documentMessage(
    "Necesitamos el número de documento y nombres de tu identificación (paso 2) para comparar este certificado. Completa y valida el paso 2 o configura la extracción con IA.",
  ),
  simitGeneric: documentMessage(
    "No pudimos validar el certificado SIMIT. Debe mencionar el SIMIT (o sistema equivalente), tu cédula y constar favorable o sin multas pendientes.",
  ),
  simitNotSimit: documentMessage(
    "El documento no parece un certificado del SIMIT o no se identifica claramente como tal. Sube el paz y salvo oficial.",
  ),
  simitCedula: documentMessage("La cédula del certificado no coincide con la de tu identificación registrada."),
  simitNegative: documentMessage(
    "El certificado indica multas, antecedentes desfavorables o texto negativo en tránsito. Solo se acepta constancia favorable / sin multas pendientes.",
  ),
  policeGeneric: documentMessage(
    "No pudimos validar el certificado de la Policía. Debe ser de la Policía Nacional de Colombia, con tu cédula y nombre, y constar sin asuntos pendientes.",
  ),
  policeNotPolice: documentMessage(
    "El documento no consta como expedido por la Policía Nacional de Colombia o no se distingue con claridad.",
  ),
  policeCedula: documentMessage("La cédula del certificado no coincide con la de tu identificación registrada."),
  policeName: documentMessage(
    "El nombre o apellidos del certificado no coinciden de forma razonable con tu identificación registrada.",
  ),
  policePending: documentMessage(
    "El certificado no indica claramente que no tienes asuntos pendientes con las autoridades (o indica lo contrario).",
  ),
  procuraduriaGeneric: documentMessage(
    "No pudimos validar el certificado de Procuraduría. Debe ser de la Procuraduría General de la Nación, con cédula y nombre coincidentes y sin sanciones.",
  ),
  procuraduriaNotPro: documentMessage(
    "El documento no consta como expedido por la Procuraduría General de la Nación o no se distingue con claridad.",
  ),
  procuraduriaCedula: documentMessage("La cédula del certificado no coincide con la de tu identificación registrada."),
  procuraduriaName: documentMessage(
    "El nombre del certificado no coincide de forma razonable con tu identificación registrada.",
  ),
  procuraduriaSanctions: documentMessage(
    "El certificado no indica claramente que no registras sanciones (o indica sanciones). Solo se acepta constancia favorable.",
  ),
} as const;

function bool(v: unknown): boolean {
  return v === true;
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

function inlineMimeForGemini(mimeType: string): string | null {
  if (mimeType === "application/pdf") return "application/pdf";
  if (GEMINI_IMAGE_MIMES.has(mimeType)) return mimeType;
  return null;
}

function skipAi(): boolean {
  return !process.env.GEMINI_API_KEY?.trim() || process.env.DATA_TREATMENT_SKIP_AI_VERIFY === "true";
}

export type JudicialVerifyResult = { ok: true } | { ok: false; message: string };

export type JudicialIdentityCtx = {
  expectedIdDocumentNumber: string | null;
  expectedFirstName: string;
  expectedLastName: string;
};

function buildSimitPrompt(ctx: JudicialIdentityCtx): string {
  const id = ctx.expectedIdDocumentNumber?.trim() || "no indicado en el trámite";
  const fn = ctx.expectedFirstName.trim() || "—";
  const ln = ctx.expectedLastName.trim() || "—";
  return `Analiza este archivo (imagen o PDF, primera página si aplica). Debe ser un **certificado de paz y salvo / estado de multas** del **SIMIT** (Sistema Integrado de Información de Multas y Sanciones por Infracciones de Tránsito) o documento equivalente oficial de Colombia donde conste claramente la referencia al SIMIT o al sistema nacional de información de multas de tránsito.

Datos esperados del solicitante según identificación ya registrada en el trámite:
- Número de cédula o documento esperado: "${id}"
- Nombres de referencia: "${fn}"
- Apellidos de referencia: "${ln}"

Evalúa con criterio realista (escaneos, fotos con sombra):

1) mentionsSimitOrOfficialTrafficSystem: ¿en algún lugar del documento se identifica el **SIMIT** o un sistema integral de multas de tránsito de Colombia de forma razonable?
2) idDocumentMatchesExpected: ¿el número de identificación del titular en el documento **coincide** con el número esperado (solo dígitos para cédula; tolera puntos o espacios de formato)? Si el número esperado era "no indicado", puede ser null en tu lógica interna pero entonces marca true solo si se lee un número de cédula claro en el documento.
3) certificateIsFavorableForTransit: el documento indica situación **favorable** para tránsito: sin multas pendientes, paz y salvo, no registra multas, constancia positiva, etc.
4) mentionsNegativeTrafficFindings: es **true** si el texto indica explícitamente multas pendientes, antecedentes desfavorables en tránsito, reincidencia, sanciones activas, comparendos sin pagar, o mensajes claramente negativos sobre el estado en el SIMIT. Debe ser **false** para aceptar el certificado.
5) qualityAcceptableForReview: legible lo suficiente para verificar lo anterior.

Responde ÚNICAMENTE JSON válido (sin markdown):
{"mentionsSimitOrOfficialTrafficSystem":boolean,"idDocumentMatchesExpected":boolean,"certificateIsFavorableForTransit":boolean,"mentionsNegativeTrafficFindings":boolean,"qualityAcceptableForReview":boolean,"allRequirementsMet":boolean,"userMessageEs":"string breve en español si algo falla"}

allRequirementsMet true solo si las condiciones coherentes son true, **certificateIsFavorableForTransit** es true, **mentionsNegativeTrafficFindings** es false, y las demás condiciones necesarias son true.`;
}

function buildPolicePrompt(ctx: JudicialIdentityCtx): string {
  const id = ctx.expectedIdDocumentNumber?.trim() || "no indicado";
  const fn = ctx.expectedFirstName.trim() || "—";
  const ln = ctx.expectedLastName.trim() || "—";
  return `Analiza este archivo (imagen o PDF). Debe ser un **certificado de antecedentes judiciales** o certificado de **Policía Nacional de Colombia** (o dependencia que indique expresamente Policía Nacional de Colombia).

Datos esperados del titular según identificación registrada:
- Cédula o documento: "${id}"
- Nombres: "${fn}"
- Apellidos: "${ln}"

Evalúa:
1) mentionsPoliciaNacionalDeColombia: el documento indica de forma razonable que fue expedido por la **Policía Nacional de Colombia** (o equivalente explícito).
2) idDocumentMatchesExpected: el número de cédula/documento en el certificado coincide con el esperado (tolerar formato).
3) nameMatchesExpectedPerson: el **nombre y al menos un apellido** del certificado coinciden de forma razonable con los datos esperados (orden de nombres puede variar).
4) statesNoPendingMattersWithAuthorities: el certificado indica que **NO** tiene asuntos pendientes con las autoridades, no registra antecedentes penales, certificado de no judicialización, constancia favorable, o frase equivalente clara. Debe ser **false** si indica lo contrario o antecedentes activos.
5) qualityAcceptableForReview: legible.

Responde ÚNICAMENTE JSON válido:
{"mentionsPoliciaNacionalDeColombia":boolean,"idDocumentMatchesExpected":boolean,"nameMatchesExpectedPerson":boolean,"statesNoPendingMattersWithAuthorities":boolean,"qualityAcceptableForReview":boolean,"allRequirementsMet":boolean,"userMessageEs":"string breve en español si algo falla"}

allRequirementsMet true solo si todo lo coherente es true.`;
}

function buildProcuraduriaPrompt(ctx: JudicialIdentityCtx): string {
  const id = ctx.expectedIdDocumentNumber?.trim() || "no indicado";
  const fn = ctx.expectedFirstName.trim() || "—";
  const ln = ctx.expectedLastName.trim() || "—";
  return `Analiza este archivo (imagen o PDF). Debe ser un certificado o constancia de la **Procuraduría General de la Nación** de Colombia (antecedentes disciplinarios / certificado de antecedentes).

Datos esperados:
- Cédula o documento: "${id}"
- Nombres: "${fn}"
- Apellidos: "${ln}"

Evalúa:
1) mentionsProcuraduriaGeneralDeLaNacion: el documento identifica la **Procuraduría General de la Nación** (o siglas y contexto claros PGN, etc.).
2) idDocumentMatchesExpected: la cédula en el certificado coincide con la esperada.
3) nameMatchesExpectedPerson: nombre (y apellidos si constan) coinciden de forma razonable con los esperados.
4) statesNoSanctionsRegistered: indica que **NO** registra sanciones disciplinarias, no aparece sancionado, constancia favorable, o equivalente claro. Debe ser **false** si indica sanciones vigentes o texto desfavorable.
5) qualityAcceptableForReview: legible.

Responde ÚNICAMENTE JSON válido:
{"mentionsProcuraduriaGeneralDeLaNacion":boolean,"idDocumentMatchesExpected":boolean,"nameMatchesExpectedPerson":boolean,"statesNoSanctionsRegistered":boolean,"qualityAcceptableForReview":boolean,"allRequirementsMet":boolean,"userMessageEs":"string breve en español si algo falla"}

allRequirementsMet true solo si todo lo coherente es true.`;
}

export async function verifyJudicialDocument(
  buffer: Buffer,
  mimeType: string,
  documentKind: string,
  ctx: JudicialIdentityCtx,
): Promise<JudicialVerifyResult> {
  if (buffer.length < MIN_BYTES) return { ok: false, message: USER.fileTooSmall };
  if (buffer.length > MAX_BYTES) return { ok: false, message: USER.fileTooBig };
  const inlineMime = inlineMimeForGemini(mimeType);
  if (!inlineMime) return { ok: false, message: USER.mimeUnsupported };

  if (skipAi()) {
    return { ok: true };
  }

  const expId = ctx.expectedIdDocumentNumber?.trim() ?? "";
  const fn = ctx.expectedFirstName.trim();
  const ln = ctx.expectedLastName.trim();

  if (!expId) {
    return { ok: false, message: USER.needIdentityData };
  }
  if (
    (documentKind === "policeCriminalRecord" || documentKind === "procuraduriaCriminalRecord") &&
    (!fn || !ln)
  ) {
    return { ok: false, message: USER.needIdentityData };
  }

  let prompt: string;
  if (documentKind === "simitPazYSalvo") {
    prompt = buildSimitPrompt(ctx);
  } else if (documentKind === "policeCriminalRecord") {
    prompt = buildPolicePrompt(ctx);
  } else if (documentKind === "procuraduriaCriminalRecord") {
    prompt = buildProcuraduriaPrompt(ctx);
  } else {
    return { ok: false, message: USER.simitGeneric };
  }

  const parts: GeminiContentPart[] = [
    { inlineData: { mimeType: inlineMime, data: buffer.toString("base64") } },
    { text: prompt },
  ];

  try {
    const apiKey = process.env.GEMINI_API_KEY!.trim();
    const { text } = await generateContentWithModelChain(apiKey, parts, LOG_PREFIX);
    const parsed = extractJsonObjectFromModelText(text);
    const allMet = bool(parsed.allRequirementsMet);
    const q = bool(parsed.qualityAcceptableForReview);

    if (documentKind === "simitPazYSalvo") {
      const simitOk = bool(parsed.mentionsSimitOrOfficialTrafficSystem);
      const idOk = bool(parsed.idDocumentMatchesExpected);
      const fav = bool(parsed.certificateIsFavorableForTransit);
      const neg = bool(parsed.mentionsNegativeTrafficFindings);
      if (allMet && simitOk && idOk && fav && !neg && q) {
        return { ok: true };
      }
      if (!simitOk) return { ok: false, message: USER.simitNotSimit };
      if (!idOk) return { ok: false, message: USER.simitCedula };
      if (neg || !fav) return { ok: false, message: USER.simitNegative };
      const hint = str(parsed.userMessageEs);
      return { ok: false, message: hint ?? USER.simitGeneric };
    }

    if (documentKind === "policeCriminalRecord") {
      const pol = bool(parsed.mentionsPoliciaNacionalDeColombia);
      const idOk = bool(parsed.idDocumentMatchesExpected);
      const nameOk = bool(parsed.nameMatchesExpectedPerson);
      const noPen = bool(parsed.statesNoPendingMattersWithAuthorities);
      if (allMet && pol && idOk && nameOk && noPen && q) {
        return { ok: true };
      }
      if (!pol) return { ok: false, message: USER.policeNotPolice };
      if (!idOk) return { ok: false, message: USER.policeCedula };
      if (!nameOk) return { ok: false, message: USER.policeName };
      if (!noPen) return { ok: false, message: USER.policePending };
      const hint = str(parsed.userMessageEs);
      return { ok: false, message: hint ?? USER.policeGeneric };
    }

    if (documentKind === "procuraduriaCriminalRecord") {
      const pro = bool(parsed.mentionsProcuraduriaGeneralDeLaNacion);
      const idOk = bool(parsed.idDocumentMatchesExpected);
      const nameOk = bool(parsed.nameMatchesExpectedPerson);
      const noSan = bool(parsed.statesNoSanctionsRegistered);
      if (allMet && pro && idOk && nameOk && noSan && q) {
        return { ok: true };
      }
      if (!pro) return { ok: false, message: USER.procuraduriaNotPro };
      if (!idOk) return { ok: false, message: USER.procuraduriaCedula };
      if (!nameOk) return { ok: false, message: USER.procuraduriaName };
      if (!noSan) return { ok: false, message: USER.procuraduriaSanctions };
      const hint = str(parsed.userMessageEs);
      return { ok: false, message: hint ?? USER.procuraduriaGeneric };
    }

    return { ok: false, message: USER.simitGeneric };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    logDiagnostic("verifyJudicialDocument fallo", { documentKind, raw });
    if (/429|quota|RESOURCE_EXHAUSTED/i.test(raw)) return { ok: false, message: USER.aiUnavailable };
    if (/404|not supported for generateContent/i.test(raw)) return { ok: false, message: USER.aiUnavailable };
    if (/API key|401|PERMISSION_DENIED/i.test(raw)) return { ok: false, message: USER.aiUnavailable };
    return { ok: false, message: USER.aiUnavailable };
  }
}
