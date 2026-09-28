import { Router } from "express";
import { answerSupportKnowledgeQuestion } from "../lib/supportKnowledgeChat.js";
import { resolveSupportVehicleForUser } from "../lib/resolveSupportVehicleForUser.js";
import {
  appendBotAnswer,
  getActiveSupportChatSession,
  handleSupportChatUserMessage,
} from "../lib/supportChatSessions.js";
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

supportChatRouter.get("/context", async (req, res, next) => {
  try {
    const userId = req.auth!.id;
    const ctx = await resolveSupportVehicleForUser(userId);
    res.json(ctx);
  } catch (err) {
    next(err);
  }
});

supportChatRouter.get("/session", async (req, res, next) => {
  try {
    const session = await getActiveSupportChatSession(req.auth!.id);
    res.json({ session });
  } catch (err) {
    next(err);
  }
});

supportChatRouter.get("/inventory", (_req, res) => {
  res.json(listSupportKnowledgeInventory());
});

supportChatRouter.post("/request-human", async (req, res, next) => {
  try {
    const { sessionId, message, topic } = req.body as {
      sessionId?: string;
      message?: string;
      topic?: number;
    };
    const userId = req.auth!.id;
    const trigger = (message?.trim() || "Quiero hablar con un humano.").slice(0, 2000);
    const topicNum = Number(topic);
    const handled = await handleSupportChatUserMessage({
      userId,
      sessionId,
      topic: [1, 2, 3, 4, 5].includes(topicNum) ? topicNum : undefined,
      question: trigger,
      requestHuman: true,
      fallbackClientEmail: req.auth!.email,
    });
    res.json({
      session: handled.session,
      answer: handled.answer,
      handoff: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo solicitar atención humana";
    if (message.includes("mensaje") || message.includes("Sesión")) {
      res.status(400).json({ error: message });
      return;
    }
    next(err);
  }
});

supportChatRouter.post("/ask", async (req, res, next) => {
  try {
    const { topic, vehicle, question, sessionId, requestHuman } = req.body as {
      topic?: number;
      vehicle?: string;
      question?: string;
      sessionId?: string;
      requestHuman?: boolean;
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

    const q = (question ?? "").trim();
    if (q.length < 3 && !requestHuman) {
      res.status(400).json({ error: "Escribe una pregunta de al menos 3 caracteres" });
      return;
    }

    const handled = await handleSupportChatUserMessage({
      userId,
      sessionId,
      topic: topicNum,
      question: q.length >= 1 ? q : "Quiero hablar con un humano",
      requestHuman: Boolean(requestHuman),
      fallbackClientEmail: req.auth!.email,
    });

    if (handled.skipAi) {
      res.json({
        answer: handled.answer,
        sources: [],
        sessionId: handled.session.id,
        status: handled.session.status,
        handoff: handled.handoff,
        session: handled.session,
      });
      return;
    }

    const profileName = req.auth?.email?.split("@")[0] ?? undefined;

    const result = await answerSupportKnowledgeQuestion({
      topic: topicNum as SupportTopicId,
      vehicle: vehicleTyped,
      question: q,
      clientName: profileName,
    });

    const session = await appendBotAnswer(handled.session.id, result.answer);

    res.json({
      answer: result.answer,
      sources: result.sources,
      sessionId: session.id,
      status: session.status,
      handoff: false,
      session,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo procesar la pregunta";
    if (
      message.includes("documentos") ||
      message.includes("pregunta") ||
      message.includes("modelo de vehículo") ||
      message.includes("configurado") ||
      message.includes("mensaje")
    ) {
      res.status(400).json({ error: message });
      return;
    }
    next(err);
  }
});
