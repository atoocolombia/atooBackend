import { documentMessage, platformMessage } from "./userFacingMessage.js";
import {
  classifyGeminiError,
  extractJsonObjectFromModelText,
  generateContentWithModelChain,
  userMessageForGeminiFailure,
  type GeminiContentPart,
} from "./geminiChainedContent.js";
import { inlineMimeForGemini } from "./geminiImageMimes.js";
import { isIdentityAiDocumentKind } from "./identityDocumentKinds.js";

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
} as const;

export type IdentityDocumentVerificationResult =
  | { ok: true }
  | { ok: false; message: string };

function bool(v: unknown): boolean {
  return v === true;
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
    idFront: `Analiza este archivo (Colombia). Debe ser la cara FRONTAL (anverso) de un **documento de identidad válido en Colombia**: cédula de ciudadanía, **cédula de extranjería**, **pasaporte** u otro documento oficial equivalente con foto y datos del titular. No debe ser el reverso de ese documento, ni una licencia de conducir usada como identificación, ni una selfie aislada, ni un objeto que no sea documento de identidad.`,
    idBack: `Analiza este archivo (Colombia). Debe ser el **reverso** del mismo tipo de **documento de identidad** (cédula de ciudadanía, cédula de extranjería, pasaporte u oficial equivalente): suele verse huella, código, texto legal o datos adicionales según el tipo. No debe ser el frente del documento ni una licencia de conducir.`,
    licenseFront: `Analiza este archivo (Colombia). Debe ser la cara FRONTAL de una licencia de conducción colombiana vigente o equivalente. No debe ser solo el documento de identidad ni el reverso de la licencia.`,
    licenseBack: `Analiza este archivo (Colombia). Debe ser el REVERSO del pase o licencia de conducción colombiana (donde suelen figurar las categorías autorizadas y su estado). No debe ser el frente de la licencia ni el documento de identidad.

Requisito obligatorio para aprobar: en ese reverso debe poder leerse la categoría **B2** y que conste como **vigente** (según la forma en que el documento colombiano muestre categorías y vigencia).`,
    selfieWhiteBackground: `Analiza esta imagen. Debe ser una **selfie** tomada con la cámara (no una foto del documento de identidad en pantalla ni un recorte de la foto del documento). La persona debe verse de frente o tres cuartos, con fondo blanco o muy claro y buena iluminación. Esta imagen se comparará con la **foto del titular en el frente del documento de identidad** ya validado: debe ser la **misma persona** pero una **toma claramente distinta** a la foto impresa en el documento.`,
  };

  const intro = byKind[documentKind];
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

  const parts: GeminiContentPart[] = [
    {
      inlineData: {
        mimeType: inlineMime,
        data: buffer.toString("base64"),
      },
    },
    { text: buildPrompt(documentKind) },
  ];

  try {
    const { text } = await generateContentWithModelChain(apiKey, parts, LOG_PREFIX);
    const parsed = extractJsonObjectFromModelText(text);

    const matchOk = bool(parsed.matchesRequestedDocument);
    const legibleOk = bool(parsed.mainIdentifiersLegible);
    const qualityOk = bool(parsed.qualityAcceptableForReview);
    const b2Ok =
      documentKind === "licenseBack" ? bool(parsed.categoryB2VigenteLegible) : true;
    const allMet = bool(parsed.allRequirementsMet);

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
    const raw = err instanceof Error ? err.message : String(err);
    const kind = classifyGeminiError(raw);
    logDiagnostic(`Fallo definitivo tras probar todos los modelos (${kind}).`, { message: raw, err });
    return { ok: false, message: platformMessage(userMessageForGeminiFailure(kind)) };
  }
}
