import { Router } from "express";
import { answerSupportKnowledgeQuestion } from "../lib/supportKnowledgeChat.js";
import { resolveSupportVehicleForUser } from "../lib/resolveSupportVehicleForUser.js";
import {
  listSupportKnowledgeInventory,
  SUPPORT_TOPICS,
  type SupportTopicId,
  type SupportVehicle,
} from "../lib/supportKnowledgePaths.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const supportChatRouter = Router();

supportChatRouter.use(requireAuth, requireRole("USER", "ADMIN"));

supportChatRouter.get("/topics", (_req, res) => {
  res.json({ topics: SUPPORT_TOPICS });
});

/** Vehículo del cliente según plan de entrega / datos de entrega. */
supportChatRouter.get("/context", async (req, res, next) => {
  try {
    const userId = req.auth!.id;
    const ctx = await resolveSupportVehicleForUser(userId);
    res.json(ctx);
  } catch (err) {
    next(err);
  }
});

/** Inventario de PDFs/DOCX (diagnóstico, sin contenido). */
supportChatRouter.get("/inventory", (_req, res) => {
  res.json(listSupportKnowledgeInventory());
});

supportChatRouter.post("/ask", async (req, res, next) => {
  try {
    const { topic, vehicle, question } = req.body as {
      topic?: number;
      vehicle?: string;
      question?: string;
    };

    const topicNum = Number(topic);
    if (![1, 2, 3, 4, 5].includes(topicNum)) {
      res.status(400).json({ error: "topic debe ser un número del 1 al 5" });
      return;
    }

    let vehicleTyped: SupportVehicle | undefined;
    if (vehicle === "nammi" || vehicle === "aeolus") {
      vehicleTyped = vehicle;
    } else if (vehicle) {
      res.status(400).json({ error: "vehicle debe ser nammi o aeolus" });
      return;
    }

    const userId = req.auth!.id;
    if ((topicNum === 1 || topicNum === 5) && !vehicleTyped) {
      const resolved = await resolveSupportVehicleForUser(userId);
      vehicleTyped = resolved.vehicle ?? undefined;
    }

    const profileName = req.auth?.email?.split("@")[0] ?? undefined;

    const result = await answerSupportKnowledgeQuestion({
      topic: topicNum as SupportTopicId,
      vehicle: vehicleTyped,
      question: question ?? "",
      clientName: profileName,
    });

    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo procesar la pregunta";
    if (
      message.includes("documentos") ||
      message.includes("pregunta") ||
      message.includes("modelo de vehículo") ||
      message.includes("configurado")
    ) {
      res.status(400).json({ error: message });
      return;
    }
    next(err);
  }
});
