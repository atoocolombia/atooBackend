import { DeliveryStatus } from "@prisma/client";
import { Router } from "express";
import { mapVehicleDelivery } from "../lib/mapVehicleDelivery.js";
import { prisma } from "../lib/prisma.js";
import {
  createDeliveryFromApplication,
  createManualDelivery,
  deliveryConfirmationToken,
  finalizeClientVehiclePlan,
  mergeAccessoryChecklist,
  notifyDeliveryWhatsApp,
  parseVehiclePatch,
  validateReadyToComplete,
} from "../lib/vehicleDeliveryService.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const advisorDeliveriesRouter = Router();

advisorDeliveriesRouter.use(requireAuth, requireRole("ADVISOR", "ADMIN"));

advisorDeliveriesRouter.get("/", async (_req, res, next) => {
  try {
    const rows = await prisma.vehicleDelivery.findMany({
      where: { status: { not: DeliveryStatus.COMPLETED } },
      orderBy: { createdAt: "desc" },
      include: { user: { include: { identityExtraction: true } }, application: true },
    });
    res.json(rows.map(mapVehicleDelivery));
  } catch (err) {
    next(err);
  }
});

advisorDeliveriesRouter.get("/:deliveryId", async (req, res, next) => {
  try {
    const row = await prisma.vehicleDelivery.findUnique({
      where: { id: req.params.deliveryId },
      include: { user: { include: { identityExtraction: true } }, application: true },
    });
    if (!row) {
      res.status(404).json({ error: "Entrega no encontrada" });
      return;
    }
    res.json(mapVehicleDelivery(row));
  } catch (err) {
    next(err);
  }
});

advisorDeliveriesRouter.post("/:deliveryId/send-documents", async (req, res, next) => {
  try {
    const now = new Date();
    const row = await prisma.vehicleDelivery.update({
      where: { id: req.params.deliveryId },
      data: {
        status: DeliveryStatus.DOCUMENTS_SENT,
        contractSentAt: now,
        insuranceSentAt: now,
        promissoryNoteSentAt: now,
        advisorUserId: req.auth!.id,
      },
    });

    await notifyDeliveryWhatsApp(
      row.phone,
      `Hola ${row.clientName}, desde *atoo* te enviamos los documentos para firmar: contrato Rent to Own, seguro y pagaré. Revisa tu correo ${row.email} o responde por este chat cuando los hayas firmado.`,
    );

    res.json(mapVehicleDelivery(row));
  } catch (err) {
    next(err);
  }
});

advisorDeliveriesRouter.post("/:deliveryId/mark-signed", async (req, res, next) => {
  try {
    const { document } = req.body as { document?: string };
    const now = new Date();
    if (document === "contract") {
      /* handled below */
    } else if (document === "insurance") {
      /* handled below */
    } else if (document === "promissoryNote") {
      /* handled below */
    } else if (document === "all") {
      /* handled below */
    } else {
      res.status(400).json({ error: "document debe ser contract, insurance, promissoryNote o all" });
      return;
    }

    const current = await prisma.vehicleDelivery.findUnique({ where: { id: req.params.deliveryId } });
    if (!current) {
      res.status(404).json({ error: "Entrega no encontrada" });
      return;
    }

    const signed = {
      contract: document === "contract" || document === "all" ? now : current.contractSignedAt,
      insurance: document === "insurance" || document === "all" ? now : current.insuranceSignedAt,
      promissoryNote:
        document === "promissoryNote" || document === "all" ? now : current.promissoryNoteSignedAt,
    };

    const allSigned = Boolean(signed.contract && signed.insurance && signed.promissoryNote);

    const row = await prisma.vehicleDelivery.update({
      where: { id: req.params.deliveryId },
      data: {
        contractSignedAt: signed.contract,
        insuranceSignedAt: signed.insurance,
        promissoryNoteSignedAt: signed.promissoryNote,
        status: allSigned ? DeliveryStatus.DOCUMENTS_SIGNED : DeliveryStatus.DOCUMENTS_SENT,
        advisorUserId: req.auth!.id,
      },
    });

    res.json(mapVehicleDelivery(row));
  } catch (err) {
    next(err);
  }
});

advisorDeliveriesRouter.patch("/:deliveryId", async (req, res, next) => {
  try {
    const body = req.body as Record<string, unknown>;
    const vehiclePatch = parseVehiclePatch(body);
    const checklistPatch = Array.isArray(body.accessoryChecklist) ? body.accessoryChecklist : null;

    const current = await prisma.vehicleDelivery.findUnique({ where: { id: req.params.deliveryId } });
    if (!current) {
      res.status(404).json({ error: "Entrega no encontrada" });
      return;
    }

    const row = await prisma.vehicleDelivery.update({
      where: { id: req.params.deliveryId },
      data: {
        ...vehiclePatch,
        accessoryChecklist: checklistPatch
          ? mergeAccessoryChecklist(current.accessoryChecklist, checklistPatch as never[])
          : undefined,
        status:
          current.status === DeliveryStatus.DOCUMENTS_SIGNED ||
          current.status === DeliveryStatus.IN_DELIVERY
            ? DeliveryStatus.IN_DELIVERY
            : current.status,
        advisorUserId: req.auth!.id,
      },
    });

    res.json(mapVehicleDelivery(row));
  } catch (err) {
    next(err);
  }
});

advisorDeliveriesRouter.post("/:deliveryId/complete", async (req, res, next) => {
  try {
    const current = await prisma.vehicleDelivery.findUnique({ where: { id: req.params.deliveryId } });
    if (!current) {
      res.status(404).json({ error: "Entrega no encontrada" });
      return;
    }

    const validationError = validateReadyToComplete(current);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    const token = deliveryConfirmationToken();
    const clientOrigin = (process.env.CLIENT_ORIGIN ?? "https://www.atoo.io").split(",")[0]?.trim();
    const confirmUrl = `${clientOrigin}/entrega/confirmar/${token}`;

    const row = await prisma.vehicleDelivery.update({
      where: { id: req.params.deliveryId },
      data: {
        status: DeliveryStatus.AWAITING_CLIENT_CONFIRMATION,
        completedByAdvisorAt: new Date(),
        confirmationToken: token,
        advisorUserId: req.auth!.id,
      },
    });

    await notifyDeliveryWhatsApp(
      row.phone,
      `Hola ${row.clientName}, tu vehículo *atoo* fue entregado. Confirma el recibido aquí: ${confirmUrl}\n\nTambién puedes responder *CONFIRMO ENTREGA* por este chat.`,
    );

    res.json({ ...mapVehicleDelivery(row), confirmUrl });
  } catch (err) {
    next(err);
  }
});
