import { DocumentValidationStatus } from "@prisma/client";
import fs from "node:fs/promises";
import { prisma } from "./prisma.js";
import { resolveStoredFile } from "./uploadStorage.js";

const IDENTITY_FACE_KINDS = ["idFront", "idBothSides"] as const;

/** Frente de identidad validado (archivo separado o ambas caras en uno). */
export async function loadValidatedIdentityFaceDocument(
  userId: string,
): Promise<{ buf: Buffer; mimeType: string; documentKind: string } | null> {
  for (const documentKind of IDENTITY_FACE_KINDS) {
    const doc = await prisma.document.findFirst({
      where: { userId, documentKind, validationStatus: DocumentValidationStatus.VALIDATED },
      select: { storedPath: true, mimeType: true, documentKind: true },
    });
    if (!doc) continue;
    try {
      const buf = await fs.readFile(resolveStoredFile(doc.storedPath));
      return { buf, mimeType: doc.mimeType, documentKind: doc.documentKind };
    } catch {
      continue;
    }
  }
  return null;
}

export const LICENSE_FACE_KINDS = ["licenseFront", "licenseBothSides"] as const;

export async function loadValidatedLicenseFaceDocument(
  userId: string,
): Promise<{ buf: Buffer; mimeType: string } | null> {
  for (const documentKind of LICENSE_FACE_KINDS) {
    const doc = await prisma.document.findFirst({
      where: { userId, documentKind, validationStatus: DocumentValidationStatus.VALIDATED },
      select: { storedPath: true, mimeType: true },
    });
    if (!doc) continue;
    try {
      const buf = await fs.readFile(resolveStoredFile(doc.storedPath));
      return { buf, mimeType: doc.mimeType };
    } catch {
      continue;
    }
  }
  return null;
}

export function isIdentityDocumentComplete(
  byKind: Record<string, { validationStatus?: string } | undefined>,
): boolean {
  if (byKind.idBothSides?.validationStatus === "VALIDATED") return true;
  return (
    byKind.idFront?.validationStatus === "VALIDATED" &&
    byKind.idBack?.validationStatus === "VALIDATED"
  );
}

export function isLicenseDocumentComplete(
  byKind: Record<string, { validationStatus?: string } | undefined>,
): boolean {
  if (byKind.licenseBothSides?.validationStatus === "VALIDATED") return true;
  return (
    byKind.licenseFront?.validationStatus === "VALIDATED" &&
    byKind.licenseBack?.validationStatus === "VALIDATED"
  );
}
