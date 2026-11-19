import { Router } from "express";
import { buildClientPaymentSummary } from "../lib/clientPaymentSummary.js";
import { createWompiWidgetSession } from "../lib/wompiPaymentService.js";
import { isWompiConfigured } from "../lib/wompiConfig.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const clientPaymentsRouter = Router();

clientPaymentsRouter.use(requireAuth, requireRole("USER", "ADMIN"));

clientPaymentsRouter.get("/summary", async (req, res, next) => {
  try {
    const summary = await buildClientPaymentSummary(req.auth!.id);
    res.json({
      summary: {
        ...summary,
        wompiEnabled: isWompiConfigured(),
      },
    });
  } catch (err) {
    next(err);
  }
});

/** Sesión para el widget Wompi (monto fijo por tipo: depósito o una cuota). */
clientPaymentsRouter.post("/wompi/widget-session", async (req, res, next) => {
  try {
    const { kind, redirectUrl } = req.body as { kind?: string; redirectUrl?: string };
    if (kind !== "deposit" && kind !== "installment") {
      res.status(400).json({ error: 'Indica kind: "deposit" o "installment"' });
      return;
    }
    const session = await createWompiWidgetSession(req.auth!.id, kind, redirectUrl);
    res.status(201).json(session);
  } catch (err) {
    const statusCode =
      err && typeof err === "object" && "statusCode" in err && typeof (err as { statusCode: number }).statusCode === "number"
        ? (err as { statusCode: number }).statusCode
        : 500;
    const message = err instanceof Error ? err.message : "No se pudo iniciar el pago";
    if (statusCode < 500) {
      res.status(statusCode).json({ error: message });
      return;
    }
    next(err);
  }
});
