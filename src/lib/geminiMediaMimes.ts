import { GEMINI_IMAGE_MIMES } from "./geminiImageMimes.js";

export const GEMINI_VIDEO_MIMES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/3gpp",
]);

/** MIME admitidos para revisión con Gemini (imagen, PDF o video corto). */
export function inlineMimeForGeminiMedia(mimeType: string): string | null {
  if (mimeType === "application/pdf") return "application/pdf";
  if (GEMINI_IMAGE_MIMES.has(mimeType)) return mimeType;
  if (GEMINI_VIDEO_MIMES.has(mimeType)) return mimeType;
  if (mimeType.startsWith("video/")) return mimeType;
  return null;
}

export function isAllowedMobilityUploadMime(mimeType: string): boolean {
  return inlineMimeForGeminiMedia(mimeType) !== null;
}
