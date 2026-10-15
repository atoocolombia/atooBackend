import { Router } from "express";
import { generateMixedId } from "../lib/generateMixedId.js";
import {
  mapClientPayment,
  normalizeIdDocumentNumber,
  resolveClientByIdDocument,
  searchClientsForPayment,
} from "../lib/clientPayments.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const DOCUMENT_TYPES = new Set(["CC", "CE", "NIT", "PA"]);
const PAYMENT_METHODS = new Set([
  "transferencia",
  "efectivo",
  "pse",
  "nequi",
  "daviplata",
  "consignacion",
  "otro",
]);

export const analystPaymentsRouter = Router();

analystPaymentsRouter.use(requireAuth, requireRole("ANALYST", "ADMIN"));

analystPaymentsRouter.get("/clients/lookup", async (req, res, next) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    const clients = await searchClientsForPayment(q, 12);
    res.json({ clients });
  } catch (err) {
    next(err);
  }
});

analystPaymentsRouter.get("/clients/by-document/:document", async (req, res, next) => {
  try {
    const normalized = normalizeIdDocumentNumber(req.params.document ?? "");
    if (normalized.length < 5) {
      res.status(400).json({ error: "Documento inválido" });
      return;
    }
    const linked = await resolveClientByIdDocument(normalized);
    res.json({
      idDocumentNumber: normalized,
      idDocumentType: linked.idDocumentType,
      clientName: linked.clientName,
      email: linked.clientEmail,
      phone: linked.clientPhone,
      address: linked.clientAddress,
      userId: linked.userId,
      found: Boolean(linked.clientName || linked.clientEmail),
    });
  } catch (err) {
    next(err);
  }
});

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
      include: { registeredBy: { select: { email: true } } },
    });

    res.json(rows.map(mapClientPayment));
  } catch (err) {
    next(err);
  }
});

analystPaymentsRouter.post("/", async (req, res, next) => {
  try {
    const {
      idDocumentNumber,
      idDocumentType,
      amountCop,
      paidAt,
      notes,
      clientName,
      clientEmail,
      clientPhone,
      clientAddress,
      paymentMethod,
      paymentReference,
      payerName,
    } = req.body as {
      idDocumentNumber?: string;
      idDocumentType?: string;
      amountCop?: number | string;
      paidAt?: string;
      notes?: string;
      clientName?: string;
      clientEmail?: string;
      clientPhone?: string;
      clientAddress?: string;
      paymentMethod?: string;
      paymentReference?: string;
      payerName?: string;
    };

    const normalizedId = normalizeIdDocumentNumber(idDocumentNumber ?? "");
    if (!normalizedId || normalizedId.length < 5) {
      res.status(400).json({ error: "La cédula o NIT del cliente es obligatorio" });
      return;
    }

    const docType = (idDocumentType ?? "CC").toUpperCase();
    if (!DOCUMENT_TYPES.has(docType)) {
      res.status(400).json({ error: "Tipo de documento inválido (CC, CE, NIT, PA)" });
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

    const method = paymentMethod?.trim().toLowerCase();
    if (method && !PAYMENT_METHODS.has(method)) {
      res.status(400).json({ error: "Medio de pago inválido" });
      return;
    }

    const linked = await resolveClientByIdDocument(normalizedId);
    const resolvedName = clientName?.trim() || linked.clientName;
    const resolvedEmail = clientEmail?.trim() || linked.clientEmail;
    const resolvedPhone = clientPhone?.trim() || linked.clientPhone;
    const resolvedAddress = clientAddress?.trim() || linked.clientAddress;

    if (!resolvedName?.trim()) {
      res.status(400).json({ error: "Indica el nombre del cliente (o búscalo en la base de datos)" });
      return;
    }

    if (!resolvedEmail?.trim()) {
      res.status(400).json({
        error:
          "El correo del cliente es obligatorio para facturación electrónica. Complétalo manualmente si no está en la base.",
      });
      return;
    }

    const row = await prisma.clientPayment.create({
      data: {
        id: generateMixedId(),
        idDocumentNumber: normalizedId,
        idDocumentType: docType,
        amountCop: Math.round(parsedAmount),
        paidAt: paidAtDate,
        registeredByUserId: req.auth!.id,
        userId: linked.userId,
        clientName: resolvedName,
        clientEmail: resolvedEmail,
        clientPhone: resolvedPhone || null,
        clientAddress: resolvedAddress || null,
        paymentMethod: method || null,
        paymentReference: paymentReference?.trim() || null,
        payerName: payerName?.trim() || null,
        notes: notes?.trim() || null,
      },
      include: { registeredBy: { select: { email: true } } },
    });

    res.status(201).json(mapClientPayment(row));
  } catch (err) {
    next(err);
  }
});
