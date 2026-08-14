import webpush from "web-push";
import type { UserType } from "@prisma/client";
import { prisma } from "./prisma.js";

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

function vapidPublicKey(): string {
  return process.env.VAPID_PUBLIC_KEY?.trim() || "";
}

function vapidPrivateKey(): string {
  return process.env.VAPID_PRIVATE_KEY?.trim() || "";
}

export function getVapidPublicKey(): string | null {
  const key = vapidPublicKey();
  return key || null;
}

function ensureVapid(): boolean {
  const publicKey = vapidPublicKey();
  const privateKey = vapidPrivateKey();
  if (!publicKey || !privateKey) {
    console.warn(
      "[web-push] Faltan VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY en Railway. Los avisos al celular no se envían.",
    );
    return false;
  }
  const subject =
    process.env.VAPID_SUBJECT?.trim() || "mailto:hola@atoo.io";
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

export function dashboardPathForUserType(userType: UserType): string {
  switch (userType) {
    case "ADMIN":
      return "/admin";
    case "ADVISOR":
      return "/asesor";
    case "ANALYST":
      return "/analista";
    case "WORKSHOP":
      return "/taller";
    default:
      return "/dashboard";
  }
}

export async function sendWebPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<void> {
  if (!ensureVapid()) {
    return;
  }

  const [user, subscriptions] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { userType: true },
    }),
    prisma.pushSubscription.findMany({ where: { userId } }),
  ]);
  if (!user) return;
  if (subscriptions.length === 0) {
    console.warn(`[web-push] ${userId} no tiene dispositivos suscritos`);
    return;
  }

  const body = JSON.stringify({
    title: payload.title.slice(0, 80),
    body: payload.body.slice(0, 180),
    url: payload.url || dashboardPathForUserType(user.userType),
  });

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.deleteMany({
            where: { id: sub.id },
          });
          return;
        }
        console.warn("[web-push] Falló el envío", status ?? err);
      }
    }),
  );
}

export async function sendWebPushToWorkshop(
  workshopId: string,
  payload: PushPayload,
): Promise<void> {
  const workshop = await prisma.workshop.findUnique({
    where: { id: workshopId },
    select: { userId: true },
  });
  if (!workshop?.userId) return;
  await sendWebPushToUser(workshop.userId, {
    ...payload,
    url: payload.url ?? "/taller",
  });
}
