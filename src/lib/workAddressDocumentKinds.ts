import { allPlatformPhotoDocumentKinds, isPlatformWorkDocumentKind } from "./platformWorkPhotoKinds.js";

export const WORK_ADDRESS_AI_DOCUMENT_KINDS = new Set([
  ...allPlatformPhotoDocumentKinds(),
  "bankDocument",
  "creditReport",
  "utilityAddressReceipt",
]);

export function isWorkAddressAiDocumentKind(value: string): boolean {
  return WORK_ADDRESS_AI_DOCUMENT_KINDS.has(value);
}

export { isPlatformWorkDocumentKind };
