import { Router } from "express";
import { generateMixedId } from "../lib/generateMixedId.js";
import {
  mapClientPayment,
  normalizeIdDocumentNumber,
  resolveClientByIdDocument,
} from "../lib/clientPayments.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const analystPaymentsRouter = Router();

analystPaymentsRouter.use(requireAuth, requireRole("ANALYST", "ADMIN"));

analystPaymentsRouter.get("/", async (req, res, next) => {
  try {
    const idDocumentNumber =
      typeof req.query.idDocumentNumber === "string"
        ? normalizeIdDocumentNumber(req.query.idDocumentNumber)
        : "";

    const rows = await prisma.clientPayment.findMany({
      where: idDocumentNumber ? { idDocumentNumber } : undefined,
      orderBy: { paidAt: "desc" },
      take: 100,
    });

    res.json(rows.map(mapClientPayment));
  } catch (err) {
    next(err);
  }
});

analystPaymentsRouter.post("/", async (req, res, next) => {
  try {
    const { idDocumentNumber, amountCop, paidAt, notes } = req.body as {
      idDocumentNumber?: string;
      amountCop?: number | string;
      paidAt?: string;
      notes?: string;
    };

    const normalizedId = normalizeIdDocumentNumber(idDocumentNumber ?? "");
    if (!normalizedId || normalizedId.length < 5) {
      res.status(400).json({ error: "La cédula del cliente es obligatoria" });
      return;
    }

    const parsedAmount =
      typeof amountCop === "number" ? amountCop : Number(String(amountCop ?? "").replace(/\D/g, ""));
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      res.status(400).json({ error: "El monto debe ser mayor a cero" });
      return;
    }

    if (!paidAt?.trim()) {
      res.status(400).json({ error: "La fecha del pago es obligatoria" });
      return;
    }

    const paidAtDate = new Date(paidAt);
    if (Number.isNaN(paidAtDate.getTime())) {
      res.status(400).json({ error: "Fecha de pago inválida" });
      return;
    }

    const linked = await resolveClientByIdDocument(normalizedId);

    const row = await prisma.clientPayment.create({
      data: {
        id: generateMixedId(),
        idDocumentNumber: normalizedId,
        amountCop: Math.round(parsedAmount),
        paidAt: paidAtDate,
        registeredByUserId: req.auth!.id,
        userId: linked.userId,
        clientName: linked.clientName,
        notes: notes?.trim() || null,
      },
    });

    res.status(201).json(mapClientPayment(row));
  } catch (err) {
    next(err);
  }
});
