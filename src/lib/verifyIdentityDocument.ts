import { documentMessage, platformMessage } from "./userFacingMessage.js";
import {
  extractJsonObjectFromModelText,
  geminiErrorToUserFacing,
  generateContentWithModelChain,
  type GeminiContentPart,
} from "./geminiChainedContent.js";
import { inlineMimeForGemini } from "./geminiImageMimes.js";
import { isIdentityAiDocumentKind } from "./identityDocumentKinds.js";
import {
  identityDocumentNumbersMatch,
  normalizeIdentityDocumentNumberForCompare,
} from "./identityDocumentIdMatch.js";
import {
  licenseDataMatchesIdentityRecord,
  type IdentityRecordForLicenseMatch,
} from "./identityFieldMatch.js";

const LOG_PREFIX = "[identity-docs-ai]";
const MAX_BYTES = 15 * 1024 * 1024;
const MIN_BYTES = 400;

const USER = {
  fileTooSmall: documentMessage("El archivo parece vacío o dañado. Prueba con otra foto o PDF."),
  fileTooBig: documentMessage("El archivo es demasiado grande (máx. 15 MB). Reduce el tamaño e inténtalo de nuevo."),
  mimeUnsupported: documentMessage(
    "Formato no admitido para la revisión automática. Usa PDF o imagen JPG, PNG, HEIC, GIF o WebP.",
  ),
  aiUnavailable: platformMessage("No pudimos conectar con el servicio de revisión. Inténtalo de nuevo en unos minutos."),
  aiRejectedDoc: documentMessage(
    "No pudimos validar este archivo. Asegúrate de que sea el documento indicado, con buena luz y texto legible, e inténtalo de nuevo.",
  ),
  licenseBackB2Required: documentMessage(
    "En el reverso de la licencia debe verse al menos una categoría B1, B2 o B3 indicada como vigente. Prueba con otra imagen o PDF más claro.",
  ),
  needIdentityFrontFirst: documentMessage(
    "Primero debes subir y validar el frente de tu documento de identidad; después podremos revisar tu licencia.",
  ),
  licenseDataMismatch: documentMessage(
    "Los datos de la licencia (nombre, documento, fecha de nacimiento o tipo de sangre) no coinciden con tu documento de identidad ya validado.",
  ),
  licenseNotColombian: documentMessage(
    "Debe ser el frente de una licencia de conducción colombiana vigente, con foto y datos legibles.",
  ),
  licensePhotoMismatch: documentMessage(
    "La foto de la licencia no coincide de forma clara con la de tu documento de identidad. Verifica que sea tu licencia colombiana.",
  ),
  needDataAuthorizationFirst: documentMessage(
    "Primero debes subir y validar la autorización de tratamiento de datos (paso 1), donde indicaste tu número de documento.",
  ),
  idNumberMismatch: documentMessage(
    "El número de identificación en este documento no coincide con el de tu autorización de datos. Revisa que sea el mismo documento o vuelve a firmar la autorización con el número correcto.",
  ),
  idNumberNotLegible: documentMessage(
    "No pudimos leer con claridad el número de identificación en la foto. Sube una imagen más nítida donde se vea completo.",
  ),
} as const;

export type IdentityFrontExtraction = {
  firstName: string | null;
  lastName: string | null;
  sex: string | null;
  birthDate: string | null;
  bloodType: string | null;
  idDocumentNumber: string | null;
  documentType: string | null;
};

export type LicenseFrontExtraction = {
  firstName: string | null;
  lastName: string | null;
  birthDate: string | null;
  bloodType: string | null;
  idDocumentNumber: string | null;
  driverRestrictions: string | null;
  licenseValidUntil: string | null;
};

export type VerifyIdentityDocumentOptions = {
  /** Número leído del PDF de autorización de datos (paso 1). Obligatorio para validar idFront. */
  expectedIdDocumentNumber?: string | null;
  /** Datos del titular ya extraídos del documento de identidad. Obligatorio para licenseFront. */
  identityForLicense?: IdentityRecordForLicenseMatch | null;
};

export type IdentityDocumentVerificationResult =
  | { ok: true; identityFrontExtraction?: IdentityFrontExtraction; licenseFrontExtraction?: LicenseFrontExtraction }
  | { ok: false; message: string };

function bool(v: unknown): boolean {
  return v === true;
}

function optionalString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function parseIdentityFrontExtraction(parsed: Record<string, unknown>): IdentityFrontExtraction {
  const rawId = optionalString(parsed.idDocumentNumber);
  const idDocumentNumber = rawId ? normalizeIdentityDocumentNumberForCompare(rawId) || null : null;
  return {
    firstName: optionalString(parsed.firstName),
    lastName: optionalString(parsed.lastName),
    sex: optionalString(parsed.sex),
    birthDate: optionalString(parsed.birthDate),
    bloodType: optionalString(parsed.bloodType),
    idDocumentNumber: idDocumentNumber && idDocumentNumber.length >= 3 ? idDocumentNumber : null,
    documentType: optionalString(parsed.documentType),
  };
}

function buildIdFrontPrompt(expectedIdDocumentNumber: string): string {
  return `Analiza este archivo. Debe ser la cara FRONTAL (anverso) de UNO de estos documentos de identidad válidos:
- **Cédula de ciudadanía colombiana** (tarjeta amarilla/azul con foto)
- **Cédula de identidad venezolana** (documento nacional con foto del titular)
- **Pasaporte** (cualquier país), página de datos con foto

NO debe ser: reverso del documento, licencia de conducción, selfie suelta, captura de pantalla irrelevante u otro tipo de documento.

El titular ya declaró en su autorización de datos este número de identificación (referencia para comparar): **${expectedIdDocumentNumber}**

Evalúa con criterio realista (fotos caseras, escaneos ligeramente imperfectos):

1) matchesRequestedDocument: ¿el archivo es claramente el frente de cédula colombiana, cédula venezolana o pasaporte (con foto del titular)?
2) mainIdentifiersLegible: ¿se leen con claridad razonable el número de documento y al menos nombres o apellidos?
3) qualityAcceptableForReview: ¿la calidad permite revisar el contenido (no casi todo oscuro ni ilegible)?
4) idNumberMatchesAuthorization: ¿el número impreso en el documento **coincide** con el de la autorización (${expectedIdDocumentNumber})? Ignora puntos o espacios de formato; compara el valor real (dígitos/letras). Si no puedes leer el número, false.

Extrae del documento (null si no es legible):
- firstName: nombres de pila
- lastName: apellidos
- sex: sexo como figure (M, F, Masculino, Femenino, etc.)
- birthDate: YYYY-MM-DD
- bloodType: grupo sanguíneo/RH si aparece (p. ej. O+, AB-); null si el documento no lo trae o no se lee
- idDocumentNumber: número tal como en el documento, sin puntos de miles ni espacios extra
- documentType: uno de "CO_CEDULA", "VE_CEDULA", "PASSPORT", u "OTHER" si no encaja

Responde ÚNICAMENTE un JSON válido (sin markdown, sin texto adicional) con esta forma exacta:
{"matchesRequestedDocument":boolean,"mainIdentifiersLegible":boolean,"qualityAcceptableForReview":boolean,"idNumberMatchesAuthorization":boolean,"allRequirementsMet":boolean,"firstName":string|null,"lastName":string|null,"sex":string|null,"birthDate":string|null,"bloodType":string|null,"idDocumentNumber":string|null,"documentType":string|null,"userMessageEs":"string breve en español si algo falla"}

allRequirementsMet debe ser true solo si las cuatro condiciones booleanas de validación son true Y idNumberMatchesAuthorization es true.`;
}

function parseLicenseFrontExtraction(parsed: Record<string, unknown>): LicenseFrontExtraction {
  const rawId = optionalString(parsed.idDocumentNumber);
  const idDocumentNumber = rawId ? normalizeIdentityDocumentNumberForCompare(rawId) || null : null;
  return {
    firstName: optionalString(parsed.firstName),
    lastName: optionalString(parsed.lastName),
    birthDate: optionalString(parsed.birthDate),
    bloodType: optionalString(parsed.bloodType),
    idDocumentNumber: idDocumentNumber && idDocumentNumber.length >= 3 ? idDocumentNumber : null,
    driverRestrictions: optionalString(parsed.driverRestrictions),
    licenseValidUntil: optionalString(parsed.licenseValidUntil),
  };
}

function buildLicenseFrontPrompt(identity: IdentityRecordForLicenseMatch): string {
  return `Analiza este archivo. Debe ser la cara FRONTAL de una **licencia de conducción colombiana** (formato RUNT / pase de conducción nacional), con foto del titular y datos personales legibles. NO cédula sola, NO licencia extranjera, NO reverso de licencia.

Datos del titular según el **documento de identidad ya validado** (deben coincidir con la licencia):
- Nombres: ${identity.firstName ?? "—"}
- Apellidos: ${identity.lastName ?? "—"}
- Número de documento: ${identity.idDocumentNumber ?? "—"}
- Fecha de nacimiento: ${identity.birthDate ?? "—"}
- Tipo de sangre: ${identity.bloodType ?? "— (si no consta en identidad, extrae el de la licencia)"}

Evalúa con criterio realista:

1) matchesRequestedDocument: ¿es claramente el frente de licencia de conducción **colombiana**?
2) mainIdentifiersLegible: ¿se leen nombre, número de documento y foto del titular?
3) qualityAcceptableForReview: ¿calidad suficiente para revisar?
4) dataMatchesIdentityRecord: ¿nombre, apellidos, número de documento, fecha de nacimiento y tipo de sangre coinciden con los datos de referencia anteriores?

Extrae (null si no legible):
- firstName, lastName, idDocumentNumber, birthDate (YYYY-MM-DD), bloodType
- driverRestrictions: restricciones del conductor tal como aparecen (p. ej. lentes, horario); null si no hay
- licenseValidUntil: YYYY-MM-DD si hay fecha de vencimiento/vigencia clara en el frente; si no, null

Responde ÚNICAMENTE JSON válido:
{"matchesRequestedDocument":boolean,"mainIdentifiersLegible":boolean,"qualityAcceptableForReview":boolean,"dataMatchesIdentityRecord":boolean,"allRequirementsMet":boolean,"firstName":string|null,"lastName":string|null,"idDocumentNumber":string|null,"birthDate":string|null,"bloodType":string|null,"driverRestrictions":string|null,"licenseValidUntil":string|null,"userMessageEs":"string breve en español si algo falla"}

allRequirementsMet true solo si las cuatro validaciones booleanas son true y dataMatchesIdentityRecord es true.`;
}

function logDiagnostic(message: string, extra?: unknown): void {
  if (extra !== undefined) {
    console.error(`${LOG_PREFIX} ${message}`, extra);
  } else {
    console.error(`${LOG_PREFIX} ${message}`);
  }
}

function buildPrompt(documentKind: string): string {
  const licenseBackFooter = `
Evalúa con criterio realista (fotos caseras, escaneos ligeramente imperfectos):

1) matchesRequestedDocument: ¿el archivo es el REVERSO de una licencia de conducción colombiana (no el frente, ni el documento de identidad, ni otro documento)?
2) mainIdentifiersLegible: ¿se distingue con claridad razonable la zona de categorías / restricciones del reverso (texto o tabla legible)?
3) qualityAcceptableForReview: ¿la calidad permite leer el contenido (no casi todo oscuro ni ilegible por desenfoque extremo)?
4) categoryB1B2B3VigenteLegible: ¿consta de forma legible al menos una categoría **B1**, **B2** o **B3** como **vigente**? (B-1, B 1, etc.) Debe haber señal de vigencia (VIGENTE o fechas donde no esté vencida). Si solo hay otras categorías sin B1/B2/B3 vigente, false.

Extrae si es legible:
- driverRestrictions: restricciones del conductor en el reverso (null si no aparecen)

Responde ÚNICAMENTE un JSON válido (sin markdown, sin texto adicional) con esta forma exacta:
{"matchesRequestedDocument":boolean,"mainIdentifiersLegible":boolean,"qualityAcceptableForReview":boolean,"categoryB1B2B3VigenteLegible":boolean,"allRequirementsMet":boolean,"driverRestrictions":string|null,"userMessageEs":"string breve en español para el usuario si algo falla"}

allRequirementsMet debe ser true solo si las cuatro condiciones anteriores son true.`;

  const commonFooter = `
Evalúa con criterio realista (fotos caseras, escaneos ligeramente imperfectos):

1) matchesRequestedDocument: ¿el archivo corresponde al tipo de documento que se pidió (no otro documento distinto ni una foto irrelevante)?
2) mainIdentifiersLegible: ¿los datos principales del documento son legibles? Para documento de identidad o licencia: al menos número de documento o nombre visibles con claridad suficiente. Para selfie: el rostro debe verse con claridad razonable (no tapado ni extremadamente borroso).
3) qualityAcceptableForReview: ¿la calidad de imagen o PDF permite revisar el contenido (no está casi todo oscuro, borrosa en exceso, o tan pequeña que no se distingue nada)?

Responde ÚNICAMENTE un JSON válido (sin markdown, sin texto adicional) con esta forma exacta:
{"matchesRequestedDocument":boolean,"mainIdentifiersLegible":boolean,"qualityAcceptableForReview":boolean,"allRequirementsMet":boolean,"userMessageEs":"string breve en español para el usuario si algo falla"}

allRequirementsMet debe ser true solo si las otras tres condiciones son true.`;

  const byKind: Record<string, string> = {
    idFront: "",
    idBack: `Analiza este archivo. Debe ser el **reverso** del documento de identidad cuya cara frontal ya se validó: cédula colombiana, cédula venezolana o pasaporte (huella, código de barras, texto legal, etc.). No debe ser el frente del documento ni una licencia de conducción.`,
    licenseFront: "",
    licenseBack: `Analiza este archivo (Colombia). Debe ser el REVERSO del pase o licencia de conducción colombiana (categorías autorizadas, restricciones, vigencia). No debe ser el frente de la licencia ni el documento de identidad.`,
    selfieWhiteBackground: `Analiza esta imagen. Debe ser una **selfie** tomada con la cámara (no una foto del documento de identidad en pantalla ni un recorte de la foto del documento). La persona debe verse de frente o tres cuartos, con fondo blanco o muy claro y buena iluminación. Esta imagen se comparará con la **foto del titular en el frente del documento de identidad** ya validado: debe ser la **misma persona** pero una **toma claramente distinta** a la foto impresa en el documento.`,
  };

  const intro = byKind[documentKind];
  if (documentKind === "idFront") {
    throw new Error("idFront requiere buildIdFrontPrompt con número de autorización");
  }
  if (documentKind === "licenseFront") {
    throw new Error("licenseFront requiere buildLicenseFrontPrompt con datos de identidad");
  }
  if (!intro) {
    throw new Error(`Tipo de documento no soportado para IA: ${documentKind}`);
  }
  const footer = documentKind === "licenseBack" ? licenseBackFooter : commonFooter;
  return `${intro}\n${footer}`;
}

export async function verifyIdentityDocument(
  buffer: Buffer,
  mimeType: string,
  documentKind: string,
  options?: VerifyIdentityDocumentOptions,
): Promise<IdentityDocumentVerificationResult> {
  if (!isIdentityAiDocumentKind(documentKind)) {
    return { ok: false, message: USER.aiRejectedDoc };
  }

  if (buffer.length < MIN_BYTES) {
    return { ok: false, message: USER.fileTooSmall };
  }
  if (buffer.length > MAX_BYTES) {
    return { ok: false, message: USER.fileTooBig };
  }

  const inlineMime = inlineMimeForGemini(mimeType);
  if (!inlineMime) {
    return { ok: false, message: USER.mimeUnsupported };
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    if (process.env.DATA_TREATMENT_SKIP_AI_VERIFY === "true") {
      return { ok: true };
    }
    logDiagnostic("GEMINI_API_KEY no definida y DATA_TREATMENT_SKIP_AI_VERIFY distinto de true.");
    return { ok: false, message: USER.aiUnavailable };
  }

  if (documentKind === "idFront") {
    const expectedRaw = options?.expectedIdDocumentNumber?.trim() ?? "";
    const expectedNorm = normalizeIdentityDocumentNumberForCompare(expectedRaw);
    if (!expectedNorm || expectedNorm.length < 5) {
      if (process.env.DATA_TREATMENT_SKIP_AI_VERIFY === "true") {
        return { ok: true };
      }
      return { ok: false, message: USER.needDataAuthorizationFirst };
    }
  }

  if (documentKind === "licenseFront") {
    const id = options?.identityForLicense;
    const hasProfile =
      id?.firstName?.trim() &&
      id?.lastName?.trim() &&
      id?.idDocumentNumber?.trim() &&
      id?.birthDate?.trim();
    if (!hasProfile) {
      if (process.env.DATA_TREATMENT_SKIP_AI_VERIFY === "true") {
        return { ok: true };
      }
      return { ok: false, message: USER.needIdentityFrontFirst };
    }
  }

  const promptText =
    documentKind === "idFront"
      ? buildIdFrontPrompt(normalizeIdentityDocumentNumberForCompare(options!.expectedIdDocumentNumber!.trim()))
      : documentKind === "licenseFront"
        ? buildLicenseFrontPrompt(options!.identityForLicense!)
        : buildPrompt(documentKind);

  const parts: GeminiContentPart[] = [
    {
      inlineData: {
        mimeType: inlineMime,
        data: buffer.toString("base64"),
      },
    },
    { text: promptText },
  ];

  try {
    const { text } = await generateContentWithModelChain(apiKey, parts, LOG_PREFIX);
    const parsed = extractJsonObjectFromModelText(text);

    const matchOk = bool(parsed.matchesRequestedDocument);
    const legibleOk = bool(parsed.mainIdentifiersLegible);
    const qualityOk = bool(parsed.qualityAcceptableForReview);
    const bClassOk =
      documentKind === "licenseBack"
        ? bool(parsed.categoryB1B2B3VigenteLegible) || bool(parsed.categoryB2VigenteLegible)
        : true;
    const licenseDataOk =
      documentKind === "licenseFront" ? bool(parsed.dataMatchesIdentityRecord) : true;
    const idAuthOk =
      documentKind === "idFront" ? bool(parsed.idNumberMatchesAuthorization) : true;
    const allMet = bool(parsed.allRequirementsMet);

    if (documentKind === "idFront") {
      const extraction = parseIdentityFrontExtraction(parsed);
      const expectedNorm = normalizeIdentityDocumentNumberForCompare(
        options?.expectedIdDocumentNumber?.trim() ?? "",
      );
      const serverIdMatch =
        extraction.idDocumentNumber != null &&
        identityDocumentNumbersMatch(expectedNorm, extraction.idDocumentNumber);

      if (matchOk && legibleOk && qualityOk && idAuthOk && allMet && serverIdMatch) {
        return { ok: true, identityFrontExtraction: extraction };
      }

      const modelHint =
        typeof parsed.userMessageEs === "string" && parsed.userMessageEs.trim()
          ? parsed.userMessageEs.trim()
          : null;
      logDiagnostic("Rechazo frente identidad (respuesta JSON).", {
        flags: {
          matchesRequestedDocument: matchOk,
          mainIdentifiersLegible: legibleOk,
          qualityAcceptableForReview: qualityOk,
          idNumberMatchesAuthorization: idAuthOk,
          allRequirementsMet: allMet,
          serverIdMatch,
        },
        extraction,
        userMessageEs: modelHint,
      });

      if (matchOk && legibleOk && qualityOk && !extraction.idDocumentNumber) {
        return { ok: false, message: USER.idNumberNotLegible };
      }
      if (matchOk && legibleOk && qualityOk && extraction.idDocumentNumber && !serverIdMatch) {
        return { ok: false, message: USER.idNumberMismatch };
      }
      if (modelHint) {
        return { ok: false, message: documentMessage(modelHint) };
      }
      return { ok: false, message: USER.aiRejectedDoc };
    }

    if (documentKind === "licenseFront") {
      const extraction = parseLicenseFrontExtraction(parsed);
      const identity = options!.identityForLicense!;
      const serverData = licenseDataMatchesIdentityRecord(
        identity,
        extraction,
        identityDocumentNumbersMatch,
      );

      if (matchOk && legibleOk && qualityOk && licenseDataOk && allMet && serverData.ok) {
        return { ok: true, licenseFrontExtraction: extraction };
      }

      const modelHint =
        typeof parsed.userMessageEs === "string" && parsed.userMessageEs.trim()
          ? parsed.userMessageEs.trim()
          : null;
      logDiagnostic("Rechazo frente licencia (respuesta JSON).", {
        flags: {
          matchesRequestedDocument: matchOk,
          mainIdentifiersLegible: legibleOk,
          qualityAcceptableForReview: qualityOk,
          dataMatchesIdentityRecord: licenseDataOk,
          allRequirementsMet: allMet,
          serverDataMatch: serverData.ok,
          serverDataReason: serverData.ok ? null : serverData.reason,
        },
        extraction,
        userMessageEs: modelHint,
      });

      if (!matchOk) {
        return { ok: false, message: USER.licenseNotColombian };
      }
      if (matchOk && legibleOk && qualityOk && (!licenseDataOk || !serverData.ok)) {
        return { ok: false, message: USER.licenseDataMismatch };
      }
      if (modelHint) {
        return { ok: false, message: documentMessage(modelHint) };
      }
      return { ok: false, message: USER.aiRejectedDoc };
    }

    if (matchOk && legibleOk && qualityOk && bClassOk && allMet) {
      if (documentKind === "licenseBack") {
        const backRestrictions = optionalString(parsed.driverRestrictions);
        return {
          ok: true,
          licenseFrontExtraction: backRestrictions
            ? {
                firstName: null,
                lastName: null,
                birthDate: null,
                bloodType: null,
                idDocumentNumber: null,
                driverRestrictions: backRestrictions,
                licenseValidUntil: null,
              }
            : undefined,
        };
      }
      return { ok: true };
    }

    const modelHint =
      typeof parsed.userMessageEs === "string" && parsed.userMessageEs.trim()
        ? parsed.userMessageEs.trim()
        : null;
    const flags: Record<string, boolean> = {
      matchesRequestedDocument: matchOk,
      mainIdentifiersLegible: legibleOk,
      qualityAcceptableForReview: qualityOk,
      allRequirementsMet: allMet,
    };
    if (documentKind === "licenseBack") {
      flags.categoryB1B2B3VigenteLegible = bClassOk;
    }
    logDiagnostic("Rechazo según modelo (respuesta JSON).", {
      documentKind,
      flags,
      userMessageEs: modelHint,
    });

    if (documentKind === "licenseBack" && matchOk && legibleOk && qualityOk && !bClassOk) {
      return { ok: false, message: USER.licenseBackB2Required };
    }

    return { ok: false, message: USER.aiRejectedDoc };
  } catch (err) {
    return {
      ok: false,
      message: platformMessage(geminiErrorToUserFacing(err, LOG_PREFIX, "verifyIdentityDocument")),
    };
  }
}
