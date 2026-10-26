import { Router } from "express";
import {
  buildClientBillingStatement,
  listClientBillingPeriods,
  respondToClientServiceOffer,
} from "../lib/clientBillingStatement.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const clientBillingRouter = Router();

clientBillingRouter.use(requireAuth, requireRole("USER", "ADMIN"));

clientBillingRouter.get("/periods", async (req, res, next) => {
  try {
    const periods = await listClientBillingPeriods(req.auth!.id);
    res.json({ periods });
  } catch (err) {
    next(err);
  }
});

clientBillingRouter.get("/statement", async (req, res, next) => {
  try {
    const yearRaw = req.query.year;
    const monthRaw = req.query.month;
    const year = yearRaw != null ? Number(yearRaw) : undefined;
    const month = monthRaw != null ? Number(monthRaw) : undefined;
    if (yearRaw != null && (!Number.isInteger(year) || year! < 2020)) {
      res.status(400).json({ error: "Año inválido" });
      return;
    }
    if (monthRaw != null && (!Number.isInteger(month) || month! < 1 || month! > 12)) {
      res.status(400).json({ error: "Mes inválido" });
      return;
    }
    const statement = await buildClientBillingStatement(req.auth!.id, year, month);
    res.json({ statement });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo cargar la cuenta de cobro";
    if (message.includes("futuro") || message.includes("guardada")) {
      res.status(400).json({ error: message });
      return;
    }
    next(err);
  }
});

clientBillingRouter.post("/offers/:offerId/respond", async (req, res, next) => {
  try {
    const { accept } = req.body as { accept?: boolean };
    if (typeof accept !== "boolean") {
      res.status(400).json({ error: "Indica accept: true o false" });
      return;
    }
    const statement = await respondToClientServiceOffer({
      userId: req.auth!.id,
      offerId: req.params.offerId,
      accept,
    });
    res.json({ statement });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo registrar tu respuesta";
    if (
      message.includes("oferta") ||
      message.includes("respondiste")
    ) {
      res.status(400).json({ error: message });
      return;
    }
    next(err);
  }
});
