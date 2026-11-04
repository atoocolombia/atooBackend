import {
  extractJsonObjectFromModelText,
  geminiErrorToUserFacing,
  generateContentWithModelChain,
  type GeminiContentPart,
} from "./geminiChainedContent.js";

const LOG_PREFIX = "[person-photo-compare]";

const GEMINI_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

function inlineMimeForGemini(mimeType: string): string | null {
  if (mimeType === "application/pdf") return "application/pdf";
  if (GEMINI_IMAGE_MIMES.has(mimeType)) return mimeType;
  return null;
}

function bool(v: unknown): boolean {
  return v === true;
}

function partFromBuffer(buf: Buffer, mimeType: string): GeminiContentPart | null {
  const mime = inlineMimeForGemini(mimeType);
  if (!mime) return null;
  return { inlineData: { mimeType: mime, data: buf.toString("base64") } };
}

const TWO_PHOTO_SAME_PERSON = `Hay DOS imágenes en este orden:
1) Foto del titular en un **documento de identidad** (cédula, pasaporte, etc.)
2) Foto del titular en otro documento o una **selfie**

¿Es **plausiblemente la misma persona** en ambas? (Iluminación y ángulo distintos son normales; busca coherencia facial razonable, no coincidencia de píxeles.)

Responde ÚNICAMENTE JSON válido:
{"samePerson":boolean,"userMessageEs":"string breve en español si falla"}`;

const THREE_PHOTO_SAME_PERSON = `Hay TRES imágenes en este orden:
1) Foto del titular en el **frente del documento de identidad**
2) Foto del titular en el **frente de la licencia de conducción colombiana**
3) **Selfie** del solicitante

1) samePersonAllThree: ¿es plausiblemente la **misma persona** en las tres?
2) distinctSelfieCapture: la selfie es una **toma distinta** y no un recorte o foto de pantalla de las fotos de los documentos.

Responde ÚNICAMENTE JSON válido:
{"samePersonAllThree":boolean,"distinctSelfieCapture":boolean,"userMessageEs":"string breve en español si falla"}`;

export async function compareTwoDocumentPhotosSamePerson(
  bufferA: Buffer,
  mimeA: string,
  bufferB: Buffer,
  mimeB: string,
  context: string,
): Promise<{ samePerson: boolean; userMessageEs: string | null } | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || process.env.DATA_TREATMENT_SKIP_AI_VERIFY === "true") {
    return { samePerson: true, userMessageEs: null };
  }
  const p1 = partFromBuffer(bufferA, mimeA);
  const p2 = partFromBuffer(bufferB, mimeB);
  if (!p1 || !p2) return null;

  try {
    const { text } = await generateContentWithModelChain(
      apiKey,
      [p1, p2, { text: TWO_PHOTO_SAME_PERSON }],
      LOG_PREFIX,
    );
    const parsed = extractJsonObjectFromModelText(text);
    const hint =
      typeof parsed.userMessageEs === "string" && parsed.userMessageEs.trim()
        ? parsed.userMessageEs.trim()
        : null;
    return { samePerson: bool(parsed.samePerson), userMessageEs: hint };
  } catch (err) {
    geminiErrorToUserFacing(err, LOG_PREFIX, context);
    return null;
  }
}

export async function compareIdentityLicenseSelfieSamePerson(
  identityBuffer: Buffer,
  identityMime: string,
  licenseBuffer: Buffer,
  licenseMime: string,
  selfieBuffer: Buffer,
  selfieMime: string,
): Promise<{ samePersonAllThree: boolean; distinctSelfieCapture: boolean; userMessageEs: string | null } | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || process.env.DATA_TREATMENT_SKIP_AI_VERIFY === "true") {
    return { samePersonAllThree: true, distinctSelfieCapture: true, userMessageEs: null };
  }
  const p1 = partFromBuffer(identityBuffer, identityMime);
  const p2 = partFromBuffer(licenseBuffer, licenseMime);
  const p3 = partFromBuffer(selfieBuffer, selfieMime);
  if (!p1 || !p2 || !p3) return null;

  try {
    const { text } = await generateContentWithModelChain(
      apiKey,
      [p1, p2, p3, { text: THREE_PHOTO_SAME_PERSON }],
      LOG_PREFIX,
    );
    const parsed = extractJsonObjectFromModelText(text);
    const hint =
      typeof parsed.userMessageEs === "string" && parsed.userMessageEs.trim()
        ? parsed.userMessageEs.trim()
        : null;
    return {
      samePersonAllThree: bool(parsed.samePersonAllThree),
      distinctSelfieCapture: bool(parsed.distinctSelfieCapture),
      userMessageEs: hint,
    };
  } catch (err) {
    geminiErrorToUserFacing(err, LOG_PREFIX, "compareIdentityLicenseSelfie");
    return null;
  }
}
