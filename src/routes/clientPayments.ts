import { Router } from "express";
import { buildClientPaymentSummary } from "../lib/clientPaymentSummary.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const clientPaymentsRouter = Router();

clientPaymentsRouter.use(requireAuth, requireRole("USER", "ADMIN"));

clientPaymentsRouter.get("/summary", async (req, res, next) => {
  try {
    const summary = await buildClientPaymentSummary(req.auth!.id);
    res.json({ summary });
  } catch (err) {
    next(err);
  }
});
