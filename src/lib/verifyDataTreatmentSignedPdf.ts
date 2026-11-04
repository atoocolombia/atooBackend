import { documentMessage, platformMessage } from "./userFacingMessage.js";
import { normalizeIdDocumentNumber } from "./clientPayments.js";
import {
  classifyGeminiError,
  extractJsonObjectFromModelText,
  generateContentWithModelChain,
  userMessageForGeminiFailure,
  type GeminiContentPart,
} from "./geminiChainedContent.js";

const MAX_PDF_BYTES = 12 * 1024 * 1024;

const LOG_PREFIX = "[data-treatment-ai]";

/** Textos cortos para el usuario (detalle técnico solo en consola del servidor). */
const USER = {
  pdfTooSmall: documentMessage("El PDF parece vacío o muy dañado. Prueba con otro archivo."),
  pdfTooBig: documentMessage("El archivo es demasiado grande (máx. 12 MB). Reduce el tamaño e inténtalo de nuevo."),
  aiUnavailable: platformMessage("No pudimos conectar con el servicio de revisión. Inténtalo de nuevo en unos minutos."),
  aiRejectedDoc: documentMessage(
    "No pudimos validar esta autorización. Comprueba que sea el PDF correcto, con cédula y firma legibles, e inténtalo de nuevo.",
  ),
  missingId: documentMessage("No pudimos leer tu número de documento en el PDF. Escríbelo de forma legible e inténtalo de nuevo."),
  missingDate: documentMessage("No pudimos leer la fecha de firma en el PDF. Asegúrate de que esté visible e inténtalo de nuevo."),
} as const;

export type DataTreatmentVerificationSuccess = {
  ok: true;
  idDocumentNumber: string;
  signedAt: Date;
};

export type DataTreatmentVerificationResult =
  | DataTreatmentVerificationSuccess
  | { ok: false; message: string };

const PROMPT = `Analiza este PDF (Colombia). Debe ser la autorización de tratamiento de datos personales / habeas data de atoo (no otro documento).

Evalúa con criterio realista para documentos escaneados o rellenados a mano:

1) documentIsAuthorization: ¿el contenido corresponde a una autorización de tratamiento de datos (no factura, contrato distinto, etc.)?
2) idNumberLooksComplete: ¿aparece un número de cédula o documento de identidad colombiano plausible (típicamente 6 a 10 dígitos) completado?
3) appearsSigned: ¿hay indicios claros de firma (firma manuscrita, imagen de firma, o sección de firma con contenido)?

Extrae también:
- idDocumentNumber: solo dígitos del documento de identidad del titular (sin puntos ni espacios). null si no se puede leer.
- signedDateIso: fecha en que firmó el titular, formato YYYY-MM-DD si es posible; null si no aparece.

Responde ÚNICAMENTE un JSON válido (sin markdown) con esta forma exacta:
{"documentIsAuthorization":boolean,"idNumberLooksComplete":boolean,"appearsSigned":boolean,"allRequirementsMet":boolean,"idDocumentNumber":string|null,"signedDateIso":string|null,"userMessageEs":"string breve en español si algo falla"}

allRequirementsMet debe ser true solo si las tres condiciones de validación son true Y idDocumentNumber tiene entre 6 y 10 dígitos Y signedDateIso es una fecha válida YYYY-MM-DD.`;

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

function parseSignedDateIso(raw: unknown): Date | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const m = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo, d, 12, 0, 0));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo || dt.getUTCDate() !== d) return null;
  return dt;
}

function parseIdFromModel(raw: unknown): string | null {
  if (raw == null) return null;
  const normalized = normalizeIdDocumentNumber(String(raw));
  if (normalized.length < 6 || normalized.length > 10) return null;
  return normalized;
}

/**
 * Verificación asistida por IA (Google Gemini).
 * No sustituye revisión legal humana.
 */
export async function verifyDataTreatmentSignedPdf(pdfBuffer: Buffer): Promise<DataTreatmentVerificationResult> {
  if (pdfBuffer.length < 400) {
    return { ok: false, message: USER.pdfTooSmall };
  }
  if (pdfBuffer.length > MAX_PDF_BYTES) {
    return { ok: false, message: USER.pdfTooBig };
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    if (process.env.DATA_TREATMENT_SKIP_AI_VERIFY === "true") {
      return {
        ok: true,
        idDocumentNumber: "1000000001",
        signedAt: new Date(),
      };
    }
    logDiagnostic("GEMINI_API_KEY no definida y DATA_TREATMENT_SKIP_AI_VERIFY distinto de true.");
    return { ok: false, message: USER.aiUnavailable };
  }

  const parts: GeminiContentPart[] = [
    {
      inlineData: {
        mimeType: "application/pdf",
        data: pdfBuffer.toString("base64"),
      },
    },
    { text: PROMPT },
  ];

  try {
    const { text } = await generateContentWithModelChain(apiKey, parts, LOG_PREFIX);
    const parsed = extractJsonObjectFromModelText(text);

    const docOk = bool(parsed.documentIsAuthorization);
    const idOk = bool(parsed.idNumberLooksComplete);
    const signedOk = bool(parsed.appearsSigned);
    const allMet = bool(parsed.allRequirementsMet);

    const idDocumentNumber = parseIdFromModel(parsed.idDocumentNumber);
    const signedAt = parseSignedDateIso(parsed.signedDateIso);

    if (docOk && idOk && signedOk && allMet && idDocumentNumber && signedAt) {
      return { ok: true, idDocumentNumber, signedAt };
    }

    const modelHint =
      typeof parsed.userMessageEs === "string" && parsed.userMessageEs.trim()
        ? parsed.userMessageEs.trim()
        : null;
    logDiagnostic("Rechazo según modelo (respuesta JSON).", {
      flags: {
        documentIsAuthorization: docOk,
        idNumberLooksComplete: idOk,
        appearsSigned: signedOk,
        allRequirementsMet: allMet,
        idDocumentNumber,
        signedDateIso: parsed.signedDateIso,
      },
      userMessageEs: modelHint,
    });

    if (!idDocumentNumber) {
      return { ok: false, message: USER.missingId };
    }
    if (!signedAt) {
      return { ok: false, message: USER.missingDate };
    }

    return { ok: false, message: USER.aiRejectedDoc };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const kind = classifyGeminiError(raw);
    logDiagnostic(`Fallo definitivo tras probar todos los modelos (${kind}).`, { message: raw, err });
    return { ok: false, message: platformMessage(userMessageForGeminiFailure(kind)) };
  }
}
