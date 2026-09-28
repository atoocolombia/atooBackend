import { randomBytes } from "node:crypto";
import fs from "node:fs";
import { Router } from "express";
import { TrainingVideoKind } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { resolveStoredFile } from "../lib/uploadStorage.js";
import {
  createTrainingVideoUploader,
  trainingVideoRelativePath,
} from "../lib/trainingVideoUpload.js";

export const adminTrainingVideosRouter = Router();

const upload = createTrainingVideoUploader();

function newId(): string {
  return randomBytes(12).toString("hex");
}

function mapAdminVideo(row: {
  id: string;
  title: string;
  description: string | null;
  kind: TrainingVideoKind;
  priceCop: number | null;
  sortOrder: number;
  published: boolean;
  mimeType: string;
  sizeBytes: number;
  originalName: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    kind: row.kind,
    priceCop: row.priceCop,
    sortOrder: row.sortOrder,
    published: row.published,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    originalName: row.originalName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

adminTrainingVideosRouter.get("/", async (_req, res, next) => {
  try {
    const rows = await prisma.trainingVideo.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] });
    res.json({ videos: rows.map(mapAdminVideo) });
  } catch (err) {
    next(err);
  }
});

adminTrainingVideosRouter.get("/purchases", async (_req, res, next) => {
  try {
    const rows = await prisma.trainingPurchase.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { email: true } },
        trainingVideo: { select: { title: true } },
      },
    });
    res.json({
      purchases: rows.map((p) => ({
        id: p.id,
        userId: p.userId,
        userEmail: p.user.email,
        trainingVideoId: p.trainingVideoId,
        videoTitle: p.trainingVideo.title,
        amountCop: p.amountCop,
        status: p.status,
        approvedAt: p.approvedAt?.toISOString() ?? null,
        createdAt: p.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

adminTrainingVideosRouter.post("/", (req, res, next) => {
  upload.single("file")(req, res, async (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : "Error al subir el video";
      res.status(400).json({ error: message });
      return;
    }
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: "Falta el archivo de video (campo file)" });
        return;
      }

      const title = String(req.body.title ?? "").trim();
      const description = String(req.body.description ?? "").trim() || null;
      const kindRaw = String(req.body.kind ?? "").toUpperCase();
      const published = req.body.published === "true" || req.body.published === true;

      if (!title) {
        res.status(400).json({ error: "El título es obligatorio" });
        return;
      }
      if (kindRaw !== "MANDATORY" && kindRaw !== "OPTIONAL") {
        res.status(400).json({ error: "kind debe ser MANDATORY u OPTIONAL" });
        return;
      }

      let priceCop: number | null = null;
      if (kindRaw === "OPTIONAL") {
        const price = Number(req.body.priceCop);
        if (!Number.isFinite(price) || price <= 0) {
          res.status(400).json({ error: "Indica un precio en COP mayor a 0 para capacitaciones opcionales" });
          return;
        }
        priceCop = Math.round(price);
      }

      const sortOrder = Number(req.body.sortOrder);
      const row = await prisma.trainingVideo.create({
        data: {
          id: newId(),
          title,
          description,
          kind: kindRaw as TrainingVideoKind,
          priceCop,
          sortOrder: Number.isFinite(sortOrder) ? Math.round(sortOrder) : 0,
          published,
          storedPath: trainingVideoRelativePath(file.filename),
          mimeType: file.mimetype,
          sizeBytes: file.size,
          originalName: file.originalname,
        },
      });

      res.status(201).json({ video: mapAdminVideo(row) });
    } catch (e) {
      next(e);
    }
  });
});

adminTrainingVideosRouter.patch("/:videoId", async (req, res, next) => {
  try {
    const { videoId } = req.params;
    const existing = await prisma.trainingVideo.findUnique({ where: { id: videoId } });
    if (!existing) {
      res.status(404).json({ error: "Video no encontrado" });
      return;
    }

    const data: {
      title?: string;
      description?: string | null;
      kind?: TrainingVideoKind;
      priceCop?: number | null;
      sortOrder?: number;
      published?: boolean;
    } = {};

    if (typeof req.body.title === "string" && req.body.title.trim()) {
      data.title = req.body.title.trim();
    }
    if ("description" in req.body) {
      data.description = req.body.description ? String(req.body.description).trim() : null;
    }
    if (typeof req.body.sortOrder === "number" || typeof req.body.sortOrder === "string") {
      const n = Number(req.body.sortOrder);
      if (Number.isFinite(n)) data.sortOrder = Math.round(n);
    }
    if (typeof req.body.published === "boolean") {
      data.published = req.body.published;
    }

    if (req.body.kind === "MANDATORY" || req.body.kind === "OPTIONAL") {
      data.kind = req.body.kind;
      if (req.body.kind === "MANDATORY") {
        data.priceCop = null;
      } else {
        const price = Number(req.body.priceCop ?? existing.priceCop);
        if (!Number.isFinite(price) || price <= 0) {
          res.status(400).json({ error: "Precio COP obligatorio para capacitaciones opcionales" });
          return;
        }
        data.priceCop = Math.round(price);
      }
    } else if (req.body.priceCop !== undefined && existing.kind === "OPTIONAL") {
      const price = Number(req.body.priceCop);
      if (!Number.isFinite(price) || price <= 0) {
        res.status(400).json({ error: "Precio COP inválido" });
        return;
      }
      data.priceCop = Math.round(price);
    }

    const updated = await prisma.trainingVideo.update({ where: { id: videoId }, data });
    res.json({ video: mapAdminVideo(updated) });
  } catch (err) {
    next(err);
  }
});

adminTrainingVideosRouter.patch("/purchases/:purchaseId/approve", async (req, res, next) => {
  try {
    const purchase = await prisma.trainingPurchase.findUnique({ where: { id: req.params.purchaseId } });
    if (!purchase) {
      res.status(404).json({ error: "Solicitud no encontrada" });
      return;
    }
    const updated = await prisma.trainingPurchase.update({
      where: { id: purchase.id },
      data: {
        status: "APPROVED",
        approvedAt: new Date(),
        approvedByUserId: req.auth!.id,
      },
    });
    res.json({
      purchase: {
        id: updated.id,
        status: updated.status,
        approvedAt: updated.approvedAt?.toISOString() ?? null,
      },
    });
  } catch (err) {
    next(err);
  }
});

adminTrainingVideosRouter.delete("/:videoId", async (req, res, next) => {
  try {
    const row = await prisma.trainingVideo.findUnique({ where: { id: req.params.videoId } });
    if (!row) {
      res.status(404).json({ error: "Video no encontrado" });
      return;
    }
    await prisma.trainingVideo.delete({ where: { id: row.id } });
    try {
      fs.unlinkSync(resolveStoredFile(row.storedPath));
    } catch {
      // archivo ya eliminado
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
