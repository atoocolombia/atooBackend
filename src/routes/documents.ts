import { DocumentValidationStatus, Prisma } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import multer from "multer";
import fs from "node:fs/promises";
import { isDocumentKind, isValidationStatus } from "../lib/documentKinds.js";
import { generateMixedId } from "../lib/generateMixedId.js";
import { prisma } from "../lib/prisma.js";
import { createUserDocumentUploader, resolveStoredFile } from "../lib/uploadStorage.js";
import { applyDataTreatmentSignedAiReview, DATA_TREATMENT_DOCUMENT_PUBLIC_SELECT } from "../lib/applyDataTreatmentSignedAiReview.js";
import { applyIdentityDocAiReview, IDENTITY_DOC_AI_PUBLIC_SELECT } from "../lib/applyIdentityDocAiReview.js";
import {
  applyWorkAddressDocAiReview,
  WORK_ADDRESS_DOC_AI_PUBLIC_SELECT,
} from "../lib/applyWorkAddressDocAiReview.js";
import { applyJudicialDocAiReview, JUDICIAL_DOC_AI_PUBLIC_SELECT } from "../lib/applyJudicialDocAiReview.js";
import { isIdentityAiDocumentKind } from "../lib/identityDocumentKinds.js";
import { isJudicialAiDocumentKind } from "../lib/judicialDocumentKinds.js";
import { pruneWorkAddressExtractionAfterDocumentDelete } from "../lib/userWorkAddressExtraction.js";
import { documentMessage, platformMessage } from "../lib/userFacingMessage.js";
import { isWorkAddressAiDocumentKind } from "../lib/workAddressDocumentKinds.js";

export const documentsRouter = Router({ mergeParams: true });

const PDF_MAGIC = Buffer.from("%PDF");

function bufferLooksLikePdf(buf: Buffer): boolean {
  return buf.length >= 4 && buf.subarray(0, 4).equals(PDF_MAGIC);
}

async function unlinkQuiet(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch {
    /* ignore */
  }
}

const upload = createUserDocumentUploader();

function paramUserId(req: { params: Record<string, string | string[] | undefined> }): string {
  const v = req.params.userId;
  return Array.isArray(v) ? v[0] ?? "" : v ?? "";
}

function paramDocumentId(req: { params: Record<string, string | string[] | undefined> }): string {
  const v = req.params.documentId;
  return Array.isArray(v) ? v[0] ?? "" : v ?? "";
}

documentsRouter.get("/", async (req, res, next) => {
  try {
    const userId = paramUserId(req);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: "Usuario no encontrado" });
      return;
    }
    const docs = await prisma.document.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        documentKind: true,
        validationStatus: true,
        validationMessage: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
      },
    });
    res.json(docs);
  } catch (err) {
    next(err);
  }
});

documentsRouter.post("/", (req, res, next) => {
  upload.single("file")(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({
        error: documentMessage("El archivo supera el tamaño máximo permitido (15 MB)."),
      });
      return;
    }
    if (err) {
      const raw = err instanceof Error ? err.message : "";
      const looksLikeWrongFile = /Tipo de archivo no permitido|no permitido|LIMIT_UNEXPECTED_FILE/i.test(raw);
      res.status(400).json({
        error: looksLikeWrongFile
          ? documentMessage("Ese tipo de archivo no está permitido. Revisa el formato.")
          : platformMessage("No pudimos recibir el archivo. Inténtalo de nuevo más tarde."),
      });
      return;
    }
    void saveDocument(req, res, next);
  });
});

documentsRouter.post("/:documentId/judicial-ai-review", async (req, res, next) => {
  try {
    const userId = paramUserId(req);
    const documentId = paramDocumentId(req);

    const doc = await prisma.document.findFirst({
      where: { id: documentId, userId },
      select: JUDICIAL_DOC_AI_PUBLIC_SELECT,
    });

    if (!doc || !isJudicialAiDocumentKind(doc.documentKind)) {
      res.status(404).json({
        error: "Documento no encontrado o no corresponde a antecedentes (paso 4).",
      });
      return;
    }

    if (doc.validationStatus === DocumentValidationStatus.VALIDATED) {
      res.json(doc);
      return;
    }

    const result = await applyJudicialDocAiReview(documentId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

documentsRouter.post("/:documentId/work-address-ai-review", async (req, res, next) => {
  try {
    const userId = paramUserId(req);
    const documentId = paramDocumentId(req);

    const doc = await prisma.document.findFirst({
      where: { id: documentId, userId },
      select: WORK_ADDRESS_DOC_AI_PUBLIC_SELECT,
    });

    if (!doc || !isWorkAddressAiDocumentKind(doc.documentKind)) {
      res.status(404).json({
        error: "Documento no encontrado o no corresponde al paso 3 (apps y domicilio).",
      });
      return;
    }

    if (doc.validationStatus === DocumentValidationStatus.VALIDATED) {
      res.json(doc);
      return;
    }

    const result = await applyWorkAddressDocAiReview(documentId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

documentsRouter.post("/:documentId/identity-ai-review", async (req, res, next) => {
  try {
    const userId = paramUserId(req);
    const documentId = paramDocumentId(req);

    const doc = await prisma.document.findFirst({
      where: { id: documentId, userId },
      select: IDENTITY_DOC_AI_PUBLIC_SELECT,
    });

    if (!doc || !isIdentityAiDocumentKind(doc.documentKind)) {
      res.status(404).json({
        error: "Documento no encontrado o no corresponde a identificación (paso 2).",
      });
      return;
    }

    if (doc.validationStatus === DocumentValidationStatus.VALIDATED) {
      res.json(doc);
      return;
    }

    const result = await applyIdentityDocAiReview(documentId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

documentsRouter.post("/:documentId/data-treatment-ai-review", async (req, res, next) => {
  try {
    const userId = paramUserId(req);
    const documentId = paramDocumentId(req);

    const doc = await prisma.document.findFirst({
      where: { id: documentId, userId, documentKind: "dataTreatmentSigned" },
      select: DATA_TREATMENT_DOCUMENT_PUBLIC_SELECT,
    });

    if (!doc) {
      res.status(404).json({
        error: "Documento no encontrado o no corresponde a la autorización de datos firmada.",
      });
      return;
    }

    if (doc.validationStatus === DocumentValidationStatus.VALIDATED) {
      res.json(doc);
      return;
    }

    const result = await applyDataTreatmentSignedAiReview(documentId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

async function saveDocument(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = paramUserId(req);
    const file = req.file;
    const documentKindRaw = (req.body as { documentKind?: unknown }).documentKind;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      if (file?.path) {
        try {
          await fs.unlink(file.path);
        } catch {
          /* ignore */
        }
      }
      res.status(404).json({ error: "Usuario no encontrado" });
      return;
    }

    if (!file) {
      res.status(400).json({
        error: documentMessage("No llegó ningún archivo. Vuelve a seleccionar el archivo e inténtalo de nuevo."),
      });
      return;
    }

    if (!isDocumentKind(documentKindRaw)) {
      try {
        await fs.unlink(file.path);
      } catch {
        /* ignore */
      }
      res.status(400).json({
        error: documentMessage("El tipo de documento indicado no es válido. Actualiza la página e inténtalo de nuevo."),
      });
      return;
    }
    const documentKind = documentKindRaw;

    if (documentKind === "dataTreatmentSigned") {
      if (file.mimetype !== "application/pdf") {
        await unlinkQuiet(file.path);
        res.status(400).json({
          error: documentMessage("La autorización firmada debe ser un archivo PDF."),
        });
        return;
      }
      const pdfBuf = await fs.readFile(file.path);
      if (!bufferLooksLikePdf(pdfBuf)) {
        await unlinkQuiet(file.path);
        res.status(400).json({
          error: documentMessage("Ese archivo no es un PDF válido. Sube otro PDF."),
        });
        return;
      }
    }

    const storedPath = `${userId}/${file.filename}`;

    const existing = await prisma.document.findUnique({
      where: {
        userId_documentKind: { userId, documentKind },
      },
    });

    if (existing) {
      try {
        await fs.unlink(resolveStoredFile(existing.storedPath));
      } catch {
        /* ignore */
      }
      const updated = await prisma.document.update({
        where: { id: existing.id },
        data: {
          originalName: file.originalname.slice(0, 512),
          mimeType: file.mimetype,
          sizeBytes: file.size,
          storedPath,
          validationStatus: DocumentValidationStatus.PENDING,
          validationMessage: null,
        },
        select: {
          id: true,
          userId: true,
          documentKind: true,
          validationStatus: true,
          validationMessage: true,
          originalName: true,
          mimeType: true,
          sizeBytes: true,
          createdAt: true,
        },
      });
      if (documentKind === "dataTreatmentSigned") {
        const final = await applyDataTreatmentSignedAiReview(updated.id);
        res.status(200).json(final);
        return;
      }
      if (isIdentityAiDocumentKind(documentKind)) {
        const final = await applyIdentityDocAiReview(updated.id);
        res.status(200).json(final);
        return;
      }
      if (isWorkAddressAiDocumentKind(documentKind)) {
        const final = await applyWorkAddressDocAiReview(updated.id);
        res.status(200).json(final);
        return;
      }
      if (isJudicialAiDocumentKind(documentKind)) {
        const final = await applyJudicialDocAiReview(updated.id);
        res.status(200).json(final);
        return;
      }
      res.status(200).json(updated);
      return;
    }

    let doc = null;
    for (let attempt = 0; attempt < 15; attempt++) {
      try {
        doc = await prisma.document.create({
          data: {
            id: generateMixedId(),
            userId,
            documentKind,
            originalName: file.originalname.slice(0, 512),
            mimeType: file.mimetype,
            sizeBytes: file.size,
            storedPath,
          },
          select: {
            id: true,
            userId: true,
            documentKind: true,
            validationStatus: true,
            validationMessage: true,
            originalName: true,
            mimeType: true,
            sizeBytes: true,
            createdAt: true,
          },
        });
        break;
      } catch (err) {
        const isIdCollision =
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002" &&
          Array.isArray(err.meta?.target) &&
          (err.meta.target as string[]).includes("id");
        if (!isIdCollision || attempt === 14) {
          try {
            await fs.unlink(file.path);
          } catch {
            /* ignore */
          }
          throw err;
        }
      }
    }

    if (!doc) {
      try {
        await fs.unlink(file.path);
      } catch {
        /* ignore */
      }
      throw new Error("No se pudo generar id de documento");
    }

    if (documentKind === "dataTreatmentSigned") {
      const final = await applyDataTreatmentSignedAiReview(doc.id);
      res.status(201).json(final);
      return;
    }

    if (isIdentityAiDocumentKind(documentKind)) {
      const final = await applyIdentityDocAiReview(doc.id);
      res.status(201).json(final);
      return;
    }

    if (isWorkAddressAiDocumentKind(documentKind)) {
      const final = await applyWorkAddressDocAiReview(doc.id);
      res.status(201).json(final);
      return;
    }

    if (isJudicialAiDocumentKind(documentKind)) {
      const final = await applyJudicialDocAiReview(doc.id);
      res.status(201).json(final);
      return;
    }

    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
}

documentsRouter.patch("/:documentId/validation", async (req, res, next) => {
  try {
    const userId = paramUserId(req);
    const documentId = paramDocumentId(req);
    const body = req.body as { validationStatus?: unknown };

    if (!isValidationStatus(body.validationStatus)) {
      res.status(400).json({
        error: "validationStatus debe ser PENDING, VALIDATED o REJECTED",
      });
      return;
    }

    const doc = await prisma.document.findFirst({
      where: { id: documentId, userId },
    });
    if (!doc) {
      res.status(404).json({ error: "Documento no encontrado" });
      return;
    }

    const updated = await prisma.document.update({
      where: { id: documentId },
      data: { validationStatus: body.validationStatus },
      select: {
        id: true,
        userId: true,
        documentKind: true,
        validationStatus: true,
        validationMessage: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
      },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

documentsRouter.get("/:documentId/file", async (req, res, next) => {
  try {
    const userId = paramUserId(req);
    const documentId = paramDocumentId(req);
    const doc = await prisma.document.findFirst({
      where: { id: documentId, userId },
    });
    if (!doc) {
      res.status(404).json({ error: "Documento no encontrado" });
      return;
    }
    const abs = resolveStoredFile(doc.storedPath);
    res.setHeader("Content-Type", doc.mimeType);
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(doc.originalName)}`);
    res.sendFile(abs, (err) => {
      if (err && !res.headersSent) {
        next(err);
      }
    });
  } catch (err) {
    next(err);
  }
});

documentsRouter.delete("/:documentId", async (req, res, next) => {
  try {
    const userId = paramUserId(req);
    const documentId = paramDocumentId(req);
    const doc = await prisma.document.findFirst({
      where: { id: documentId, userId },
    });
    if (!doc) {
      res.status(404).json({ error: "Documento no encontrado" });
      return;
    }
    try {
      const abs = resolveStoredFile(doc.storedPath);
      await fs.unlink(abs);
    } catch {
      /* archivo ya borrado en disco */
    }
    await prisma.document.delete({ where: { id: documentId } });
    if (isWorkAddressAiDocumentKind(doc.documentKind)) {
      await pruneWorkAddressExtractionAfterDocumentDelete(userId, doc.documentKind);
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
