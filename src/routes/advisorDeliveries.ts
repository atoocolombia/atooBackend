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
  notifyDeliveryActivation,
  notifyDeliveryConfirmation,
  notifyDeliveryDocuments,
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

    await notifyDeliveryDocuments(row.clientName, row.email);

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

    const clientOrigin = (process.env.CLIENT_ORIGIN ?? "https://www.atoo.io").split(",")[0]?.trim();
    const now = new Date();
    const isManualEntry = !current.applicationId;

    if (isManualEntry) {
      const onboardingToken = deliveryConfirmationToken();
      const setupUrl = `${clientOrigin}/activar-cuenta/${onboardingToken}`;

      const row = await prisma.vehicleDelivery.update({
        where: { id: req.params.deliveryId },
        data: {
          status: DeliveryStatus.AWAITING_CLIENT_CONFIRMATION,
          completedByAdvisorAt: now,
          onboardingToken,
          advisorUserId: req.auth!.id,
        },
      });

      await notifyDeliveryActivation(row.clientName, row.email, setupUrl);

      res.json({ ...mapVehicleDelivery(row), setupUrl });
      return;
    }

    const token = deliveryConfirmationToken();
    const confirmUrl = `${clientOrigin}/entrega/confirmar/${token}`;

    const row = await prisma.vehicleDelivery.update({
      where: { id: req.params.deliveryId },
      data: {
        status: DeliveryStatus.AWAITING_CLIENT_CONFIRMATION,
        completedByAdvisorAt: now,
        confirmationToken: token,
        advisorUserId: req.auth!.id,
      },
    });

    await notifyDeliveryConfirmation(row.clientName, row.email, confirmUrl);

    res.json({ ...mapVehicleDelivery(row), confirmUrl });
  } catch (err) {
    next(err);
  }
});
