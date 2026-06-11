import { DocumentValidationStatus, Prisma } from "@prisma/client";
import fs from "node:fs/promises";
import { prisma } from "./prisma.js";
import { resolveStoredFile } from "./uploadStorage.js";
import { platformMessage } from "./userFacingMessage.js";
import { syncUserIdentityExtractionFromDocuments } from "./syncUserIdentityExtraction.js";
import { verifyJudicialDocument } from "./verifyJudicialDocuments.js";
import { isJudicialAiDocumentKind } from "./judicialDocumentKinds.js";

function clip(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

const USER_READ_FAIL = platformMessage("No pudimos leer el archivo en el servidor. Inténtalo de nuevo más tarde.");

export const JUDICIAL_DOC_AI_PUBLIC_SELECT = {
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

export type JudicialDocAiPublic = Prisma.DocumentGetPayload<{
  select: typeof JUDICIAL_DOC_AI_PUBLIC_SELECT;
}>;

/** Lee el archivo, ejecuta IA del paso 4 (antecedentes) y persiste VALIDATED o REJECTED. */
export async function applyJudicialDocAiReview(documentId: string): Promise<JudicialDocAiPublic> {
  const meta = await prisma.document.findUnique({
    where: { id: documentId },
    select: { userId: true, storedPath: true, mimeType: true, documentKind: true },
  });
  if (!meta) {
    throw new Error("Documento no encontrado");
  }
  if (!isJudicialAiDocumentKind(meta.documentKind)) {
    throw new Error("Este documento no admite revisión automática del paso 4");
  }

  const canExtractIdentity =
    Boolean(process.env.GEMINI_API_KEY?.trim()) && process.env.DATA_TREATMENT_SKIP_AI_VERIFY !== "true";
  if (canExtractIdentity) {
    const row = await prisma.userIdentityExtraction.findUnique({ where: { userId: meta.userId } });
    const incomplete =
      !row?.idDocumentNumber?.trim() ||
      !row?.firstName?.trim() ||
      !row?.lastName?.trim();
    if (incomplete) {
      await syncUserIdentityExtractionFromDocuments(meta.userId);
    }
  }

  let buf: Buffer;
  try {
    buf = await fs.readFile(resolveStoredFile(meta.storedPath));
  } catch (readErr) {
    console.error("[judicial-docs-ai] readFile", meta.storedPath, readErr);
    return prisma.document.update({
      where: { id: documentId },
      data: {
        validationStatus: DocumentValidationStatus.REJECTED,
        validationMessage: USER_READ_FAIL,
      },
      select: JUDICIAL_DOC_AI_PUBLIC_SELECT,
    });
  }

  const identity = await prisma.userIdentityExtraction.findUnique({
    where: { userId: meta.userId },
  });

  const v = await verifyJudicialDocument(buf, meta.mimeType, meta.documentKind, {
    expectedIdDocumentNumber: identity?.idDocumentNumber?.trim() ?? null,
    expectedFirstName: identity?.firstName?.trim() ?? "",
    expectedLastName: identity?.lastName?.trim() ?? "",
  });

  const finalOk = v.ok;
  const rejectMessage = v.ok ? "" : v.message;

  return prisma.document.update({
    where: { id: documentId },
    data: {
      validationStatus: finalOk ? DocumentValidationStatus.VALIDATED : DocumentValidationStatus.REJECTED,
      validationMessage: finalOk ? null : clip(rejectMessage, 500),
    },
    select: JUDICIAL_DOC_AI_PUBLIC_SELECT,
  });
}
