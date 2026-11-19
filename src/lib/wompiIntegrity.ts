import { createHash } from "node:crypto";

/** Firma checkout widget: reference + amountInCents + COP + [expiration] + secreto → SHA256 hex. */
export function buildWompiIntegritySignature(input: {
  reference: string;
  amountInCents: number;
  currency?: string;
  integritySecret: string;
  expirationTime?: string;
}): string {
  const currency = input.currency ?? "COP";
  const chain = input.expirationTime
    ? `${input.reference}${input.amountInCents}${currency}${input.expirationTime}${input.integritySecret}`
    : `${input.reference}${input.amountInCents}${currency}${input.integritySecret}`;
  return createHash("sha256").update(chain).digest("hex");
}

export function copToCents(amountCop: number): number {
  return Math.round(amountCop) * 100;
}