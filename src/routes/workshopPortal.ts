import { InspectionAppointmentStatus, UserType } from "@prisma/client";
import type { Request, Response } from "express";
import { Router } from "express";
import {
  mapAvailabilitySlot,
  mapInspectionAppointment,
} from "../lib/inspectionAppointmentMapper.js";
import {
  createDefaultChecklist,
  loadSessionByAppointmentId,
  mapInspectionSession,
  notifyAllAdmins,
} from "../lib/inspectionSession.js";
import { buildUserDisplayName } from "../lib/userProfile.js";
import { generateMixedId } from "../lib/generateMixedId.js";
import { prisma } from "../lib/prisma.js";
import { resolveStoredFile } from "../lib/uploadStorage.js";
import {
  createUserNotification,
  formatAppointmentWhen,
} from "../lib/userNotifications.js";

export const workshopPortalRouter = Router({ mergeParams: true });

function paramUserId(req: Request): string {
  const v = req.params.userId;
  return Array.isArray(v) ? v[0] ?? "" : v ?? "";
}

async function loadWorkshopForUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, userType: true },
  });
  if (!user || user.userType !== UserType.WORKSHOP) {
    return null;
  }

  const workshop = await prisma.workshop.findFirst({
    where: { userId },
  });
  if (!workshop) {
    return null;
  }

  return { user, workshop };
}

workshopPortalRouter.get("/summary", async (req, res, next) => {
  try {
    const ctx = await loadWorkshopForUser(paramUserId(req));
    if (!ctx) {
      res.status(404).json({ error: "Taller no encontrado para este usuario" });
      return;
    }

    const { workshop } = ctx;
    const [pendingCount, clientCounterCount, todayCount, upcomingSlots] = await Promise.all([
      prisma.inspectionAppointment.count({
        where: { workshopId: workshop.id, status: InspectionAppointmentStatus.PENDING },
      }),
      prisma.inspectionAppointment.count({
        where: {
          workshopId: workshop.id,
          status: InspectionAppointmentStatus.RESCHEDULE_PENDING,
          rescheduleInitiatedBy: "CLIENT",
        },
      }),
      prisma.inspectionAppointment.count({
        where: {
          workshopId: workshop.id,
          appointmentDate: new Date().toISOString().slice(0, 10),
          status: { in: [InspectionAppointmentStatus.PENDING, InspectionAppointmentStatus.CONFIRMED] },
        },
      }),
      prisma.workshopAvailabilitySlot.count({
        where: {
          workshopId: workshop.id,
          date: { gte: new Date().toISOString().slice(0, 10) },
        },
      }),
    ]);

    res.json({
      workshop: {
        id: workshop.id,
        name: workshop.name,
        address: workshop.address,
        city: workshop.city,
        phone: workshop.phone,
      },
      pendingRequests: pendingCount + clientCounterCount,
      appointmentsToday: todayCount,
      upcomingAvailabilityDays: upcomingSlots,
    });
  } catch (err) {
    next(err);
  }
});

workshopPortalRouter.get("/appointments", async (req, res, next) => {
  try {
    const ctx = await loadWorkshopForUser(paramUserId(req));
    if (!ctx) {
      res.status(404).json({ error: "Taller no encontrado para este usuario" });
      return;
    }

    const rows = await prisma.inspectionAppointment.findMany({
      where: { workshopId: ctx.workshop.id },
      orderBy: [{ appointmentDate: "asc" }, { appointmentTime: "asc" }, { createdAt: "desc" }],
      include: {
        workshop: { select: { name: true, address: true, city: true } },
        user: {
          select: {
            email: true,
            identityExtraction: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    res.json(
      rows.map((row) =>
        mapInspectionAppointment({
          ...row,
          user: {
            email: row.user.email,
            identityExtraction: row.user.identityExtraction,
          },
        }),
      ),
    );
  } catch (err) {
    next(err);
  }
});

workshopPortalRouter.patch("/appointments/:appointmentId", async (req, res, next) => {
  try {
    const ctx = await loadWorkshopForUser(paramUserId(req));
    if (!ctx) {
      res.status(404).json({ error: "Taller no encontrado para este usuario" });
      return;
    }

    const appointmentId = String(req.params.appointmentId ?? "");
    const { status, workshopNotes } = req.body as {
      status?: InspectionAppointmentStatus;
      workshopNotes?: string;
    };

    const allowed = new Set(Object.values(InspectionAppointmentStatus));
    if (!status || !allowed.has(status)) {
      res.status(400).json({ error: "Estado inválido" });
      return;
    }

    const existing = await prisma.inspectionAppointment.findFirst({
      where: { id: appointmentId, workshopId: ctx.workshop.id },
    });
    if (!existing) {
      res.status(404).json({ error: "Cita no encontrada" });
      return;
    }

    const applyClientProposal =
      status === InspectionAppointmentStatus.CONFIRMED &&
      existing.status === InspectionAppointmentStatus.RESCHEDULE_PENDING &&
      existing.rescheduleInitiatedBy === "CLIENT" &&
      existing.proposedAppointmentDate;

    const updated = await prisma.inspectionAppointment.update({
      where: { id: appointmentId },
      data: {
        status,
        workshopNotes: typeof workshopNotes === "string" ? workshopNotes.trim() || null : undefined,
        ...(applyClientProposal
          ? {
              appointmentDate: existing.proposedAppointmentDate!,
              appointmentTime: existing.proposedAppointmentTime,
              proposedAppointmentDate: null,
              proposedAppointmentTime: null,
              rescheduleInitiatedBy: null,
            }
          : {}),
      },
      include: {
        workshop: { select: { name: true, address: true, city: true } },
        user: {
          select: {
            email: true,
            identityExtraction: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    if (applyClientProposal) {
      await createUserNotification({
        userId: existing.userId,
        type: "reschedule_accepted",
        title: "Nueva fecha confirmada",
        message: `${ctx.workshop.name} aceptó tu propuesta. Tu cita quedó para el ${formatAppointmentWhen(existing.proposedAppointmentDate!, existing.proposedAppointmentTime)}.`,
        metadata: { appointmentId: existing.id },
      });
    }

    res.json(
      mapInspectionAppointment({
        ...updated,
        user: {
          email: updated.user.email,
          identityExtraction: updated.user.identityExtraction,
        },
      }),
    );
  } catch (err) {
    next(err);
  }
});

workshopPortalRouter.post("/appointments/:appointmentId/reschedule", async (req, res, next) => {
  try {
    const ctx = await loadWorkshopForUser(paramUserId(req));
    if (!ctx) {
      res.status(404).json({ error: "Taller no encontrado para este usuario" });
      return;
    }

    const appointmentId = String(req.params.appointmentId ?? "");
    const { appointmentDate, appointmentTime, note } = req.body as {
      appointmentDate?: string;
      appointmentTime?: string;
      note?: string;
    };

    const newDate = appointmentDate?.trim();
    const newTime = appointmentTime?.trim() || null;

    if (!newDate || !/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
      res.status(400).json({ error: "Fecha inválida (usa YYYY-MM-DD)" });
      return;
    }
    if (!newTime) {
      res.status(400).json({ error: "Horario obligatorio" });
      return;
    }

    const existing = await prisma.inspectionAppointment.findFirst({
      where: { id: appointmentId, workshopId: ctx.workshop.id },
      include: {
        workshop: { select: { name: true, address: true, city: true } },
        user: {
          select: {
            email: true,
            identityExtraction: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!existing) {
      res.status(404).json({ error: "Cita no encontrada" });
      return;
    }

    if (
      existing.status !== InspectionAppointmentStatus.PENDING &&
      existing.status !== InspectionAppointmentStatus.CONFIRMED &&
      existing.status !== InspectionAppointmentStatus.RESCHEDULE_PENDING
    ) {
      res.status(400).json({ error: "Esta cita no se puede reagendar" });
      return;
    }

    const slot = await prisma.workshopAvailabilitySlot.findFirst({
      where: {
        workshopId: ctx.workshop.id,
        date: newDate,
        startTime: newTime,
      },
    });
    if (!slot || slot.bookedCount >= slot.maxAppointments) {
      res.status(400).json({ error: "No hay cupo disponible en esa fecha y horario" });
      return;
    }

    const updated = await prisma.inspectionAppointment.update({
      where: { id: appointmentId },
      data: {
        status: InspectionAppointmentStatus.RESCHEDULE_PENDING,
        proposedAppointmentDate: newDate,
        proposedAppointmentTime: newTime,
        rescheduleInitiatedBy: "WORKSHOP",
        workshopNotes: typeof note === "string" ? note.trim() || existing.workshopNotes : existing.workshopNotes,
      },
      include: {
        workshop: { select: { name: true, address: true, city: true } },
        user: {
          select: {
            email: true,
            identityExtraction: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    await createUserNotification({
      userId: existing.userId,
      type: "reschedule_proposed",
      title: "Propuesta de nueva fecha de revisión",
      message: `${ctx.workshop.name} propone reagendar tu cita al ${formatAppointmentWhen(newDate, newTime)}. Revisa y confirma o elige otra fecha.`,
      metadata: {
        appointmentId: existing.id,
        workshopName: ctx.workshop.name,
        previousDate: existing.appointmentDate,
        previousTime: existing.appointmentTime,
        proposedDate: newDate,
        proposedTime: newTime,
      },
    });

    res.json(
      mapInspectionAppointment({
        ...updated,
        user: {
          email: updated.user.email,
          identityExtraction: updated.user.identityExtraction,
        },
      }),
    );
  } catch (err) {
    next(err);
  }
});

workshopPortalRouter.get("/appointments/:appointmentId/proof", async (req, res, next) => {
  try {
    const ctx = await loadWorkshopForUser(paramUserId(req));
    if (!ctx) {
      res.status(404).json({ error: "Taller no encontrado para este usuario" });
      return;
    }

    const appointmentId = String(req.params.appointmentId ?? "");
    const appointment = await prisma.inspectionAppointment.findFirst({
      where: { id: appointmentId, workshopId: ctx.workshop.id },
    });
    if (!appointment?.proofStoredPath) {
      res.status(404).json({ error: "Prueba no encontrada" });
      return;
    }

    res.sendFile(resolveStoredFile(appointment.proofStoredPath));
  } catch (err) {
    next(err);
  }
});

workshopPortalRouter.post("/appointments/:appointmentId/session/start", async (req, res, next) => {
  try {
    const ctx = await loadWorkshopForUser(paramUserId(req));
    if (!ctx) {
      res.status(404).json({ error: "Taller no encontrado para este usuario" });
      return;
    }

    const appointmentId = String(req.params.appointmentId ?? "");
    const appointment = await prisma.inspectionAppointment.findFirst({
      where: { id: appointmentId, workshopId: ctx.workshop.id },
    });
    if (!appointment) {
      res.status(404).json({ error: "Cita no encontrada" });
      return;
    }

    if (
      appointment.status !== InspectionAppointmentStatus.CONFIRMED &&
      appointment.status !== InspectionAppointmentStatus.IN_PROGRESS
    ) {
      res.status(400).json({ error: "Solo puedes iniciar la revisión de una cita confirmada" });
      return;
    }

    const existingSession = await loadSessionByAppointmentId(appointmentId);
    if (existingSession) {
      res.json(mapInspectionSession(existingSession));
      return;
    }

    const sessionId = generateMixedId();
    await prisma.$transaction([
      prisma.inspectionSession.create({
        data: {
          id: sessionId,
          appointmentId,
          status: "IN_PROGRESS",
        },
      }),
      prisma.inspectionAppointment.update({
        where: { id: appointmentId },
        data: { status: InspectionAppointmentStatus.IN_PROGRESS },
      }),
    ]);

    await createDefaultChecklist(sessionId);

    await createUserNotification({
      userId: appointment.userId,
      type: "inspection_started",
      title: "Tu revisión ya comenzó",
      message: `${ctx.workshop.name} inició la revisión técnico-mecánica de tu vehículo.`,
      metadata: { appointmentId, sessionId },
    });

    const session = await loadSessionByAppointmentId(appointmentId);
    res.status(201).json(mapInspectionSession(session!));
  } catch (err) {
    next(err);
  }
});

workshopPortalRouter.get("/appointments/:appointmentId/session", async (req, res, next) => {
  try {
    const ctx = await loadWorkshopForUser(paramUserId(req));
    if (!ctx) {
      res.status(404).json({ error: "Taller no encontrado para este usuario" });
      return;
    }

    const appointmentId = String(req.params.appointmentId ?? "");
    const appointment = await prisma.inspectionAppointment.findFirst({
      where: { id: appointmentId, workshopId: ctx.workshop.id },
      select: { id: true },
    });
    if (!appointment) {
      res.status(404).json({ error: "Cita no encontrada" });
      return;
    }

    const session = await loadSessionByAppointmentId(appointmentId);
    if (!session) {
      res.status(404).json({ error: "La revisión aún no ha iniciado" });
      return;
    }

    res.json(mapInspectionSession(session));
  } catch (err) {
    next(err);
  }
});

workshopPortalRouter.patch(
  "/appointments/:appointmentId/session/checklist/:itemId",
  async (req, res, next) => {
    try {
      const ctx = await loadWorkshopForUser(paramUserId(req));
      if (!ctx) {
        res.status(404).json({ error: "Taller no encontrado para este usuario" });
        return;
      }

      const appointmentId = String(req.params.appointmentId ?? "");
      const itemId = String(req.params.itemId ?? "");
      const { completed } = req.body as { completed?: boolean };

      if (typeof completed !== "boolean") {
        res.status(400).json({ error: "Indica completed: true o false" });
        return;
      }

      const session = await prisma.inspectionSession.findFirst({
        where: {
          appointmentId,
          appointment: { workshopId: ctx.workshop.id },
        },
      });
      if (!session) {
        res.status(404).json({ error: "Sesión no encontrada" });
        return;
      }
      if (session.status !== "IN_PROGRESS") {
        res.status(400).json({ error: "La revisión ya fue cerrada" });
        return;
      }

      const updated = await prisma.inspectionChecklistItem.updateMany({
        where: { id: itemId, sessionId: session.id },
        data: {
          completed,
          completedAt: completed ? new Date() : null,
        },
      });
      if (updated.count === 0) {
        res.status(404).json({ error: "Paso no encontrado" });
        return;
      }

      const fresh = await loadSessionByAppointmentId(appointmentId);
      res.json(mapInspectionSession(fresh!));
    } catch (err) {
      next(err);
    }
  },
);

workshopPortalRouter.post(
  "/appointments/:appointmentId/session/suggestions",
  async (req, res, next) => {
    try {
      const ctx = await loadWorkshopForUser(paramUserId(req));
      if (!ctx) {
        res.status(404).json({ error: "Taller no encontrado para este usuario" });
        return;
      }

      const appointmentId = String(req.params.appointmentId ?? "");
      const { title, description, estimatedCostCop, isUrgent } = req.body as {
        title?: string;
        description?: string;
        estimatedCostCop?: number | null;
        isUrgent?: boolean;
      };

      const cleanTitle = title?.trim() ?? "";
      if (!cleanTitle) {
        res.status(400).json({ error: "El título del procedimiento es obligatorio" });
        return;
      }

      const session = await prisma.inspectionSession.findFirst({
        where: {
          appointmentId,
          appointment: { workshopId: ctx.workshop.id },
        },
        include: {
          appointment: {
            include: {
              user: {
                select: {
                  email: true,
                  identityExtraction: { select: { firstName: true, lastName: true } },
                },
              },
            },
          },
        },
      });
      if (!session) {
        res.status(404).json({ error: "Sesión no encontrada" });
        return;
      }
      if (session.status !== "IN_PROGRESS") {
        res.status(400).json({ error: "La revisión ya fue cerrada" });
        return;
      }

      const cost =
        estimatedCostCop == null || estimatedCostCop === undefined
          ? null
          : Number(estimatedCostCop);
      if (cost != null && (!Number.isFinite(cost) || cost < 0)) {
        res.status(400).json({ error: "Costo inválido" });
        return;
      }

      const suggestion = await prisma.inspectionProcedureSuggestion.create({
        data: {
          id: generateMixedId(),
          sessionId: session.id,
          title: cleanTitle,
          description: description?.trim() || null,
          estimatedCostCop: cost,
          isUrgent: Boolean(isUrgent),
        },
      });

      const clientName = buildUserDisplayName(
        session.appointment.user.email,
        session.appointment.user.identityExtraction?.firstName,
        session.appointment.user.identityExtraction?.lastName,
      );

      await notifyAllAdmins({
        type: "procedure_authorization",
        title: "Autorización de procedimiento requerida",
        message: `${ctx.workshop.name} sugiere "${cleanTitle}" para ${clientName}. Revisa y autoriza o rechaza.`,
        metadata: {
          suggestionId: suggestion.id,
          sessionId: session.id,
          appointmentId,
          workshopName: ctx.workshop.name,
          title: cleanTitle,
          estimatedCostCop: cost,
          isUrgent: Boolean(isUrgent),
        },
      });

      const fresh = await loadSessionByAppointmentId(appointmentId);
      res.status(201).json(mapInspectionSession(fresh!));
    } catch (err) {
      next(err);
    }
  },
);

workshopPortalRouter.post("/appointments/:appointmentId/session/complete", async (req, res, next) => {
  try {
    const ctx = await loadWorkshopForUser(paramUserId(req));
    if (!ctx) {
      res.status(404).json({ error: "Taller no encontrado para este usuario" });
      return;
    }

    const appointmentId = String(req.params.appointmentId ?? "");
    const { notes } = req.body as { notes?: string };

    const session = await prisma.inspectionSession.findFirst({
      where: {
        appointmentId,
        appointment: { workshopId: ctx.workshop.id },
      },
      include: { appointment: true, checklistItems: true },
    });
    if (!session) {
      res.status(404).json({ error: "Sesión no encontrada" });
      return;
    }
    if (session.status !== "IN_PROGRESS") {
      res.status(400).json({ error: "La revisión ya fue cerrada" });
      return;
    }

    const pendingSuggestions = await prisma.inspectionProcedureSuggestion.count({
      where: { sessionId: session.id, status: "PENDING_ADMIN" },
    });
    if (pendingSuggestions > 0) {
      res.status(400).json({
        error: "Hay procedimientos pendientes de autorización del administrador",
      });
      return;
    }

    await prisma.$transaction([
      prisma.inspectionSession.update({
        where: { id: session.id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          notes: typeof notes === "string" ? notes.trim() || null : session.notes,
        },
      }),
      prisma.inspectionAppointment.update({
        where: { id: appointmentId },
        data: { status: InspectionAppointmentStatus.COMPLETED },
      }),
    ]);

    await createUserNotification({
      userId: session.appointment.userId,
      type: "inspection_completed",
      title: "Revisión completada",
      message: `${ctx.workshop.name} finalizó la revisión técnico-mecánica de tu vehículo.`,
      metadata: { appointmentId, sessionId: session.id },
    });

    const fresh = await loadSessionByAppointmentId(appointmentId);
    res.json(mapInspectionSession(fresh!));
  } catch (err) {
    next(err);
  }
});

workshopPortalRouter.get("/availability", async (req, res, next) => {
  try {
    const ctx = await loadWorkshopForUser(paramUserId(req));
    if (!ctx) {
      res.status(404).json({ error: "Taller no encontrado para este usuario" });
      return;
    }

    const from = typeof req.query.from === "string" ? req.query.from : new Date().toISOString().slice(0, 10);

    const slots = await prisma.workshopAvailabilitySlot.findMany({
      where: { workshopId: ctx.workshop.id, date: { gte: from } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });

    res.json(slots.map(mapAvailabilitySlot));
  } catch (err) {
    next(err);
  }
});

workshopPortalRouter.post("/availability", async (req, res, next) => {
  try {
    const ctx = await loadWorkshopForUser(paramUserId(req));
    if (!ctx) {
      res.status(404).json({ error: "Taller no encontrado para este usuario" });
      return;
    }

    const { date, startTime, endTime, maxAppointments } = req.body as {
      date?: string;
      startTime?: string;
      endTime?: string;
      maxAppointments?: number;
    };

    if (!date || !startTime || !endTime || !maxAppointments) {
      res.status(400).json({ error: "Fecha, horario y capacidad son obligatorios" });
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: "Fecha inválida" });
      return;
    }
    if (maxAppointments < 1 || maxAppointments > 50) {
      res.status(400).json({ error: "Capacidad debe estar entre 1 y 50" });
      return;
    }

    const slot = await prisma.workshopAvailabilitySlot.create({
      data: {
        id: generateMixedId(),
        workshopId: ctx.workshop.id,
        date,
        startTime,
        endTime,
        maxAppointments,
      },
    });

    res.status(201).json(mapAvailabilitySlot(slot));
  } catch (err) {
    next(err);
  }
});

workshopPortalRouter.patch("/availability/:slotId", async (req, res, next) => {
  try {
    const ctx = await loadWorkshopForUser(paramUserId(req));
    if (!ctx) {
      res.status(404).json({ error: "Taller no encontrado para este usuario" });
      return;
    }

    const slotId = String(req.params.slotId ?? "");
    const { startTime, endTime, maxAppointments } = req.body as {
      startTime?: string;
      endTime?: string;
      maxAppointments?: number;
    };

    const existing = await prisma.workshopAvailabilitySlot.findFirst({
      where: { id: slotId, workshopId: ctx.workshop.id },
    });
    if (!existing) {
      res.status(404).json({ error: "Franja no encontrada" });
      return;
    }

    if (maxAppointments !== undefined && maxAppointments < existing.bookedCount) {
      res.status(400).json({ error: "La capacidad no puede ser menor a las citas ya reservadas" });
      return;
    }

    const slot = await prisma.workshopAvailabilitySlot.update({
      where: { id: slotId },
      data: {
        startTime: startTime?.trim() || undefined,
        endTime: endTime?.trim() || undefined,
        maxAppointments: maxAppointments ?? undefined,
      },
    });

    res.json(mapAvailabilitySlot(slot));
  } catch (err) {
    next(err);
  }
});

workshopPortalRouter.delete("/availability/:slotId", async (req, res, next) => {
  try {
    const ctx = await loadWorkshopForUser(paramUserId(req));
    if (!ctx) {
      res.status(404).json({ error: "Taller no encontrado para este usuario" });
      return;
    }

    const slotId = String(req.params.slotId ?? "");
    const existing = await prisma.workshopAvailabilitySlot.findFirst({
      where: { id: slotId, workshopId: ctx.workshop.id },
    });
    if (!existing) {
      res.status(404).json({ error: "Franja no encontrada" });
      return;
    }
    if (existing.bookedCount > 0) {
      res.status(400).json({ error: "No puedes eliminar una franja con citas reservadas" });
      return;
    }

    await prisma.workshopAvailabilitySlot.delete({ where: { id: slotId } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

workshopPortalRouter.get("/notifications", async (req, res, next) => {
  try {
    const ctx = await loadWorkshopForUser(paramUserId(req));
    if (!ctx) {
      res.status(404).json({ error: "Taller no encontrado para este usuario" });
      return;
    }

    const pending = await prisma.inspectionAppointment.findMany({
      where: {
        workshopId: ctx.workshop.id,
        OR: [
          { status: InspectionAppointmentStatus.PENDING },
          {
            status: InspectionAppointmentStatus.RESCHEDULE_PENDING,
            rescheduleInitiatedBy: "CLIENT",
          },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        workshop: { select: { name: true, address: true, city: true } },
        user: {
          select: {
            email: true,
            identityExtraction: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    res.json(
      pending.map((row) => {
        const displayName = buildUserDisplayName(
          row.user.email,
          row.user.identityExtraction?.firstName,
          row.user.identityExtraction?.lastName,
        );
        return {
          id: row.id,
          type:
            row.status === InspectionAppointmentStatus.RESCHEDULE_PENDING
              ? "reschedule_counter"
              : row.kind === "BUSINESS_PLANNED"
                ? "planned"
                : "request",
          title:
            row.status === InspectionAppointmentStatus.RESCHEDULE_PENDING
              ? "Cliente propuso otra fecha"
              : row.kind === "BUSINESS_PLANNED"
                ? "Cita planificada por atoo"
                : "Nueva solicitud de cliente",
          message:
            row.status === InspectionAppointmentStatus.RESCHEDULE_PENDING
              ? `${displayName} propone ${row.proposedAppointmentDate ?? row.appointmentDate} ${row.proposedAppointmentTime ?? row.appointmentTime ?? ""}`.trim()
              : `${displayName} — ${row.appointmentDate} ${row.appointmentTime ?? ""}`.trim(),
          createdAt: row.createdAt.toISOString(),
          read: false,
        };
      }),
    );
  } catch (err) {
    next(err);
  }
});
