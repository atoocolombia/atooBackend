import type { Prisma } from "@prisma/client";
import { generateMixedId } from "./generateMixedId.js";
import { prisma } from "./prisma.js";

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
}): Promise<void> {
  await prisma.userNotification.create({
    data: {
      id: generateMixedId(),
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}

export function formatAppointmentWhen(date: string, time: string | null): string {
  return `${date}${time ? ` a las ${time}` : ""}`;
}
