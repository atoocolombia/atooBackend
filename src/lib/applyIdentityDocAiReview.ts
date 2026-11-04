import { DocumentValidationStatus, Prisma } from "@prisma/client";
import fs from "node:fs/promises";
import { compareTwoDocumentPhotosSamePerson } from "./comparePersonPhotos.js";
import { prisma } from "./prisma.js";
import { resolveStoredFile } from "./uploadStorage.js";
import { verifyIdentityDocument } from "./verifyIdentityDocument.js";
import { platformMessage, documentMessage } from "./userFacingMessage.js";
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

async function loadValidatedDocumentBuffer(
  userId: string,
  documentKind: string,
): Promise<{ buf: Buffer; mimeType: string } | null> {
  const doc = await prisma.document.findFirst({
    where: { userId, documentKind, validationStatus: DocumentValidationStatus.VALIDATED },
    select: { storedPath: true, mimeType: true },
  });
  if (!doc) return null;
  try {
    const buf = await fs.readFile(resolveStoredFile(doc.storedPath));
    return { buf, mimeType: doc.mimeType };
  } catch {
    return null;
  }
}

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

  const identityRow = await prisma.userIdentityExtraction.findUnique({
    where: { userId: meta.userId },
    select: {
      idDocumentNumber: true,
      firstName: true,
      lastName: true,
      birthDate: true,
      bloodType: true,
      licenseDriverRestrictions: true,
    },
  });

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

  const verification = await verifyIdentityDocument(buf, meta.mimeType, meta.documentKind, {
    expectedIdDocumentNumber: identityRow?.idDocumentNumber,
    identityForLicense: identityRow
      ? {
          firstName: identityRow.firstName,
          lastName: identityRow.lastName,
          idDocumentNumber: identityRow.idDocumentNumber,
          birthDate: identityRow.birthDate,
          bloodType: identityRow.bloodType,
        }
      : null,
  });

  let finalOk = verification.ok;
  let rejectMessage = verification.ok ? "" : verification.message;
  let selfieComparison: SelfieIdentityComparison | undefined;

  if (verification.ok && meta.documentKind === "licenseFront") {
    const idFront = await loadValidatedDocumentBuffer(meta.userId, "idFront");
    if (!idFront) {
      finalOk = false;
      rejectMessage = documentMessage(
        "Primero debes subir y validar el frente de tu documento de identidad; después podremos revisar tu licencia.",
      );
    } else {
      const face = await compareTwoDocumentPhotosSamePerson(
        idFront.buf,
        idFront.mimeType,
        buf,
        meta.mimeType,
        "licenseFrontVsIdentityFront",
      );
      if (!face) {
        finalOk = false;
        rejectMessage = platformMessage(
          "No pudimos comparar la foto de la licencia con tu documento en este momento. Inténtalo de nuevo en unos minutos.",
        );
      } else if (!face.samePerson) {
        finalOk = false;
        rejectMessage = face.userMessageEs
          ? documentMessage(face.userMessageEs)
          : documentMessage(
              "La foto de la licencia no coincide de forma clara con la de tu documento de identidad. Verifica que sea tu licencia colombiana.",
            );
      }
    }
  }

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
    if (meta.documentKind === "idFront" && verification.ok && verification.identityFrontExtraction) {
      const ex = verification.identityFrontExtraction;
      const canonicalId =
        identityRow?.idDocumentNumber?.trim() ||
        ex.idDocumentNumber ||
        undefined;
      await prisma.userIdentityExtraction.upsert({
        where: { userId: meta.userId },
        create: {
          userId: meta.userId,
          firstName: ex.firstName,
          lastName: ex.lastName,
          birthDate: ex.birthDate,
          sex: ex.sex,
          bloodType: ex.bloodType,
          idDocumentNumber: canonicalId ?? null,
          identityPhotoDocumentId: documentId,
        },
        update: {
          firstName: ex.firstName ?? undefined,
          lastName: ex.lastName ?? undefined,
          birthDate: ex.birthDate ?? undefined,
          sex: ex.sex ?? undefined,
          bloodType: ex.bloodType ?? undefined,
          idDocumentNumber: canonicalId ?? undefined,
          identityPhotoDocumentId: documentId,
        },
      });
    }

    if (
      (meta.documentKind === "licenseFront" || meta.documentKind === "licenseBack") &&
      verification.ok &&
      verification.licenseFrontExtraction
    ) {
      const lic = verification.licenseFrontExtraction;
      const mergedRestrictions =
        lic.driverRestrictions?.trim() ||
        identityRow?.licenseDriverRestrictions?.trim() ||
        undefined;
      await prisma.userIdentityExtraction.upsert({
        where: { userId: meta.userId },
        create: {
          userId: meta.userId,
          licenseMatchesCedula: meta.documentKind === "licenseFront" ? true : undefined,
          licenseValidUntil: lic.licenseValidUntil,
          licenseDriverRestrictions: mergedRestrictions ?? null,
        },
        update: {
          ...(meta.documentKind === "licenseFront" ? { licenseMatchesCedula: true } : {}),
          ...(lic.licenseValidUntil ? { licenseValidUntil: lic.licenseValidUntil } : {}),
          ...(mergedRestrictions ? { licenseDriverRestrictions: mergedRestrictions } : {}),
        },
      });
    }

    if (finalOk && meta.documentKind === "licenseFront") {
      const selfieMeta = await prisma.document.findFirst({
        where: {
          userId: meta.userId,
          documentKind: "selfieWhiteBackground",
          validationStatus: DocumentValidationStatus.VALIDATED,
        },
        select: { id: true, storedPath: true, mimeType: true },
      });
      if (selfieMeta) {
        try {
          const selfieBuf = await fs.readFile(resolveStoredFile(selfieMeta.storedPath));
          const recheck = await verifySelfieAgainstIdentityDocument(meta.userId, selfieBuf, selfieMeta.mimeType);
          if (!recheck.ok) {
            await prisma.document.update({
              where: { id: selfieMeta.id },
              data: {
                validationStatus: DocumentValidationStatus.REJECTED,
                validationMessage: clip(recheck.message, 500),
              },
            });
          } else {
            selfieComparison = recheck.comparison;
          }
        } catch (e) {
          console.error("[identity-docs-ai] recheck selfie after license", e);
        }
      }
    }

    await syncUserIdentityExtractionFromDocuments(meta.userId, {
      selfieComparison,
      skipIdentityDocExtraction: meta.documentKind === "idFront",
    });
  }
  return updated;
}
