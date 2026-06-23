import { DocumentValidationStatus, Prisma } from "@prisma/client";
import fs from "node:fs/promises";
import { prisma } from "./prisma.js";
import { resolveStoredFile } from "./uploadStorage.js";
import { platformMessage } from "./userFacingMessage.js";
import { syncUserIdentityExtractionFromDocuments } from "./syncUserIdentityExtraction.js";
import {
  collectForbiddenAppKeys,
  mergePlatformMeta,
  pruneWorkAddressExtractionAfterDocumentDelete,
} from "./userWorkAddressExtraction.js";
import {
  verifyBankDocumentAgainstIdentity,
  verifyCreditReportAgainstIdentity,
  verifyPlatformWorkCapture,
  verifyUtilityReceiptAddress,
} from "./verifyWorkAddressDocuments.js";
import { isPlatformWorkDocumentKind, isWorkAddressAiDocumentKind } from "./workAddressDocumentKinds.js";

function clip(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

const USER_READ_FAIL = platformMessage("No pudimos leer el archivo en el servidor. Inténtalo de nuevo más tarde.");

export const WORK_ADDRESS_DOC_AI_PUBLIC_SELECT = {
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

export type WorkAddressDocAiPublic = Prisma.DocumentGetPayload<{
  select: typeof WORK_ADDRESS_DOC_AI_PUBLIC_SELECT;
}>;

/** Lee el archivo, ejecuta IA del paso 3 y persiste VALIDATED o REJECTED. */
export async function applyWorkAddressDocAiReview(documentId: string): Promise<WorkAddressDocAiPublic> {
  const meta = await prisma.document.findUnique({
    where: { id: documentId },
    select: { userId: true, storedPath: true, mimeType: true, documentKind: true },
  });
  if (!meta) {
    throw new Error("Documento no encontrado");
  }
  if (!isWorkAddressAiDocumentKind(meta.documentKind)) {
    throw new Error("Este documento no admite revisión automática del paso 3");
  }

  /** Si hay Gemini y nunca se extrajeron nombres, reintenta sync desde la cédula ya validada. */
  const canExtractIdentity =
    Boolean(process.env.GEMINI_API_KEY?.trim()) && process.env.DATA_TREATMENT_SKIP_AI_VERIFY !== "true";
  if (
    canExtractIdentity &&
    (isPlatformWorkDocumentKind(meta.documentKind) || meta.documentKind === "bankDocument")
  ) {
    const row = await prisma.userIdentityExtraction.findUnique({ where: { userId: meta.userId } });
    if (!row?.firstName?.trim() && !row?.lastName?.trim()) {
      await syncUserIdentityExtractionFromDocuments(meta.userId);
    }
  }

  let buf: Buffer;
  try {
    buf = await fs.readFile(resolveStoredFile(meta.storedPath));
  } catch (readErr) {
    console.error("[work-address-docs-ai] readFile", meta.storedPath, readErr);
    return prisma.document.update({
      where: { id: documentId },
      data: {
        validationStatus: DocumentValidationStatus.REJECTED,
        validationMessage: USER_READ_FAIL,
      },
      select: WORK_ADDRESS_DOC_AI_PUBLIC_SELECT,
    });
  }

  const identity = await prisma.userIdentityExtraction.findUnique({
    where: { userId: meta.userId },
  });

  const firstName = identity?.firstName?.trim() ?? "";
  const lastName = identity?.lastName?.trim() ?? "";
  const idDocumentNumber = identity?.idDocumentNumber?.trim() ?? null;

  let finalOk = false;
  let rejectMessage = "";

  if (isPlatformWorkDocumentKind(meta.documentKind)) {
    const extractionRow = await prisma.userWorkAddressExtraction.findUnique({
      where: { userId: meta.userId },
    });
    const forbidden = collectForbiddenAppKeys(extractionRow?.platformCapturesMeta ?? null, meta.documentKind);
    const v = await verifyPlatformWorkCapture(buf, meta.mimeType, {
      expectedFirstName: firstName,
      expectedLastName: lastName,
      forbiddenAppKeys: forbidden,
    });
    if (!v.ok) {
      rejectMessage = v.message;
    } else {
      finalOk = true;
      const merged = mergePlatformMeta(extractionRow?.platformCapturesMeta ?? null, meta.documentKind, v.extraction);
      await prisma.userWorkAddressExtraction.upsert({
        where: { userId: meta.userId },
        create: {
          userId: meta.userId,
          platformCapturesMeta: merged,
        },
        update: { platformCapturesMeta: merged },
      });
    }
  } else if (meta.documentKind === "bankDocument") {
    const v = await verifyBankDocumentAgainstIdentity(buf, meta.mimeType, {
      expectedFirstName: firstName,
      expectedLastName: lastName,
      expectedIdNumber: idDocumentNumber,
    });
    if (!v.ok) {
      rejectMessage = v.message;
    } else {
      finalOk = true;
      await prisma.userWorkAddressExtraction.upsert({
        where: { userId: meta.userId },
        create: {
          userId: meta.userId,
          bankHolderMatchesIdentity: v.extraction.matchesIdentity,
        },
        update: { bankHolderMatchesIdentity: v.extraction.matchesIdentity },
      });
    }
  } else if (meta.documentKind === "creditReport") {
    const v = await verifyCreditReportAgainstIdentity(buf, meta.mimeType, {
      expectedFirstName: firstName,
      expectedLastName: lastName,
    });
    if (!v.ok) {
      rejectMessage = v.message;
    } else {
      finalOk = true;
    }
  } else if (meta.documentKind === "utilityAddressReceipt") {
    const v = await verifyUtilityReceiptAddress(buf, meta.mimeType);
    if (!v.ok) {
      rejectMessage = v.message;
    } else {
      finalOk = true;
      await prisma.userWorkAddressExtraction.upsert({
        where: { userId: meta.userId },
        create: {
          userId: meta.userId,
          utilityServiceAddress: v.extraction.serviceAddressLine,
        },
        update: { utilityServiceAddress: v.extraction.serviceAddressLine },
      });
    }
  } else {
    rejectMessage = "Tipo de documento no soportado.";
  }

  if (!finalOk) {
    if (isPlatformWorkDocumentKind(meta.documentKind)) {
      await pruneWorkAddressExtractionAfterDocumentDelete(meta.userId, meta.documentKind);
    } else if (meta.documentKind === "bankDocument") {
      await prisma.userWorkAddressExtraction.updateMany({
        where: { userId: meta.userId },
        data: { bankHolderMatchesIdentity: null },
      });
    } else if (meta.documentKind === "utilityAddressReceipt") {
      await prisma.userWorkAddressExtraction.updateMany({
        where: { userId: meta.userId },
        data: { utilityServiceAddress: null },
      });
    }
  }

  return prisma.document.update({
    where: { id: documentId },
    data: {
      validationStatus: finalOk ? DocumentValidationStatus.VALIDATED : DocumentValidationStatus.REJECTED,
      validationMessage: finalOk ? null : clip(rejectMessage, 500),
    },
    select: WORK_ADDRESS_DOC_AI_PUBLIC_SELECT,
  });
}
