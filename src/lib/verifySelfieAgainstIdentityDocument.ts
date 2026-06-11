import { DocumentValidationStatus } from "@prisma/client";
import fs from "node:fs/promises";
import { extractJsonObjectFromModelText, generateContentWithModelChain, type GeminiContentPart } from "./geminiChainedContent.js";
import { prisma } from "./prisma.js";
import { resolveStoredFile } from "./uploadStorage.js";
import { documentMessage, platformMessage } from "./userFacingMessage.js";

const LOG_PREFIX = "[selfie-identity-check]";

const GEMINI_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

function inlineMimeForGemini(mimeType: string): string | null {
  if (mimeType === "application/pdf") return "application/pdf";
  if (GEMINI_IMAGE_MIMES.has(mimeType)) return mimeType;
  return null;
}

function bool(v: unknown): boolean {
  return v === true;
}

const SELFIE_VS_IDENTITY_PROMPT = `Hay DOS archivos en este orden:
1) Frente de un **documento de identidad** colombiano (cédula de ciudadanía, cédula de extranjería, pasaporte u oficial equivalente) con **foto del titular** en el documento.
2) Una **selfie** enviada por la misma persona como parte de un trámite.

Evalúa con criterio realista (iluminación distinta, ángulo, distancia, calidad variable):

1) samePerson: ¿es **plausiblemente la misma persona** en el rostro del documento y en la selfie? (No exijas coincidencia exacta de píxeles; sí coherencia facial razonable.)

2) distinctCapture: ¿la selfie es claramente una **toma distinta** y no una **copia** de la foto del documento? Debe ser **false** si parece el mismo recorte, foto de pantalla del documento, escaneo reutilizado, o el mismo encuadre/plano que la foto impresa en el documento. Debe ser **true** si se ve como una captura típica de selfie (distancia, fondo, etc.) diferente a la miniatura del documento.

Responde ÚNICAMENTE un JSON válido (sin markdown, sin texto adicional) con esta forma exacta:
{"samePerson":boolean,"distinctCapture":boolean,"userMessageEs":"string breve en español si algo falla"}

Ambos deben ser true para considerar la selfie aceptable frente al documento.`;

const USER = {
  needIdFrontFirst: documentMessage(
    "Primero debes subir y validar el frente de tu documento de identidad; después podremos comparar tu selfie.",
  ),
  readIdFail: platformMessage("No pudimos leer el documento de identidad para comparar. Inténtalo de nuevo más tarde."),
  aiFail: platformMessage("No pudimos completar la comparación con tu selfie. Inténtalo de nuevo en unos minutos."),
  notSamePerson: documentMessage(
    "La selfie no coincide de forma clara con la foto de tu documento de identidad. Sube una selfie nítida, de frente, con buena luz.",
  ),
  duplicateOfId: documentMessage(
    "La selfie no puede ser la misma imagen o un recorte de la foto del documento. Toma una selfie nueva frente a la cámara (fondo claro).",
  ),
} as const;

export type SelfieIdentityComparison = {
  samePerson: boolean;
  distinctCapture: boolean;
};

/**
 * Compara la selfie con el frente del documento de identidad ya validado (misma persona, captura distinta).
 */
export async function compareSelfieWithIdentityFront(
  identityBuffer: Buffer,
  identityMime: string,
  selfieBuffer: Buffer,
  selfieMime: string,
): Promise<SelfieIdentityComparison | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || process.env.DATA_TREATMENT_SKIP_AI_VERIFY === "true") {
    return { samePerson: true, distinctCapture: true };
  }

  const idMime = inlineMimeForGemini(identityMime);
  const sMime = inlineMimeForGemini(selfieMime);
  if (!idMime || !sMime) {
    return null;
  }

  const parts: GeminiContentPart[] = [
    { inlineData: { mimeType: idMime, data: identityBuffer.toString("base64") } },
    { inlineData: { mimeType: sMime, data: selfieBuffer.toString("base64") } },
    { text: SELFIE_VS_IDENTITY_PROMPT },
  ];

  try {
    const { text } = await generateContentWithModelChain(apiKey, parts, LOG_PREFIX);
    const parsed = extractJsonObjectFromModelText(text);
    return {
      samePerson: bool(parsed.samePerson),
      distinctCapture: bool(parsed.distinctCapture),
    };
  } catch (err) {
    console.error(`${LOG_PREFIX} compareSelfieWithIdentityFront`, err);
    return null;
  }
}

export type VerifySelfieAgainstIdentityResult =
  | { ok: true; comparison: SelfieIdentityComparison }
  | { ok: false; message: string };

export async function verifySelfieAgainstIdentityDocument(
  userId: string,
  selfieBuffer: Buffer,
  selfieMime: string,
): Promise<VerifySelfieAgainstIdentityResult> {
  const idDoc = await prisma.document.findFirst({
    where: {
      userId,
      documentKind: "idFront",
      validationStatus: DocumentValidationStatus.VALIDATED,
    },
    select: { storedPath: true, mimeType: true },
  });

  if (!idDoc) {
    return { ok: false, message: USER.needIdFrontFirst };
  }

  let idBuf: Buffer;
  try {
    idBuf = await fs.readFile(resolveStoredFile(idDoc.storedPath));
  } catch {
    return { ok: false, message: USER.readIdFail };
  }

  const comparison = await compareSelfieWithIdentityFront(idBuf, idDoc.mimeType, selfieBuffer, selfieMime);
  if (!comparison) {
    return { ok: false, message: USER.aiFail };
  }

  if (!comparison.samePerson) {
    return { ok: false, message: USER.notSamePerson };
  }
  if (!comparison.distinctCapture) {
    return { ok: false, message: USER.duplicateOfId };
  }

  return { ok: true, comparison };
}
