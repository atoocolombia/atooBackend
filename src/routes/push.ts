import { Router } from "express";
import { generateMixedId } from "../lib/generateMixedId.js";
import { prisma } from "../lib/prisma.js";
import { getVapidPublicKey, sendWebPushToUser } from "../lib/webPush.js";
import { requireAuth } from "../middleware/auth.js";

export const pushRouter = Router();

pushRouter.get("/config", (_req, res) => {
  const publicKey = getVapidPublicKey();
  res.json({
    configured: Boolean(publicKey),
    publicKey,
  });
});

pushRouter.post("/subscribe", requireAuth, async (req, res, next) => {
  try {
    const body = req.body as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };
    const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";
    const p256dh = typeof body.keys?.p256dh === "string" ? body.keys.p256dh.trim() : "";
    const auth = typeof body.keys?.auth === "string" ? body.keys.auth.trim() : "";
    if (!endpoint || !p256dh || !auth) {
      res.status(400).json({ error: "Suscripción de avisos incompleta" });
      return;
    }

    const userAgent = req.get("user-agent")?.slice(0, 240) || null;
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        id: generateMixedId(),
        userId: req.auth!.id,
        endpoint,
        p256dh,
        auth,
        userAgent,
      },
      update: {
        userId: req.auth!.id,
        p256dh,
        auth,
        userAgent,
      },
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

pushRouter.delete("/subscribe", requireAuth, async (req, res, next) => {
  try {
    const endpoint =
      typeof (req.body as { endpoint?: string }).endpoint === "string"
        ? (req.body as { endpoint: string }).endpoint.trim()
        : "";
    if (endpoint) {
      await prisma.pushSubscription.deleteMany({
        where: { userId: req.auth!.id, endpoint },
      });
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

pushRouter.post("/test", requireAuth, async (req, res, next) => {
  try {
    if (!getVapidPublicKey()) {
      res.status(503).json({
        error: "Los avisos al celular no están configurados en el servidor (faltan claves VAPID).",
      });
      return;
    }
    await sendWebPushToUser(req.auth!.id, {
      title: "atoo",
      body: "Si ves esto con la app cerrada, los avisos al celular ya funcionan.",
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
