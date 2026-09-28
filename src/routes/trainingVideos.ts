import { randomBytes } from "node:crypto";
import fs from "node:fs";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { resolveStoredFile } from "../lib/uploadStorage.js";
import {
  mapTrainingVideoForClient,
  userCanStreamTrainingVideo,
} from "../lib/trainingVideoAccess.js";

export const trainingVideosRouter = Router();

function newId(): string {
  return randomBytes(12).toString("hex");
}

trainingVideosRouter.get("/", async (req, res, next) => {
  try {
    const userId = req.auth!.id;
    const videos = await prisma.trainingVideo.findMany({
      where: { published: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });
    const purchases = await prisma.trainingPurchase.findMany({
      where: { userId, trainingVideoId: { in: videos.map((v) => v.id) } },
    });
    const purchaseByVideo = new Map(purchases.map((p) => [p.trainingVideoId, p]));

    res.json({
      videos: videos.map((v) => mapTrainingVideoForClient(v, purchaseByVideo.get(v.id))),
    });
  } catch (err) {
    next(err);
  }
});

trainingVideosRouter.post("/:videoId/request-purchase", async (req, res, next) => {
  try {
    const userId = req.auth!.id;
    const video = await prisma.trainingVideo.findUnique({ where: { id: req.params.videoId } });
    if (!video || !video.published) {
      res.status(404).json({ error: "Capacitación no encontrada" });
      return;
    }
    if (video.kind !== "OPTIONAL") {
      res.status(400).json({ error: "Esta capacitación no requiere compra" });
      return;
    }
    if (!video.priceCop || video.priceCop <= 0) {
      res.status(400).json({ error: "Capacitación mal configurada (sin precio)" });
      return;
    }

    const existing = await prisma.trainingPurchase.findUnique({
      where: { userId_trainingVideoId: { userId, trainingVideoId: video.id } },
    });
    if (existing?.status === "APPROVED") {
      res.json({ purchase: { id: existing.id, status: existing.status }, alreadyApproved: true });
      return;
    }
    if (existing) {
      res.json({ purchase: { id: existing.id, status: existing.status }, alreadyRequested: true });
      return;
    }

    const purchase = await prisma.trainingPurchase.create({
      data: {
        id: newId(),
        userId,
        trainingVideoId: video.id,
        amountCop: video.priceCop,
        status: "PENDING",
      },
    });
    res.status(201).json({
      purchase: { id: purchase.id, status: purchase.status },
      message:
        "Recibimos tu solicitud. Realiza el pago según las instrucciones de atoo; un administrador activará el acceso al confirmarlo.",
    });
  } catch (err) {
    next(err);
  }
});

trainingVideosRouter.get("/:videoId/stream", async (req, res, next) => {
  try {
    const userId = req.auth!.id;
    const video = await prisma.trainingVideo.findUnique({ where: { id: req.params.videoId } });
    if (!video) {
      res.status(404).json({ error: "Video no encontrado" });
      return;
    }

    const purchase =
      video.kind === "OPTIONAL"
        ? await prisma.trainingPurchase.findUnique({
            where: { userId_trainingVideoId: { userId, trainingVideoId: video.id } },
          })
        : null;

    if (!userCanStreamTrainingVideo(video, purchase)) {
      res.status(403).json({ error: "No tienes acceso a este video" });
      return;
    }

    if (video.youtubeUrl) {
      res.status(400).json({ error: "Este video se reproduce desde YouTube en la app" });
      return;
    }

    if (!video.storedPath) {
      res.status(404).json({ error: "Archivo de video no disponible" });
      return;
    }

    const absolute = resolveStoredFile(video.storedPath);
    if (!fs.existsSync(absolute)) {
      res.status(404).json({ error: "Archivo de video no disponible" });
      return;
    }

    res.setHeader("Content-Type", video.mimeType ?? "video/mp4");
    res.setHeader("Accept-Ranges", "bytes");
    fs.createReadStream(absolute).pipe(res);
  } catch (err) {
    next(err);
  }
});
