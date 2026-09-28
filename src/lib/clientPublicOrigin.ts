const PRODUCTION_DEFAULT = "https://www.atoo.io";

function parseOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function isProductionAtooHost(origin: string): boolean {
  try {
    const host = new URL(origin).hostname.replace(/^www\./, "");
    return host === "atoo.io";
  } catch {
    return false;
  }
}

function isStagingOrLocal(origin: string): boolean {
  try {
    const url = new URL(origin);
    const host = url.hostname;
    if (/^localhost$/i.test(host) || host === "127.0.0.1") return true;
    if (/staging\.atoo\.io$/i.test(host)) return true;
    if (/\.vercel\.app$/i.test(host)) return true;
    return false;
  } catch {
    return true;
  }
}

/**
 * URL pública del frontend para enlaces en correos (admin, activación, entrega).
 * En producción prioriza www.atoo.io aunque CLIENT_ORIGIN liste staging primero.
 */
export function resolvePublicClientOrigin(): string {
  const explicit =
    process.env.PUBLIC_APP_URL?.trim() ||
    process.env.CLIENT_PUBLIC_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }

  const origins = parseOrigins(process.env.CLIENT_ORIGIN);
  const appEnv = (process.env.APP_ENV ?? "").trim().toLowerCase();
  const isProd = appEnv === "production" || process.env.NODE_ENV === "production";

  if (isProd) {
    const prod = origins.find((o) => isProductionAtooHost(o) && !isStagingOrLocal(o));
    if (prod) return prod;
    if (isProductionAtooHost(PRODUCTION_DEFAULT)) return PRODUCTION_DEFAULT;
  }

  const firstHttps = origins.find((o) => o.startsWith("https://") && !isStagingOrLocal(o));
  if (firstHttps) return firstHttps;

  const first = origins[0];
  if (first && !isStagingOrLocal(first)) return first;

  return PRODUCTION_DEFAULT;
}
