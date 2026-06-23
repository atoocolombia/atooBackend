/** Modelos retirados de la API v1beta (provocan 404 si se usan como GEMINI_MODEL). */
export const DEPRECATED_GEMINI_MODELS = new Set([
  "gemini-1.5-flash",
  "gemini-1.5-flash-latest",
  "gemini-1.5-flash-8b",
  "gemini-1.5-pro",
  "gemini-1.5-pro-latest",
]);

export const DEFAULT_GEMINI_MODEL_CHAIN = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
] as const;

export function resolveGeminiModelChain(logPrefix = "[gemini]"): string[] {
  const extra = process.env.GEMINI_MODEL_FALLBACKS?.trim();
  const fromEnv = extra
    ? extra
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const primary = process.env.GEMINI_MODEL?.trim();
  const defaults = [...DEFAULT_GEMINI_MODEL_CHAIN];

  if (primary && DEPRECATED_GEMINI_MODELS.has(primary)) {
    console.warn(
      `${logPrefix} GEMINI_MODEL="${primary}" ya no está disponible. Usa gemini-2.5-flash en Railway y elimina el valor obsoleto.`,
    );
  }

  const validPrimary = primary && !DEPRECATED_GEMINI_MODELS.has(primary) ? primary : null;
  const merged = validPrimary
    ? [validPrimary, ...defaults.filter((m) => m !== validPrimary), ...fromEnv.filter((m) => m !== validPrimary)]
    : [...defaults, ...fromEnv];

  return [...new Set(merged.filter((m) => !DEPRECATED_GEMINI_MODELS.has(m)))];
}
