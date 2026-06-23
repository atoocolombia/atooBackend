import type { Request } from "express";
import type { Prisma } from "@prisma/client";
import { generateMixedId } from "./generateMixedId.js";
import { prisma } from "./prisma.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function readActorEmail(req: Pick<Request, "get">): string {
  const header = req.get("x-actor-email")?.trim().toLowerCase();
  if (header && EMAIL_REGEX.test(header)) {
    return header;
  }
  return "desconocido@atoo.local";
}

export async function recordLandingAudit(
  actorEmail: string,
  action: string,
  summary: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.landingAuditLog.create({
      data: {
        id: generateMixedId(),
        actorEmail,
        action,
        summary,
        metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    console.warn("[audit] No se pudo registrar cambio en landing:", err);
  }
}
