export const IDENTITY_AI_DOCUMENT_KINDS = new Set([
  "idFront",
  "idBack",
  "idBothSides",
  "licenseFront",
  "licenseBack",
  "licenseBothSides",
  "selfieWhiteBackground",
]);

export function isIdentityAiDocumentKind(value: string): boolean {
  return IDENTITY_AI_DOCUMENT_KINDS.has(value);
}
