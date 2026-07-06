import { InspectionAppointmentStatus, UserType } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { generateMixedId } from "../lib/generateMixedId.js";
import {
  mapAvailabilitySlot,
  mapInspectionAppointment,
} from "../lib/inspectionAppointmentMapper.js";
import { prisma } from "../lib/prisma.js";
import { UPLOAD_ROOT, resolveStoredFile } from "../lib/uploadStorage.js";

export const inspectionsRouter = Router({ mergeParams: true });

function paramUserId(req: Request): string {
  const v = req.params.userId;
  return Array.isArray(v) ? v[0] ?? "" : v ?? "";
}

const proofUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      try {
        const userId = paramUserId(req);
        if (!/^[A-Za-z0-9]+$/.test(userId)) {
          cb(new Error("userId inválido"), UPLOAD_ROOT);
          return;
        }
        const dir = path.join(UPLOAD_ROOT, userId, "inspection-proofs");
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      } catch (e) {
        cb(e as Error, UPLOAD_ROOT);
      }
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || "";
      cb(null, `${Date.now()}-${generateMixedId().slice(0, 8)}${ext}`);
    },
  }),
  limits: { fileSize: Number(process.env.UPLOAD_MAX_BYTES ?? 15 * 1024 * 1024) },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ]);
    if (allowed.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Formato no permitido. Usa JPG, PNG, WEBP o PDF."));
    }
  },
});

async function requireClientUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, userType: true },
  });
}

inspectionsRouter.get("/vehicle-plan", async (req, res, next) => {
  try {
    const userId = paramUserId(req);
    const user = await requireClientUser(userId);
    if (!user) {
      res.status(404).json({ error: "Usuario no encontrado" });
      return;
    }

    const plan = await prisma.clientVehiclePlan.findUnique({ where: { userId } });
    if (!plan) {
      res.json(null);
      return;
    }

    res.json({
      vehicleName: plan.vehicleName,
      vin: plan.vin,
      deliveredAt: plan.deliveredAt.toISOString(),
      nextInspectionDueAt: plan.nextInspectionDueAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

inspectionsRouter.get("/workshops", async (req, res, next) => {
  try {
    const userId = paramUserId(req);
    const user = await requireClientUser(userId);
    if (!user) {
      res.status(404).json({ error: "Usuario no encontrado" });
      return;
    }

    const workshops = await prisma.workshop.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      include: {
        slots: {
          where: {
            date: { gte: new Date().toISOString().slice(0, 10) },
          },
          orderBy: [{ date: "asc" }, { startTime: "asc" }],
          take: 30,
        },
      },
    });

    res.json(
      workshops.map((w) => ({
        id: w.id,
        name: w.name,
        address: w.address,
        city: w.city,
        phone: w.phone,
        latitude: w.latitude,
        longitude: w.longitude,
        upcomingSlots: w.slots.map(mapAvailabilitySlot),
      })),
    );
  } catch (err) {
    next(err);
  }
});

inspectionsRouter.get("/workshops/:workshopId/slots", async (req, res, next) => {
  try {
    const userId = paramUserId(req);
    const workshopId = String(req.params.workshopId ?? "");
    const user = await requireClientUser(userId);
    if (!user) {
      res.status(404).json({ error: "Usuario no encontrado" });
      return;
    }

    const from = typeof req.query.from === "string" ? req.query.from : new Date().toISOString().slice(0, 10);

    const slots = await prisma.workshopAvailabilitySlot.findMany({
      where: {
        workshopId,
        date: { gte: from },
        workshop: { active: true },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });

    res.json(slots.map(mapAvailabilitySlot).filter((s) => s.remainingCapacity > 0));
  } catch (err) {
    next(err);
  }
});

inspectionsRouter.get("/appointments", async (req, res, next) => {
  try {
    const userId = paramUserId(req);
    const user = await requireClientUser(userId);
    if (!user) {
      res.status(404).json({ error: "Usuario no encontrado" });
      return;
    }

    const rows = await prisma.inspectionAppointment.findMany({
      where: { userId },
      orderBy: [{ appointmentDate: "asc" }, { createdAt: "desc" }],
      include: {
        workshop: { select: { name: true, address: true, city: true } },
      },
    });

    res.json(rows.map(mapInspectionAppointment));
  } catch (err) {
    next(err);
  }
});

inspectionsRouter.post("/appointments", (req, res, next) => {
  proofUpload.single("proof")(req, res, async (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : "Error al subir archivo";
      res.status(400).json({ error: message });
      return;
    }

    try {
      const userId = paramUserId(req);
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, userType: true },
      });
      if (!user) {
        res.status(404).json({ error: "Usuario no encontrado" });
        return;
      }
      if (user.userType !== UserType.USER) {
        res.status(403).json({ error: "Solo clientes pueden solicitar citas" });
        return;
      }

      const body = req.body as {
        workshopId?: string;
        appointmentDate?: string;
        appointmentTime?: string;
        reason?: string;
      };

      const workshopId = body.workshopId?.trim();
      const appointmentDate = body.appointmentDate?.trim();
      const appointmentTime = body.appointmentTime?.trim() || null;
      const reason = body.reason?.trim();

      if (!workshopId || !appointmentDate || !reason) {
        res.status(400).json({ error: "Taller, fecha y motivo son obligatorios" });
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(appointmentDate)) {
        res.status(400).json({ error: "Fecha inválida (usa YYYY-MM-DD)" });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: "Debes adjuntar una prueba o soporte (imagen o PDF)" });
        return;
      }

      const workshop = await prisma.workshop.findFirst({
        where: { id: workshopId, active: true },
      });
      if (!workshop) {
        res.status(404).json({ error: "Taller no encontrado" });
        return;
      }

      const slot = appointmentTime
        ? await prisma.workshopAvailabilitySlot.findFirst({
            where: {
              workshopId,
              date: appointmentDate,
              startTime: appointmentTime,
            },
          })
        : await prisma.workshopAvailabilitySlot.findFirst({
            where: { workshopId, date: appointmentDate },
            orderBy: { startTime: "asc" },
          });

      if (!slot) {
        res.status(400).json({ error: "El taller no tiene disponibilidad en esa fecha y horario" });
        return;
      }
      if (slot.bookedCount >= slot.maxAppointments) {
        res.status(400).json({ error: "No hay cupos disponibles en ese horario" });
        return;
      }

      const relativePath = path.relative(UPLOAD_ROOT, req.file.path).split(path.sep).join("/");

      const appointment = await prisma.$transaction(async (tx) => {
        const updatedSlot = await tx.workshopAvailabilitySlot.update({
          where: { id: slot.id },
          data: { bookedCount: { increment: 1 } },
        });
        if (updatedSlot.bookedCount > updatedSlot.maxAppointments) {
          throw new Error("CUPO_LLENO");
        }

        return tx.inspectionAppointment.create({
          data: {
            id: generateMixedId(),
            userId,
            workshopId,
            kind: "CLIENT_REQUESTED",
            status: InspectionAppointmentStatus.PENDING,
            appointmentDate,
            appointmentTime: appointmentTime ?? slot.startTime,
            reason,
            proofStoredPath: relativePath,
            proofMimeType: req.file!.mimetype,
            proofOriginalName: req.file!.originalname,
            proofSizeBytes: req.file!.size,
          },
          include: {
            workshop: { select: { name: true, address: true, city: true } },
          },
        });
      });

      res.status(201).json(mapInspectionAppointment(appointment));
    } catch (e) {
      if (e instanceof Error && e.message === "CUPO_LLENO") {
        res.status(400).json({ error: "No hay cupos disponibles en ese horario" });
        return;
      }
      next(e);
    }
  });
});

inspectionsRouter.get("/appointments/:appointmentId/proof", async (req, res, next) => {
  try {
    const userId = paramUserId(req);
    const appointmentId = String(req.params.appointmentId ?? "");

    const appointment = await prisma.inspectionAppointment.findFirst({
      where: { id: appointmentId, userId },
    });
    if (!appointment?.proofStoredPath) {
      res.status(404).json({ error: "Prueba no encontrada" });
      return;
    }

    const filePath = resolveStoredFile(appointment.proofStoredPath);
    res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
});
