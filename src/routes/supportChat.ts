import fs from "node:fs";
import { Router } from "express";
import { answerSupportKnowledgeQuestion } from "../lib/supportKnowledgeChat.js";
import { resolveSupportVehicleForUser } from "../lib/resolveSupportVehicleForUser.js";
import {
  appendBotAnswer,
  getActiveSupportChatSession,
  getSupportChatMessageAttachmentForDownload,
  getSupportEmergencyInfoPayload,
  handleSupportChatUserMessage,
  registerSupportEmergencyReport,
  setSupportChatSessionTopic,
} from "../lib/supportChatSessions.js";
import {
  assertSupportChatFileSize,
  createSupportChatMediaUploader,
  supportChatAttachmentKind,
  supportChatRelativePath,
} from "../lib/supportChatUpload.js";
import { resolveStoredFile } from "../lib/uploadStorage.js";
import {
  listSupportKnowledgeInventory,
  SUPPORT_TOPICS,
  type SupportTopicId,
  type SupportVehicle,
} from "../lib/supportKnowledgePaths.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const supportChatRouter = Router();

supportChatRouter.use(requireAuth, requireRole("USER", "ADMIN"));

const supportChatUpload = createSupportChatMediaUploader();

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

supportChatRouter.post("/set-topic", async (req, res, next) => {
  try {
    const { topic, sessionId } = req.body as { topic?: number; sessionId?: string };
    if (typeof topic !== "number") {
      res.status(400).json({ error: "Indica el tema" });
      return;
    }
    const session = await setSupportChatSessionTopic(req.auth!.id, sessionId, topic);
    res.json({ session });
  } catch (err) {
    next(err);
  }
});

supportChatRouter.get("/inventory", (_req, res) => {
  res.json(listSupportKnowledgeInventory());
});

supportChatRouter.get("/emergency-info", (_req, res) => {
  res.json(getSupportEmergencyInfoPayload());
});

supportChatRouter.post("/emergency-report", async (req, res, next) => {
  try {
    const { sessionId, situation, location, description, clientSafe } = req.body as {
      sessionId?: string;
      situation?: string;
      location?: string;
      description?: string;
      clientSafe?: boolean;
    };

    const userId = req.auth!.id;
    let vehicleLabel: string | undefined;
    try {
      const ctx = await resolveSupportVehicleForUser(userId);
      if (ctx.vehicleLabel) vehicleLabel = ctx.vehicleLabel;
    } catch {
      // opcional
    }

    const session = await registerSupportEmergencyReport({
      userId,
      sessionId: sessionId?.trim() || undefined,
      situation: (situation ?? "otro").trim(),
      location: (location ?? "").trim(),
      description: (description ?? "").trim(),
      clientSafe: Boolean(clientSafe),
      fallbackClientEmail: req.auth!.email,
      vehicleLabel,
    });

    res.json({ session });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo registrar el reporte";
    if (message.includes("Ubicación") || message.includes("Describe") || message.includes("Indica")) {
      res.status(400).json({ error: message });
      return;
    }
    next(err);
  }
});

supportChatRouter.get("/messages/:messageId/attachment", async (req, res, next) => {
  try {
    const access = await getSupportChatMessageAttachmentForDownload({
      messageId: req.params.messageId,
      userId: req.auth!.id,
      isAdmin: req.auth!.userType === "ADMIN",
    });
    if (!access) {
      res.status(404).json({ error: "Archivo no encontrado" });
      return;
    }
    const absolute = resolveStoredFile(access.storedPath);
    if (!fs.existsSync(absolute)) {
      res.status(404).json({ error: "Archivo no encontrado" });
      return;
    }
    res.setHeader("Content-Type", access.mimeType);
    res.setHeader("Cache-Control", "private, max-age=3600");
    fs.createReadStream(absolute).pipe(res);
  } catch (err) {
    const message = err instanceof Error ? err.message : "No autorizado";
    if (message.includes("autorizado")) {
      res.status(403).json({ error: message });
      return;
    }
    next(err);
  }
});

supportChatRouter.post("/ask-media", (req, res, next) => {
  supportChatUpload.single("file")(req, res, (multerErr: unknown) => {
    if (multerErr) {
      const message =
        multerErr instanceof Error ? multerErr.message : "No se pudo subir el archivo";
      res.status(400).json({ error: message });
      return;
    }
    void (async () => {
      try {
        const file = req.file;
        if (!file) {
          res.status(400).json({ error: "Adjunta una foto o video" });
          return;
        }

        assertSupportChatFileSize(file.mimetype, file.size);
        const kind = supportChatAttachmentKind(file.mimetype);
        if (!kind) {
          res.status(400).json({ error: "Tipo de archivo no permitido" });
          return;
        }

        const { topic, vehicle, question, sessionId, requestHuman } = req.body as {
          topic?: string;
          vehicle?: string;
          question?: string;
          sessionId?: string;
          requestHuman?: string;
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
        const wantsHuman = requestHuman === "true" || requestHuman === "1";
        if (q.length < 1 && !wantsHuman) {
          // caption opcional si hay archivo
        }

        const storedPath = supportChatRelativePath(userId, file.filename);
        const attachment = { storedPath, mimeType: file.mimetype };

        const handled = await handleSupportChatUserMessage({
          userId,
          sessionId: sessionId?.trim() || undefined,
          topic: topicNum,
          question: q.length >= 1 ? q : "",
          requestHuman: wantsHuman,
          fallbackClientEmail: req.auth!.email,
          attachment,
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
        const absoluteMedia = resolveStoredFile(storedPath);

        const result = await answerSupportKnowledgeQuestion({
          topic: topicNum as SupportTopicId,
          vehicle: vehicleTyped,
          question: q,
          clientName: profileName,
          userMedia: { absolutePath: absoluteMedia, mimeType: file.mimetype },
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
          message.includes("mensaje") ||
          message.includes("archivo") ||
          message.includes("pesad")
        ) {
          res.status(400).json({ error: message });
          return;
        }
        next(err);
      }
    })().catch(next);
  });
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
