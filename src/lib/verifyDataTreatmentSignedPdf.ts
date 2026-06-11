import { documentMessage, platformMessage } from "./userFacingMessage.js";
import { extractJsonObjectFromModelText, generateContentWithModelChain, type GeminiContentPart } from "./geminiChainedContent.js";

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
} as const;

export type DataTreatmentVerificationResult =
  | { ok: true }
  | { ok: false; message: string };

const PROMPT = `Analiza este PDF (Colombia). Debe tratarse de una autorización de tratamiento de datos personales / habeas data (no otro documento).

Evalúa con criterio realista para documentos escaneados o rellenados a mano:

1) documentIsAuthorization: ¿el contenido corresponde a una autorización de tratamiento de datos (no factura, contrato distinto, etc.)?
2) idNumberLooksComplete: ¿aparece un número de cédula o documento de identidad colombiano plausible (típicamente 6 a 10 dígitos) que parezca completado, no solo guiones o líneas en blanco?
3) appearsSigned: ¿hay indicios claros de firma (firma manuscrita, imagen de firma, o sección de firma con contenido) o texto que indique firma aceptada?

Responde ÚNICAMENTE un JSON válido (sin markdown, sin texto adicional) con esta forma exacta:
{"documentIsAuthorization":boolean,"idNumberLooksComplete":boolean,"appearsSigned":boolean,"allRequirementsMet":boolean,"userMessageEs":"string breve en español para el usuario si algo falla"}

allRequirementsMet debe ser true solo si las otras tres condiciones son true.`;

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

/**
 * Verificación asistida por IA (Google Gemini — capa gratuita con API key en AI Studio).
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
      return { ok: true };
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

    if (docOk && idOk && signedOk && allMet) {
      return { ok: true };
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
      },
      userMessageEs: modelHint,
    });

    return { ok: false, message: USER.aiRejectedDoc };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    logDiagnostic("Fallo definitivo tras probar todos los modelos.", { message: raw, err });

    if (/429|Too Many Requests|quota exceeded|Quota exceeded|RESOURCE_EXHAUSTED/i.test(raw)) {
      return { ok: false, message: USER.aiUnavailable };
    }
    if (/404|not found|not supported for generateContent|is not found/i.test(raw)) {
      return { ok: false, message: USER.aiUnavailable };
    }
    if (/API key|API_KEY_INVALID|401|PERMISSION_DENIED/i.test(raw)) {
      logDiagnostic("Revisa GEMINI_API_KEY en backend/.env (AI Studio).");
      return { ok: false, message: USER.aiUnavailable };
    }
    return { ok: false, message: USER.aiUnavailable };
  }
}
