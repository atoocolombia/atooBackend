import { Router } from "express";
import { handleWhatsAppIncoming } from "../lib/whatsappSupportBot.js";
import { isWhatsAppConfigured } from "../lib/whatsappCloudApi.js";
import {
  getWhatsAppDiagnostics,
  recordIncomingMessage,
  recordWebhookHit,
} from "../lib/whatsappDiagnostics.js";

export const whatsappWebhookRouter = Router();

/** Verificación del webhook (Meta). */
whatsappWebhookRouter.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const expected = process.env.WHATSAPP_VERIFY_TOKEN?.trim();

  if (mode === "subscribe" && token && expected && token === expected && challenge) {
    res.status(200).send(String(challenge));
    return;
  }
  res.sendStatus(403);
});

/** Mensajes entrantes de clientes. */
whatsappWebhookRouter.post("/", async (req, res) => {
  res.sendStatus(200);

  try {
    const body = req.body as {
      object?: string;
      entry?: Array<{
        changes?: Array<{
          field?: string;
          value?: {
            messages?: Array<{
              from?: string;
              type?: string;
              text?: { body?: string };
            }>;
            statuses?: unknown[];
          };
        }>;
      }>;
    };

    const change = body.entry?.[0]?.changes?.[0];
    const field = change?.field ?? null;
    recordWebhookHit(field);
    console.info("[whatsapp] Webhook POST", { object: body.object, field });

    const messages = change?.value?.messages;
    if (!messages?.length) return;

    for (const msg of messages) {
      if (msg.type !== "text" || !msg.from || !msg.text?.body) continue;
      recordIncomingMessage(msg.from, msg.text.body);
      console.info("[whatsapp] Mensaje entrante", { from: msg.from, text: msg.text.body });
      void handleWhatsAppIncoming(msg.from, msg.text.body).catch((err) => {
        console.error("[whatsapp] Error procesando mensaje:", err);
      });
    }
  } catch (err) {
    console.error("[whatsapp] Webhook POST:", err);
  }
});

whatsappWebhookRouter.get("/status", (_req, res) => {
  res.json({
    configured: isWhatsAppConfigured(),
    verifyTokenSet: Boolean(process.env.WHATSAPP_VERIFY_TOKEN?.trim()),
    phoneNumberIdSet: Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()),
    ...getWhatsAppDiagnostics(),
  });
});
