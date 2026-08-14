import type { Prisma } from "@prisma/client";
import { generateMixedId } from "./generateMixedId.js";
import { prisma } from "./prisma.js";
import { sendWebPushToUser } from "./webPush.js";

export type RescheduleNotificationMetadata = {
  appointmentId: string;
  workshopName: string;
  previousDate: string;
  previousTime: string | null;
  proposedDate: string;
  proposedTime: string | null;
};

export async function createUserNotification(input: {
  userId: string;
  type: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  reminderKey?: string;
}): Promise<boolean> {
  try {
    await prisma.userNotification.create({
      data: {
        id: generateMixedId(),
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        reminderKey: input.reminderKey,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "P2002" && input.reminderKey) {
      return false;
    }
    throw err;
  }

  void sendWebPushToUser(input.userId, {
    title: input.title,
    body: input.message,
  }).catch((err) => {
    console.warn("[web-push] No se pudo enviar el aviso", err);
  });
  return true;
}

export function formatAppointmentWhen(date: string, time: string | null): string {
  return `${date}${time ? ` a las ${time}` : ""}`;
}
