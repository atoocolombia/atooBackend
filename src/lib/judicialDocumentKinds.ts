export const JUDICIAL_AI_DOCUMENT_KINDS = new Set([
  "simitPazYSalvo",
  "policeCriminalRecord",
  "procuraduriaCriminalRecord",
]);

export function isJudicialAiDocumentKind(value: string): boolean {
  return JUDICIAL_AI_DOCUMENT_KINDS.has(value);
}
