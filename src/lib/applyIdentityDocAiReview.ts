import { DocumentValidationStatus, Prisma } from "@prisma/client";
import fs from "node:fs/promises";
import { prisma } from "./prisma.js";
import { resolveStoredFile } from "./uploadStorage.js";
import { verifyIdentityDocument } from "./verifyIdentityDocument.js";
import { platformMessage } from "./userFacingMessage.js";
import { isIdentityAiDocumentKind } from "./identityDocumentKinds.js";
import { syncUserIdentityExtractionFromDocuments } from "./syncUserIdentityExtraction.js";
import type { SelfieIdentityComparison } from "./verifySelfieAgainstIdentityDocument.js";
import { verifySelfieAgainstIdentityDocument } from "./verifySelfieAgainstIdentityDocument.js";

function clip(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

const USER_READ_FAIL = platformMessage("No pudimos leer el archivo en el servidor. Inténtalo de nuevo más tarde.");

export const IDENTITY_DOC_AI_PUBLIC_SELECT = {
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

export type IdentityDocAiPublic = Prisma.DocumentGetPayload<{
  select: typeof IDENTITY_DOC_AI_PUBLIC_SELECT;
}>;

/** Lee el archivo guardado, ejecuta la IA y persiste VALIDATED o REJECTED (paso 2 — identificación). */
export async function applyIdentityDocAiReview(documentId: string): Promise<IdentityDocAiPublic> {
  const meta = await prisma.document.findUnique({
    where: { id: documentId },
    select: { userId: true, storedPath: true, mimeType: true, documentKind: true },
  });
  if (!meta) {
    throw new Error("Documento no encontrado");
  }
  if (!isIdentityAiDocumentKind(meta.documentKind)) {
    throw new Error("Este documento no admite revisión automática de identificación");
  }

  let buf: Buffer;
  try {
    buf = await fs.readFile(resolveStoredFile(meta.storedPath));
  } catch (readErr) {
    console.error("[identity-docs-ai] readFile", meta.storedPath, readErr);
    return prisma.document.update({
      where: { id: documentId },
      data: {
        validationStatus: DocumentValidationStatus.REJECTED,
        validationMessage: USER_READ_FAIL,
      },
      select: IDENTITY_DOC_AI_PUBLIC_SELECT,
    });
  }

  const verification = await verifyIdentityDocument(buf, meta.mimeType, meta.documentKind);

  let finalOk = verification.ok;
  let rejectMessage = verification.ok ? "" : verification.message;
  let selfieComparison: SelfieIdentityComparison | undefined;

  if (verification.ok && meta.documentKind === "selfieWhiteBackground") {
    const selfieCheck = await verifySelfieAgainstIdentityDocument(meta.userId, buf, meta.mimeType);
    if (!selfieCheck.ok) {
      finalOk = false;
      rejectMessage = selfieCheck.message;
    } else {
      selfieComparison = selfieCheck.comparison;
    }
  }

  const updated = await prisma.document.update({
    where: { id: documentId },
    data: {
      validationStatus: finalOk ? DocumentValidationStatus.VALIDATED : DocumentValidationStatus.REJECTED,
      validationMessage: finalOk ? null : clip(rejectMessage, 500),
    },
    select: IDENTITY_DOC_AI_PUBLIC_SELECT,
  });
  if (finalOk) {
    await syncUserIdentityExtractionFromDocuments(meta.userId, { selfieComparison });
  }
  return updated;
}
