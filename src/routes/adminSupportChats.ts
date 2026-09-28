import { Router } from "express";
import {
  getSupportChatSessionForAdmin,
  listSupportChatSessionsForAdmin,
  postAgentSupportMessage,
  updateSupportChatSessionStatus,
} from "../lib/supportChatSessions.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

export const adminSupportChatsRouter = Router();

adminSupportChatsRouter.use(requireAuth, requireAdmin);

adminSupportChatsRouter.get("/", async (req, res, next) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : "open";
    const sessions = await listSupportChatSessionsForAdmin(status);
    res.json({ sessions });
  } catch (err) {
    next(err);
  }
});

adminSupportChatsRouter.get("/:sessionId", async (req, res, next) => {
  try {
    const session = await getSupportChatSessionForAdmin(req.params.sessionId);
    if (!session) {
      res.status(404).json({ error: "Conversación no encontrada" });
      return;
    }
    res.json({ session });
  } catch (err) {
    next(err);
  }
});

adminSupportChatsRouter.post("/:sessionId/messages", async (req, res, next) => {
  try {
    const { text } = req.body as { text?: string };
    if (!text?.trim()) {
      res.status(400).json({ error: "text es requerido" });
      return;
    }
    const session = await postAgentSupportMessage(
      req.params.sessionId,
      text,
      req.auth!.email,
    );
    res.json({ session });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo enviar el mensaje";
    if (message.includes("cerrada") || message.includes("encontrada")) {
      res.status(400).json({ error: message });
      return;
    }
    next(err);
  }
});

adminSupportChatsRouter.patch("/:sessionId", async (req, res, next) => {
  try {
    const { status } = req.body as { status?: string };
    if (status !== "HUMAN_ACTIVE" && status !== "CLOSED") {
      res.status(400).json({ error: "status debe ser HUMAN_ACTIVE o CLOSED" });
      return;
    }
    const session = await updateSupportChatSessionStatus(req.params.sessionId, status);
    res.json({ session });
  } catch (err) {
    next(err);
  }
});
