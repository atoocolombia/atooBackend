export const WORK_ADDRESS_AI_DOCUMENT_KINDS = new Set([
  "platformWork1",
  "platformWork2",
  "platformWork3",
  "platformWork4",
  "bankDocument",
  "utilityAddressReceipt",
]);

export function isWorkAddressAiDocumentKind(value: string): boolean {
  return WORK_ADDRESS_AI_DOCUMENT_KINDS.has(value);
}

export function isPlatformWorkDocumentKind(value: string): boolean {
  return (
    value === "platformWork1" ||
    value === "platformWork2" ||
    value === "platformWork3" ||
    value === "platformWork4"
  );
}
