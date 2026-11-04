import { DocumentValidationStatus } from "@prisma/client";

export const DOCUMENT_KINDS = new Set([
  "dataTreatmentSigned",
  "idFront",
  "idBack",
  "idBothSides",
  "licenseFront",
  "licenseBack",
  "licenseBothSides",
  "selfieWhiteBackground",
  "platformWork1",
  "platformWork1Photo2",
  "platformWork1Photo3",
  "platformWork1Photo4",
  "platformWork2",
  "platformWork2Photo2",
  "platformWork2Photo3",
  "platformWork2Photo4",
  "platformWork3",
  "platformWork3Photo2",
  "platformWork3Photo3",
  "platformWork3Photo4",
  "platformWork4",
  "bankDocument",
  "creditReport",
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
