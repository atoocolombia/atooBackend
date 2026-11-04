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
    "En el reverso del pase (licencia) debe verse la categoría B2 indicada como vigente. Prueba con otra imagen o PDF más claro.",
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

export type VerifyIdentityDocumentOptions = {
  /** Número leído del PDF de autorización de datos (paso 1). Obligatorio para validar idFront. */
  expectedIdDocumentNumber?: string | null;
};

export type IdentityDocumentVerificationResult =
  | { ok: true; identityFrontExtraction?: IdentityFrontExtraction }
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
4) categoryB2VigenteLegible: ¿consta de forma legible la categoría **B2** y que está **vigente**? Debe verse explícitamente B2 (o "B-2" / "B 2" como categoría) junto con indicación de vigencia: la palabra **VIGENTE** asociada a B2, o fechas de vigencia donde se entienda que B2 no está vencida. Si no aparece B2, solo hay otras categorías, o B2 consta vencida o sin señal de vigencia, esta condición es false.

Responde ÚNICAMENTE un JSON válido (sin markdown, sin texto adicional) con esta forma exacta:
{"matchesRequestedDocument":boolean,"mainIdentifiersLegible":boolean,"qualityAcceptableForReview":boolean,"categoryB2VigenteLegible":boolean,"allRequirementsMet":boolean,"userMessageEs":"string breve en español para el usuario si algo falla"}

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
    licenseFront: `Analiza este archivo (Colombia). Debe ser la cara FRONTAL de una licencia de conducción colombiana vigente o equivalente. No debe ser solo el documento de identidad ni el reverso de la licencia.`,
    licenseBack: `Analiza este archivo (Colombia). Debe ser el REVERSO del pase o licencia de conducción colombiana (donde suelen figurar las categorías autorizadas y su estado). No debe ser el frente de la licencia ni el documento de identidad.

Requisito obligatorio para aprobar: en ese reverso debe poder leerse la categoría **B2** y que conste como **vigente** (según la forma en que el documento colombiano muestre categorías y vigencia).`,
    selfieWhiteBackground: `Analiza esta imagen. Debe ser una **selfie** tomada con la cámara (no una foto del documento de identidad en pantalla ni un recorte de la foto del documento). La persona debe verse de frente o tres cuartos, con fondo blanco o muy claro y buena iluminación. Esta imagen se comparará con la **foto del titular en el frente del documento de identidad** ya validado: debe ser la **misma persona** pero una **toma claramente distinta** a la foto impresa en el documento.`,
  };

  const intro = byKind[documentKind];
  if (documentKind === "idFront") {
    throw new Error("idFront requiere buildIdFrontPrompt con número de autorización");
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

  const promptText =
    documentKind === "idFront"
      ? buildIdFrontPrompt(normalizeIdentityDocumentNumberForCompare(options!.expectedIdDocumentNumber!.trim()))
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
    const b2Ok =
      documentKind === "licenseBack" ? bool(parsed.categoryB2VigenteLegible) : true;
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

    if (matchOk && legibleOk && qualityOk && b2Ok && allMet) {
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
      flags.categoryB2VigenteLegible = b2Ok;
    }
    logDiagnostic("Rechazo según modelo (respuesta JSON).", {
      documentKind,
      flags,
      userMessageEs: modelHint,
    });

    if (documentKind === "licenseBack" && matchOk && legibleOk && qualityOk && !b2Ok) {
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
