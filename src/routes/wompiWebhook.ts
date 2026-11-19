import { Router } from "express";
import { getWompiConfig } from "../lib/wompiConfig.js";
import { verifyWompiEventChecksum } from "../lib/wompiEventVerify.js";
import { fulfillWompiTransaction } from "../lib/wompiFulfillPayment.js";

export const wompiWebhookRouter = Router();

type WompiEventBody = {
  event?: string;
  data?: {
    transaction?: {
      id?: string;
      reference?: string;
      status?: string;
      amount_in_cents?: number;
    };
  };
  signature?: { properties?: string[]; checksum?: string };
  timestamp?: number;
};

wompiWebhookRouter.post("/", async (req, res) => {
  const body = req.body as WompiEventBody;
  res.sendStatus(200);

  try {
    const headerChecksum =
      typeof req.headers["x-event-checksum"] === "string" ? req.headers["x-event-checksum"] : undefined;

    let eventsSecret = "";
    try {
      eventsSecret = getWompiConfig().eventsSecret;
    } catch {
      return;
    }

    if (!verifyWompiEventChecksum(body, eventsSecret, headerChecksum)) {
      console.warn("[wompi] Checksum de evento inválido");
      return;
    }

    if (body.event !== "transaction.updated") return;

    const tx = body.data?.transaction;
    if (!tx?.reference || !tx.id || !tx.status) return;

    void fulfillWompiTransaction({
      reference: tx.reference,
      wompiTransactionId: tx.id,
      status: tx.status,
      amountInCents: tx.amount_in_cents ?? 0,
    }).catch((err) => console.error("[wompi] Error al conciliar pago:", err));
  } catch (err) {
    console.error("[wompi] webhook:", err);
  }
});