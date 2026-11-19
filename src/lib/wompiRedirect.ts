import { resolvePublicClientOrigin } from "./clientPublicOrigin.js";

function parseOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function allowedRedirectOrigins(): Set<string> {
  const out = new Set<string>();
  for (const o of parseOrigins(process.env.CLIENT_ORIGIN)) {
    try {
      out.add(new URL(o).origin);
    } catch {
      /* ignore */
    }
  }
  const publicOrigin = resolvePublicClientOrigin();
  try {
    out.add(new URL(publicOrigin).origin);
  } catch {
    /* ignore */
  }
  const explicit = process.env.PUBLIC_APP_URL?.trim();
  if (explicit) {
    try {
      out.add(new URL(explicit.replace(/\/$/, "")).origin);
    } catch {
      /* ignore */
    }
  }
  return out;
}

/** Vuelve a la misma pantalla del cliente si el origen es confiable; si no, dashboard/pagos. */
export function resolveWompiRedirectUrl(requested: string | undefined): string {
  const fallback = `${resolvePublicClientOrigin()}/dashboard?view=payments&wompi=return`;
  const trimmed = requested?.trim();
  if (!trimmed) return fallback;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return fallback;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return fallback;
  if (!allowedRedirectOrigins().has(url.origin)) return fallback;

  return url.toString();
}