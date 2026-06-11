import { DocumentValidationStatus } from "@prisma/client";

export const DOCUMENT_KINDS = new Set([
  "dataTreatmentSigned",
  "idFront",
  "idBack",
  "licenseFront",
  "licenseBack",
  "selfieWhiteBackground",
  "platformWork1",
  "platformWork2",
  "platformWork3",
  "platformWork4",
  "bankDocument",
  "utilityAddressReceipt",
  "simitPazYSalvo",
  "policeCriminalRecord",
  "procuraduriaCriminalRecord",
  "cv",
  "rideHailProfile",
  "utilityBill",
  "reference1",
  "reference2",
  "familyReference",
]);

export function isDocumentKind(value: unknown): value is string {
  return typeof value === "string" && DOCUMENT_KINDS.has(value);
}

export function isValidationStatus(value: unknown): value is DocumentValidationStatus {
  return (
    value === "PENDING" ||
    value === "VALIDATED" ||
    value === "REJECTED"
  );
}
