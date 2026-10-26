import { Router } from "express";
import {
  buildClientBillingStatement,
  respondToClientServiceOffer,
} from "../lib/clientBillingStatement.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const clientBillingRouter = Router();

clientBillingRouter.use(requireAuth, requireRole("USER", "ADMIN"));

clientBillingRouter.get("/statement", async (req, res, next) => {
  try {
    const statement = await buildClientBillingStatement(req.auth!.id);
    res.json({ statement });
  } catch (err) {
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
