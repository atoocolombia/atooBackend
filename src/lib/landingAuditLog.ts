import type { Request } from "express";
import type { Prisma } from "@prisma/client";
import { generateMixedId } from "./generateMixedId.js";
import { prisma } from "./prisma.js";

/** Identidad del actor desde la sesión JWT (nunca desde headers spoofables). */
export function readActorEmail(req: Request): string {
  const email = req.auth?.email?.trim().toLowerCase();
  if (email) return email;
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
