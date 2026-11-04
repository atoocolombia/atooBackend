import { DocumentValidationStatus } from "@prisma/client";
import {
  fixedPlatformDocumentKinds,
  isPlatformWorkDocumentKind,
} from "./platformWorkPhotoKinds.js";

export const DOCUMENT_KINDS = new Set([
  "dataTreatmentSigned",
  "idFront",
  "idBack",
  "idBothSides",
  "licenseFront",
  "licenseBack",
  "licenseBothSides",
  "selfieWhiteBackground",
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

for (const kind of fixedPlatformDocumentKinds()) {
  DOCUMENT_KINDS.add(kind);
}

export function isDocumentKind(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (DOCUMENT_KINDS.has(value)) return true;
  return isPlatformWorkDocumentKind(value);
}

export function isValidationStatus(value: unknown): value is DocumentValidationStatus {
  return (
    value === "PENDING" ||
    value === "VALIDATED" ||
    value === "REJECTED"
  );
}
