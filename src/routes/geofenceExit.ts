import { GeofenceExitRequestStatus } from "@prisma/client";
import { Router } from "express";
import { generateMixedId } from "../lib/generateMixedId.js";
import { sendGeofenceExitRequestToAnalystEmail } from "../lib/geofenceExitEmail.js";
import { prisma } from "../lib/prisma.js";
import { buildClientName } from "../lib/mapVehicleDelivery.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function parseRequiredCalendarDate(value: unknown): Date | null {
  if (typeof value !== "string" || !DATE_ONLY.test(value.trim())) {
    return null;
  }
  const d = new Date(`${value.trim()}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

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

    const fromDate = parseRequiredCalendarDate(requestedFrom);
    const untilDate = parseRequiredCalendarDate(requestedUntil);
    if (!fromDate) {
      res.status(400).json({ error: "Indica la fecha de salida (formato AAAA-MM-DD)" });
      return;
    }
    if (!untilDate) {
      res.status(400).json({ error: "Indica la fecha de regreso (formato AAAA-MM-DD)" });
      return;
    }
    if (untilDate.getTime() < fromDate.getTime()) {
      res.status(400).json({ error: "La fecha de regreso debe ser igual o posterior a la de salida" });
      return;
    }

    const pending = await prisma.geofenceExitRequest.findFirst({
      where: { userId: req.auth!.id, status: GeofenceExitRequestStatus.PENDING },
    });
    if (pending) {
      res.status(400).json({ error: "Ya tienes una solicitud pendiente de revisión" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.auth!.id },
      include: { identityExtraction: true },
    });

    const row = await prisma.geofenceExitRequest.create({
      data: {
        id: generateMixedId(),
        userId: req.auth!.id,
        reason: trimmedReason,
        destination: destination?.trim() || null,
        requestedFrom: fromDate,
        requestedUntil: untilDate,
      },
    });

    if (user) {
      void sendGeofenceExitRequestToAnalystEmail({
        clientName: buildClientName(user.identityExtraction, user.email),
        clientEmail: user.email,
        reason: trimmedReason,
        destination: destination?.trim() || null,
        requestedFrom: fromDate,
        requestedUntil: untilDate,
      }).catch((err) => {
        console.warn("[geofence-exit] No se pudo enviar aviso al analista:", err);
      });
    }

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
