/** Formatos de imagen aceptados en subida y en Gemini (incluye HEIC de iPhone). */
export const GEMINI_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export function inlineMimeForGemini(mimeType: string): string | null {
  if (mimeType === "application/pdf") return "application/pdf";
  if (GEMINI_IMAGE_MIMES.has(mimeType)) return mimeType;
  return null;
}
