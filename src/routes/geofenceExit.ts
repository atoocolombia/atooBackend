import { GeofenceExitRequestStatus } from "@prisma/client";
import { Router } from "express";
import { generateMixedId } from "../lib/generateMixedId.js";
import { prisma } from "../lib/prisma.js";
import { buildClientName } from "../lib/mapVehicleDelivery.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const clientGeofenceRouter = Router();

clientGeofenceRouter.use(requireAuth, requireRole("USER", "ADMIN"));

clientGeofenceRouter.get("/requests", async (req, res, next) => {
  try {
    const rows = await prisma.geofenceExitRequest.findMany({
      where: { userId: req.auth!.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    res.json({ requests: rows });
  } catch (err) {
    next(err);
  }
});

clientGeofenceRouter.post("/requests", async (req, res, next) => {
  try {
    const { reason, destination, requestedFrom, requestedUntil } = req.body as {
      reason?: string;
      destination?: string;
      requestedFrom?: string;
      requestedUntil?: string;
    };
    const trimmedReason = reason?.trim();
    if (!trimmedReason) {
      res.status(400).json({ error: "Indica el motivo de la salida de geocerca" });
      return;
    }

    const pending = await prisma.geofenceExitRequest.findFirst({
      where: { userId: req.auth!.id, status: GeofenceExitRequestStatus.PENDING },
    });
    if (pending) {
      res.status(400).json({ error: "Ya tienes una solicitud pendiente de revisión" });
      return;
    }

    const row = await prisma.geofenceExitRequest.create({
      data: {
        id: generateMixedId(),
        userId: req.auth!.id,
        reason: trimmedReason,
        destination: destination?.trim() || null,
        requestedFrom: requestedFrom ? new Date(requestedFrom) : null,
        requestedUntil: requestedUntil ? new Date(requestedUntil) : null,
      },
    });
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

export const analystGeofenceRouter = Router();

analystGeofenceRouter.use(requireAuth, requireRole("ANALYST", "ADMIN"));

analystGeofenceRouter.get("/requests", async (req, res, next) => {
  try {
    const status =
      typeof req.query.status === "string"
        ? (req.query.status as GeofenceExitRequestStatus)
        : GeofenceExitRequestStatus.PENDING;
    const rows = await prisma.geofenceExitRequest.findMany({
      where: { status },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { user: { include: { identityExtraction: true } } },
    });
    res.json({
      requests: rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        clientName: buildClientName(row.user.identityExtraction, row.user.email),
        email: row.user.email,
        status: row.status,
        reason: row.reason,
        destination: row.destination,
        requestedFrom: row.requestedFrom?.toISOString() ?? null,
        requestedUntil: row.requestedUntil?.toISOString() ?? null,
        reviewNotes: row.reviewNotes,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

analystGeofenceRouter.patch("/requests/:requestId", async (req, res, next) => {
  try {
    const { status, reviewNotes } = req.body as {
      status?: GeofenceExitRequestStatus;
      reviewNotes?: string;
    };
    if (!status || !["APPROVED", "REJECTED", "CANCELLED"].includes(status)) {
      res.status(400).json({ error: "Estado inválido" });
      return;
    }
    const row = await prisma.geofenceExitRequest.update({
      where: { id: req.params.requestId },
      data: {
        status,
        reviewNotes: reviewNotes?.trim() || null,
        reviewedByUserId: req.auth!.id,
      },
    });
    res.json(row);
  } catch (err) {
    next(err);
  }
});
