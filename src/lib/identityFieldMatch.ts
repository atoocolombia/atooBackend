/** Comparación de campos entre documento de identidad ya extraído y licencia. */

export function normalizePersonName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ");
}

function nameTokens(value: string): string[] {
  return normalizePersonName(value).split(" ").filter(Boolean);
}

/** Coincidencia flexible (orden, segundo nombre, tildes). */
export function personNamesMatch(expected: string | null | undefined, extracted: string | null | undefined): boolean {
  const a = expected?.trim();
  const b = extracted?.trim();
  if (!a || !b) return false;
  const na = normalizePersonName(a);
  const nb = normalizePersonName(b);
  if (na === nb) return true;
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.length || !tb.length) return false;
  const setA = new Set(ta);
  const setB = new Set(tb);
  let overlap = 0;
  for (const t of setA) {
    if (setB.has(t)) overlap += 1;
  }
  const minLen = Math.min(setA.size, setB.size);
  return minLen > 0 && overlap >= minLen;
}

export function birthDatesMatch(
  expected: string | null | undefined,
  extracted: string | null | undefined,
): boolean {
  const a = expected?.trim().slice(0, 10);
  const b = extracted?.trim().slice(0, 10);
  if (!a || !b || a.length !== 10 || b.length !== 10) return false;
  return a === b;
}

function normalizeBloodType(raw: string): string {
  let s = raw.trim().toUpperCase().replace(/\s+/g, "").replace(/RH/gi, "");
  s = s.replace(/POSITIVO/g, "+").replace(/NEGATIVO/g, "-");
  if (s.endsWith("POS")) s = `${s.slice(0, -3)}+`;
  if (s.endsWith("NEG")) s = `${s.slice(0, -3)}-`;
  return s;
}

/** Si no hay tipo en identidad, no exige coincidencia (se puede completar desde licencia). */
export function bloodTypesMatch(
  expected: string | null | undefined,
  extracted: string | null | undefined,
): boolean {
  const exp = expected?.trim();
  const ext = extracted?.trim();
  if (!exp) return true;
  if (!ext) return false;
  const a = normalizeBloodType(exp);
  const b = normalizeBloodType(ext);
  if (a === b) return true;
  if (a.replace(/[^ABO+-]/g, "") === b.replace(/[^ABO+-]/g, "")) return true;
  return false;
}

export type IdentityRecordForLicenseMatch = {
  firstName: string | null;
  lastName: string | null;
  idDocumentNumber: string | null;
  birthDate: string | null;
  bloodType: string | null;
};

export function licenseDataMatchesIdentityRecord(
  identity: IdentityRecordForLicenseMatch,
  license: {
    firstName: string | null;
    lastName: string | null;
    idDocumentNumber: string | null;
    birthDate: string | null;
    bloodType: string | null;
  },
  idNumbersMatch: (a: string, b: string) => boolean,
): { ok: true } | { ok: false; reason: string } {
  if (!identity.firstName?.trim() || !identity.lastName?.trim() || !identity.idDocumentNumber?.trim()) {
    return { ok: false, reason: "missing_identity_profile" };
  }
  if (!identity.birthDate?.trim()) {
    return { ok: false, reason: "missing_identity_birth_date" };
  }
  if (!personNamesMatch(identity.firstName, license.firstName)) {
    return { ok: false, reason: "first_name_mismatch" };
  }
  if (!personNamesMatch(identity.lastName, license.lastName)) {
    return { ok: false, reason: "last_name_mismatch" };
  }
  if (
    !license.idDocumentNumber?.trim() ||
    !idNumbersMatch(identity.idDocumentNumber, license.idDocumentNumber)
  ) {
    return { ok: false, reason: "id_number_mismatch" };
  }
  if (!birthDatesMatch(identity.birthDate, license.birthDate)) {
    return { ok: false, reason: "birth_date_mismatch" };
  }
  if (!bloodTypesMatch(identity.bloodType, license.bloodType)) {
    return { ok: false, reason: "blood_type_mismatch" };
  }
  return { ok: true };
}
