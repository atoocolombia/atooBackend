import { DocumentValidationStatus, Prisma } from "@prisma/client";
import fs from "node:fs/promises";
import { prisma } from "./prisma.js";
import { resolveStoredFile } from "./uploadStorage.js";
import { verifyDataTreatmentSignedPdf } from "./verifyDataTreatmentSignedPdf.js";
import { documentMessage, platformMessage } from "./userFacingMessage.js";

const PDF_MAGIC = Buffer.from("%PDF");

function bufferLooksLikePdf(buf: Buffer): boolean {
  return buf.length >= 4 && buf.subarray(0, 4).equals(PDF_MAGIC);
}

function clip(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

const USER_PDF_EXPECTED = documentMessage("Ese archivo no es un PDF válido. Sube el documento en formato PDF.");
const USER_READ_FAIL = platformMessage("No pudimos leer el archivo en el servidor. Inténtalo de nuevo más tarde.");

export const DATA_TREATMENT_DOCUMENT_PUBLIC_SELECT = {
  id: true,
  userId: true,
  documentKind: true,
  validationStatus: true,
  validationMessage: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  createdAt: true,
} satisfies Prisma.DocumentSelect;

export type DataTreatmentDocumentPublic = Prisma.DocumentGetPayload<{
  select: typeof DATA_TREATMENT_DOCUMENT_PUBLIC_SELECT;
}>;

/** Lee el PDF guardado, ejecuta la IA y persiste VALIDATED o REJECTED. */
export async function applyDataTreatmentSignedAiReview(documentId: string): Promise<DataTreatmentDocumentPublic> {
  const meta = await prisma.document.findUnique({
    where: { id: documentId },
    select: { storedPath: true, mimeType: true },
  });
  if (!meta) {
    throw new Error("Documento no encontrado");
  }
  if (meta.mimeType !== "application/pdf") {
    return prisma.document.update({
      where: { id: documentId },
      data: {
        validationStatus: DocumentValidationStatus.REJECTED,
        validationMessage: USER_PDF_EXPECTED,
      },
      select: DATA_TREATMENT_DOCUMENT_PUBLIC_SELECT,
    });
  }

  let pdfBuf: Buffer;
  try {
    pdfBuf = await fs.readFile(resolveStoredFile(meta.storedPath));
  } catch (readErr) {
    console.error("[data-treatment-ai] readFile", meta.storedPath, readErr);
    return prisma.document.update({
      where: { id: documentId },
      data: {
        validationStatus: DocumentValidationStatus.REJECTED,
        validationMessage: USER_READ_FAIL,
      },
      select: DATA_TREATMENT_DOCUMENT_PUBLIC_SELECT,
    });
  }

  if (!bufferLooksLikePdf(pdfBuf)) {
    return prisma.document.update({
      where: { id: documentId },
      data: {
        validationStatus: DocumentValidationStatus.REJECTED,
        validationMessage: USER_PDF_EXPECTED,
      },
      select: DATA_TREATMENT_DOCUMENT_PUBLIC_SELECT,
    });
  }

  const verification = await verifyDataTreatmentSignedPdf(pdfBuf);
  return prisma.document.update({
    where: { id: documentId },
    data: {
      validationStatus: verification.ok
        ? DocumentValidationStatus.VALIDATED
        : DocumentValidationStatus.REJECTED,
      validationMessage: verification.ok ? null : clip(verification.message, 500),
    },
    select: DATA_TREATMENT_DOCUMENT_PUBLIC_SELECT,
  });
}
