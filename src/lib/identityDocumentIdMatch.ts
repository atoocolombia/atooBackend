/** Normaliza número de documento para comparar autorización vs identidad (cédulas, pasaporte). */
export function normalizeIdentityDocumentNumberForCompare(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  const noSpaces = s.replace(/\s+/g, "");
  const noThousandsDots = noSpaces.replace(/\.(?=\d)/g, "");
  return noThousandsDots.replace(/[^A-Za-z0-9\-]/g, "").toUpperCase();
}

export function identityDocumentNumbersMatch(expected: string, extracted: string): boolean {
  const a = normalizeIdentityDocumentNumberForCompare(expected);
  const b = normalizeIdentityDocumentNumberForCompare(extracted);
  if (!a || !b) return false;
  if (a === b) return true;
  const digitsA = a.replace(/\D/g, "");
  const digitsB = b.replace(/\D/g, "");
  if (digitsA.length >= 5 && digitsB.length >= 5 && digitsA === digitsB) return true;
  return false;
}
