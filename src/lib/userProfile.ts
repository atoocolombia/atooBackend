/** Nombre legible a partir del correo cuando no hay extracción de identidad. */
export function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0]?.trim() ?? "";
  if (!local) return email;

  return (
    local
      .split(/[._-]+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ") || email
  );
}

export function buildUserDisplayName(
  email: string,
  firstName?: string | null,
  lastName?: string | null,
): string {
  const fn = firstName?.trim() ?? "";
  const ln = lastName?.trim() ?? "";
  const fromIdentity = `${fn} ${ln}`.trim();
  if (fromIdentity) return fromIdentity;
  return displayNameFromEmail(email);
}

export function buildUserInitials(displayName: string, email: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
  }
  if (parts.length === 1 && parts[0]!.length >= 2) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  const local = email.split("@")[0] ?? "U";
  return local.slice(0, 2).toUpperCase();
}

export type UserProfilePayload = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  initials: string;
  address: string;
  idDocumentNumber: string;
  phone: string;
};

export function mapUserToProfile(user: {
  id: string;
  email: string;
  identityExtraction?: {
    firstName: string | null;
    lastName: string | null;
    idDocumentNumber: string | null;
  } | null;
  workAddressExtraction?: {
    utilityServiceAddress: string | null;
  } | null;
}): UserProfilePayload {
  const firstName = user.identityExtraction?.firstName?.trim() ?? "";
  const lastName = user.identityExtraction?.lastName?.trim() ?? "";
  const displayName = buildUserDisplayName(user.email, firstName, lastName);

  return {
    id: user.id,
    email: user.email,
    firstName,
    lastName,
    displayName,
    initials: buildUserInitials(displayName, user.email),
    address: user.workAddressExtraction?.utilityServiceAddress?.trim() ?? "",
    idDocumentNumber: user.identityExtraction?.idDocumentNumber?.trim() ?? "",
    phone: "",
  };
}
