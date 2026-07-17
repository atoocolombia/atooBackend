import { ProcedureSuggestionStatus, UserType } from "@prisma/client";
import type { Request, Response } from "express";
import { Router } from "express";
import { generateMixedId } from "../lib/generateMixedId.js";
import { formatCop } from "../lib/inspectionSession.js";
import { readActorEmail } from "../lib/landingAuditLog.js";
import { prisma } from "../lib/prisma.js";
import { createUserNotification } from "../lib/userNotifications.js";
import { buildUserDisplayName } from "../lib/userProfile.js";

export const adminInspectionsRouter = Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

async function requireAdminActor(req: Request, res: Response): Promise<{ id: string; email: string } | null> {
  const email = readActorEmail(req);
  if (!EMAIL_REGEX.test(email) || email === "desconocido@atoo.local") {
    res.status(401).json({ error: "Inicia sesión como administrador para continuar" });
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, userType: true },
  });

  if (!user || user.userType !== UserType.ADMIN) {
    res.status(403).json({ error: "Solo administradores pueden autorizar procedimientos" });
    return null;
  }

  return user;
}

function mapSuggestion(row: {
  id: string;
  title: string;
  description: string | null;
  estimatedCostCop: number | null;
  isUrgent: boolean;
  status: ProcedureSuggestionStatus;
  adminNotes: string | null;
  reviewedAt: Date | null;
  deadlineAt: Date | null;
  createdAt: Date;
  session: {
    id: string;
    appointmentId: string;
    appointment: {
      appointmentDate: string;
      appointmentTime: string | null;
      reason: string | null;
      workshop: { name: string; city: string };
      user: {
        email: string;
        identityExtraction: { firstName: string | null; lastName: string | null } | null;
      };
    };
  };
}) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    estimatedCostCop: row.estimatedCostCop,
    isUrgent: row.isUrgent,
    status: row.status,
    adminNotes: row.adminNotes,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    deadlineAt: row.deadlineAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    sessionId: row.session.id,
    appointmentId: row.session.appointmentId,
    appointmentDate: row.session.appointment.appointmentDate,
    appointmentTime: row.session.appointment.appointmentTime,
    reason: row.session.appointment.reason,
    workshopName: row.session.appointment.workshop.name,
    workshopCity: row.session.appointment.workshop.city,
    clientEmail: row.session.appointment.user.email,
    clientDisplayName: buildUserDisplayName(
      row.session.appointment.user.email,
      row.session.appointment.user.identityExtraction?.firstName,
      row.session.appointment.user.identityExtraction?.lastName,
    ),
  };
}

const suggestionInclude = {
  session: {
    include: {
      appointment: {
        include: {
          workshop: { select: { name: true, city: true } },
          user: {
            select: {
              email: true,
              identityExtraction: { select: { firstName: true, lastName: true } },
            },
          },
        },
      },
    },
  },
} as const;

adminInspectionsRouter.get("/procedure-suggestions", async (req, res, next) => {
  try {
    const admin = await requireAdminActor(req, res);
    if (!admin) return;

    const statusFilter = String(req.query.status ?? "PENDING_ADMIN");
    const where =
      statusFilter === "ALL"
        ? {}
        : {
            status: statusFilter as ProcedureSuggestionStatus,
          };

    const rows = await prisma.inspectionProcedureSuggestion.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      include: suggestionInclude,
    });

    res.json(rows.map(mapSuggestion));
  } catch (err) {
    next(err);
  }
});

adminInspectionsRouter.get("/notifications", async (req, res, next) => {
  try {
    const admin = await requireAdminActor(req, res);
    if (!admin) return;

    const rows = await prisma.userNotification.findMany({
      where: { userId: admin.id },
      orderBy: { createdAt: "desc" },
      take: 40,
    });

    res.json(
      rows.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        metadata: n.metadata,
        read: n.read,
        createdAt: n.createdAt.toISOString(),
      })),
    );
  } catch (err) {
    next(err);
  }
});

adminInspectionsRouter.patch("/notifications/:notificationId/read", async (req, res, next) => {
  try {
    const admin = await requireAdminActor(req, res);
    if (!admin) return;

    const notificationId = String(req.params.notificationId ?? "");
    const updated = await prisma.userNotification.updateMany({
      where: { id: notificationId, userId: admin.id },
      data: { read: true },
    });
    if (updated.count === 0) {
      res.status(404).json({ error: "Notificación no encontrada" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

adminInspectionsRouter.patch("/procedure-suggestions/:suggestionId", async (req, res, next) => {
  try {
    const admin = await requireAdminActor(req, res);
    if (!admin) return;

    const suggestionId = String(req.params.suggestionId ?? "");
    const { action, adminNotes, estimatedCostCop, isUrgent } = req.body as {
      action?: "approve" | "reject";
      adminNotes?: string;
      estimatedCostCop?: number | null;
      isUrgent?: boolean;
    };

    const suggestion = await prisma.inspectionProcedureSuggestion.findUnique({
      where: { id: suggestionId },
      include: {
        session: {
          include: {
            appointment: {
              include: {
                workshop: { select: { name: true, city: true } },
                user: {
                  select: {
                    id: true,
                    email: true,
                    identityExtraction: { select: { firstName: true, lastName: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!suggestion) {
      res.status(404).json({ error: "Sugerencia no encontrada" });
      return;
    }
    if (suggestion.status !== ProcedureSuggestionStatus.PENDING_ADMIN) {
      res.status(400).json({ error: "Esta sugerencia ya fue revisada" });
      return;
    }

    if (action === "reject") {
      const updated = await prisma.inspectionProcedureSuggestion.update({
        where: { id: suggestionId },
        data: {
          status: ProcedureSuggestionStatus.REJECTED,
          adminNotes: typeof adminNotes === "string" ? adminNotes.trim() || null : null,
          reviewedAt: new Date(),
          reviewedByUserId: admin.id,
        },
        include: suggestionInclude,
      });

      await createUserNotification({
        userId: suggestion.session.appointment.userId,
        type: "procedure_rejected",
        title: "Procedimiento no autorizado",
        message: `El procedimiento "${suggestion.title}" no fue autorizado por atoo.`,
        metadata: {
          suggestionId,
          appointmentId: suggestion.session.appointmentId,
        },
      });

      res.json(mapSuggestion(updated));
      return;
    }

    if (action !== "approve") {
      res.status(400).json({ error: "Acción inválida. Usa approve o reject." });
      return;
    }

    const finalCost =
      estimatedCostCop !== undefined
        ? estimatedCostCop == null
          ? null
          : Number(estimatedCostCop)
        : suggestion.estimatedCostCop;

    if (finalCost != null && (!Number.isFinite(finalCost) || finalCost < 0)) {
      res.status(400).json({ error: "Costo inválido" });
      return;
    }

    const urgent = isUrgent !== undefined ? Boolean(isUrgent) : suggestion.isUrgent;
    const hasCost = finalCost != null && finalCost > 0;

    if (!hasCost) {
      const maxSort = await prisma.inspectionChecklistItem.aggregate({
        where: { sessionId: suggestion.sessionId },
        _max: { sortOrder: true },
      });

      const updated = await prisma.$transaction(async (tx) => {
        await tx.inspectionChecklistItem.create({
          data: {
            id: generateMixedId(),
            sessionId: suggestion.sessionId,
            title: suggestion.title,
            description:
              suggestion.description ??
              "Procedimiento adicional autorizado sin costo durante la cita actual",
            sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
          },
        });

        return tx.inspectionProcedureSuggestion.update({
          where: { id: suggestionId },
          data: {
            status: ProcedureSuggestionStatus.APPROVED_IMMEDIATE,
            estimatedCostCop: null,
            isUrgent: urgent,
            adminNotes: typeof adminNotes === "string" ? adminNotes.trim() || null : null,
            reviewedAt: new Date(),
            reviewedByUserId: admin.id,
            deadlineAt: null,
          },
          include: suggestionInclude,
        });
      });

      await createUserNotification({
        userId: suggestion.session.appointment.userId,
        type: "procedure_approved_immediate",
        title: "Ajuste autorizado en tu cita actual",
        message: `Se autorizó el procedimiento "${suggestion.title}" sin costo. El taller lo realizará durante esta misma revisión.`,
        metadata: {
          suggestionId,
          appointmentId: suggestion.session.appointmentId,
          estimatedCostCop: null,
        },
      });

      res.json(mapSuggestion(updated));
      return;
    }

    const deadlineAt = urgent ? new Date(Date.now() + ONE_WEEK_MS) : null;
    const updated = await prisma.inspectionProcedureSuggestion.update({
      where: { id: suggestionId },
      data: {
        status: ProcedureSuggestionStatus.APPROVED_CLIENT_SCHEDULE,
        estimatedCostCop: finalCost,
        isUrgent: urgent,
        adminNotes: typeof adminNotes === "string" ? adminNotes.trim() || null : null,
        reviewedAt: new Date(),
        reviewedByUserId: admin.id,
        deadlineAt,
      },
      include: suggestionInclude,
    });

    const deadlineLabel = deadlineAt
      ? deadlineAt.toLocaleDateString("es-CO", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : null;

    await createUserNotification({
      userId: suggestion.session.appointment.userId,
      type: urgent ? "procedure_approved_urgent" : "procedure_approved_schedule",
      title: urgent
        ? "Ajuste urgente con costo — agenda en 7 días"
        : "Ajuste con costo autorizado",
      message: urgent
        ? `Se autorizó "${suggestion.title}" (${formatCop(finalCost)}). Es urgente: tienes hasta el ${deadlineLabel} para agendar e ir a completar el ajuste.`
        : `Se autorizó "${suggestion.title}" (${formatCop(finalCost)}). Agenda una cita en el taller para completar el ajuste.`,
      metadata: {
        suggestionId,
        appointmentId: suggestion.session.appointmentId,
        estimatedCostCop: finalCost,
        isUrgent: urgent,
        deadlineAt: deadlineAt?.toISOString() ?? null,
      },
    });

    res.json(mapSuggestion(updated));
  } catch (err) {
    next(err);
  }
});
