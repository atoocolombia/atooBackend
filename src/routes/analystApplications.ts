import { ApplicationStatus, DeliveryStatus } from "@prisma/client";
import { Router } from "express";
import { mapVehicleDelivery, buildClientName } from "../lib/mapVehicleDelivery.js";
import { prisma } from "../lib/prisma.js";
import {
  createDeliveryFromApplication,
  createManualDelivery,
  finalizeClientVehiclePlan,
} from "../lib/vehicleDeliveryService.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const analystApplicationsRouter = Router();

analystApplicationsRouter.use(requireAuth, requireRole("ANALYST", "ADMIN"));

analystApplicationsRouter.get("/applications", async (_req, res, next) => {
  try {
    const rows = await prisma.application.findMany({
      where: { status: ApplicationStatus.SUBMITTED },
      orderBy: { submittedAt: "desc" },
      include: { user: { include: { identityExtraction: true, workAddressExtraction: true } } },
    });
    res.json(
      rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        status: row.status,
        submittedAt: row.submittedAt.toISOString(),
        clientName: buildClientName(row.user.identityExtraction, row.user.email),
        idDocumentNumber: row.user.identityExtraction?.idDocumentNumber ?? null,
        email: row.user.email,
        phone: row.user.phone,
        address: row.user.workAddressExtraction?.utilityServiceAddress ?? null,
      })),
    );
  } catch (err) {
    next(err);
  }
});

analystApplicationsRouter.post("/applications/:applicationId/approve", async (req, res, next) => {
  try {
    const application = await prisma.application.update({
      where: { id: req.params.applicationId },
      data: {
        status: ApplicationStatus.APPROVED,
        reviewedAt: new Date(),
        reviewedByUserId: req.auth!.id,
      },
    });
    const delivery = await createDeliveryFromApplication(application.id, req.auth!.id);
    res.json({ application, delivery: mapVehicleDelivery(delivery) });
  } catch (err) {
    next(err);
  }
});

analystApplicationsRouter.post("/applications/:applicationId/reject", async (req, res, next) => {
  try {
    const { reason } = req.body as { reason?: string };
    const application = await prisma.application.update({
      where: { id: req.params.applicationId },
      data: {
        status: ApplicationStatus.REJECTED,
        reviewedAt: new Date(),
        reviewedByUserId: req.auth!.id,
        rejectionReason: reason?.trim() || "Rechazada por el analista",
      },
    });
    res.json(application);
  } catch (err) {
    next(err);
  }
});

analystApplicationsRouter.post("/deliveries/manual", async (req, res, next) => {
  try {
    const { clientName, idDocumentNumber, address, email, phone, deliveryLocation } = req.body as {
      clientName?: string;
      idDocumentNumber?: string;
      address?: string;
      email?: string;
      phone?: string;
      deliveryLocation?: string;
    };

    if (!clientName?.trim() || !idDocumentNumber?.trim() || !email?.trim()) {
      res.status(400).json({ error: "Nombre, cédula y correo son obligatorios" });
      return;
    }

    const delivery = await createManualDelivery({
      clientName,
      idDocumentNumber,
      address,
      email,
      phone,
      deliveryLocation,
      analystUserId: req.auth!.id,
    });

    res.status(201).json(mapVehicleDelivery(delivery));
  } catch (err) {
    next(err);
  }
});

export const deliveryConfirmationRouter = Router();

deliveryConfirmationRouter.get("/:token", async (req, res, next) => {
  try {
    const row = await prisma.vehicleDelivery.findUnique({
      where: { confirmationToken: req.params.token },
    });
    if (!row) {
      res.status(404).json({ error: "Confirmación no encontrada o expirada" });
      return;
    }
    res.json({
      clientName: row.clientName,
      vin: row.vin,
      status: row.status,
      alreadyConfirmed: Boolean(row.clientConfirmedAt),
    });
  } catch (err) {
    next(err);
  }
});

deliveryConfirmationRouter.post("/:token", async (req, res, next) => {
  try {
    const row = await prisma.vehicleDelivery.findUnique({
      where: { confirmationToken: req.params.token },
    });
    if (!row) {
      res.status(404).json({ error: "Confirmación no encontrada o expirada" });
      return;
    }
    if (row.clientConfirmedAt) {
      res.json({ ok: true, message: "Entrega ya confirmada" });
      return;
    }

    const updated = await prisma.vehicleDelivery.update({
      where: { id: row.id },
      data: {
        status: DeliveryStatus.COMPLETED,
        clientConfirmedAt: new Date(),
      },
    });

    await finalizeClientVehiclePlan(updated.id);

    res.json({ ok: true, message: "Gracias por confirmar la entrega de tu vehículo atoo." });
  } catch (err) {
    next(err);
  }
});
