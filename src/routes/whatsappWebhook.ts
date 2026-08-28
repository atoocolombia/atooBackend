import { Router } from "express";
import { handleWhatsAppIncoming } from "../lib/whatsappSupportBot.js";
import { isWhatsAppConfigured } from "../lib/whatsappCloudApi.js";

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
      entry?: Array<{
        changes?: Array<{
          value?: {
            messages?: Array<{
              from?: string;
              type?: string;
              text?: { body?: string };
            }>;
          };
        }>;
      }>;
    };

    const messages = body.entry?.[0]?.changes?.[0]?.value?.messages;
    if (!messages?.length) return;

    for (const msg of messages) {
      if (msg.type !== "text" || !msg.from || !msg.text?.body) continue;
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
  });
});
