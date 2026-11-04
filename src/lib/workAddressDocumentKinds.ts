import { isPlatformWorkDocumentKind } from "./platformWorkPhotoKinds.js";

export function isWorkAddressAiDocumentKind(value: string): boolean {
  if (
    value === "bankDocument" ||
    value === "creditReport" ||
    value === "utilityAddressReceipt"
  ) {
    return true;
  }
  return isPlatformWorkDocumentKind(value);
}

export { isPlatformWorkDocumentKind };
