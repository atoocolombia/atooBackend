import { createHash } from "node:crypto";

function readPath(obj: unknown, path: string): string {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return "";
    cur = (cur as Record<string, unknown>)[part];
  }
  if (cur == null) return "";
  return String(cur);
}

/** Valida evento Wompi según docs (properties + timestamp + events secret). */
export function verifyWompiEventChecksum(
  body: {
    data?: unknown;
    signature?: { properties?: string[]; checksum?: string };
    timestamp?: number;
  },
  eventsSecret: string,
  headerChecksum: string | undefined,
): boolean {
  if (!eventsSecret.trim()) {
    console.warn("[wompi] WOMPI_EVENTS_SECRET no configurado; se omite validación de checksum");
    return true;
  }

  const expected = body.signature?.checksum ?? headerChecksum;
  if (!expected) return false;

  const props = body.signature?.properties ?? [];
  let chain = "";
  for (const prop of props) {
    chain += readPath(body.data, prop);
  }
  if (typeof body.timestamp === "number") {
    chain += String(body.timestamp);
  }
  chain += eventsSecret;

  const calculated = createHash("sha256").update(chain).digest("hex");
  return calculated === expected || calculated.toUpperCase() === expected.toUpperCase();
}