import { Router } from "express";
import { generateMixedId } from "../lib/generateMixedId.js";
import { prisma } from "../lib/prisma.js";
import { buildClientName } from "../lib/mapVehicleDelivery.js";
import {
  computeEvaluationScores,
  PRACTICAL_EVAL_QUESTIONS,
} from "../lib/practicalTestEvaluationContent.js";
import { listAvailablePracticalTestSlots } from "../lib/practicalTestSlots.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const analystPracticalTestRouter = Router();

analystPracticalTestRouter.use(requireAuth, requireRole("ANALYST", "ADMIN"));

analystPracticalTestRouter.get("/weekly-schedule", async (req, res, next) => {
  try {
    const analystUserId = req.auth!.id;
    const rows = await prisma.analystWeeklySchedule.findMany({
      where: { analystUserId },
      orderBy: { weekday: "asc" },
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

analystPracticalTestRouter.put("/weekly-schedule", async (req, res, next) => {
  try {
    const analystUserId = req.auth!.id;
    const items = (req.body as { items?: unknown }).items;
    if (!Array.isArray(items)) {
      res.status(400).json({ error: "items debe ser un arreglo" });
      return;
    }

    await prisma.analystWeeklySchedule.deleteMany({ where: { analystUserId } });

    for (const raw of items) {
      if (!raw || typeof raw !== "object") continue;
      const row = raw as Record<string, unknown>;
      const weekday = row.weekday;
      const startTime = row.startTime;
      const endTime = row.endTime;
      const slotMinutes = row.slotMinutes ?? 60;
      if (typeof weekday !== "number" || weekday < 0 || weekday > 6) continue;
      if (typeof startTime !== "string" || typeof endTime !== "string") continue;
      await prisma.analystWeeklySchedule.create({
        data: {
          id: generateMixedId(),
          analystUserId,
          weekday,
          startTime,
          endTime,
          slotMinutes: typeof slotMinutes === "number" ? slotMinutes : 60,
        },
      });
    }

    const rows = await prisma.analystWeeklySchedule.findMany({
      where: { analystUserId },
      orderBy: { weekday: "asc" },
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

analystPracticalTestRouter.get("/appointments", async (req, res, next) => {
  try {
    const analystUserId = req.auth!.id;
    const from = typeof req.query.from === "string" ? req.query.from : new Date().toISOString().slice(0, 10);
    const to =
      typeof req.query.to === "string"
        ? req.query.to
        : new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

    const rows = await prisma.practicalTestAppointment.findMany({
      where: {
        analystUserId,
        date: { gte: from, lte: to },
        status: { not: "CANCELLED" },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      include: {
        user: { include: { identityExtraction: true } },
        evaluation: true,
      },
    });

    res.json(
      rows.map((row) => ({
        id: row.id,
        date: row.date,
        startTime: row.startTime,
        endTime: row.endTime,
        status: row.status,
        clientName: buildClientName(row.user.identityExtraction, row.user.email),
        clientEmail: row.user.email,
        userId: row.userId,
        applicationId: row.applicationId,
        hasEvaluation: Boolean(row.evaluation),
        evaluation: row.evaluation
          ? {
              experienceScore: row.evaluation.experienceScore,
              customerServiceScore: row.evaluation.customerServiceScore,
              overallScore: row.evaluation.overallScore,
              submittedAt: row.evaluation.submittedAt.toISOString(),
            }
          : null,
      })),
    );
  } catch (err) {
    next(err);
  }
});

analystPracticalTestRouter.get("/evaluation-form", (_req, res) => {
  res.json({ questions: PRACTICAL_EVAL_QUESTIONS });
});

analystPracticalTestRouter.post("/appointments/:appointmentId/evaluation", async (req, res, next) => {
  try {
    const analystUserId = req.auth!.id;
    const appointmentId = req.params.appointmentId;
    const answers = (req.body as { answers?: unknown }).answers;
    const analystNotes = (req.body as { analystNotes?: string }).analystNotes;

    if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
      res.status(400).json({ error: "answers es obligatorio" });
      return;
    }

    const appt = await prisma.practicalTestAppointment.findUnique({
      where: { id: appointmentId },
    });
    if (!appt || appt.analystUserId !== analystUserId) {
      res.status(404).json({ error: "Cita no encontrada" });
      return;
    }

    const normalized: Record<string, string> = {};
    for (const q of PRACTICAL_EVAL_QUESTIONS) {
      const raw = (answers as Record<string, unknown>)[q.id];
      if (typeof raw !== "string" || !q.options.includes(raw)) {
        res.status(400).json({ error: `Respuesta inválida: ${q.id}` });
        return;
      }
      normalized[q.id] = raw;
    }

    const scores = computeEvaluationScores(normalized);

    await prisma.$transaction([
      prisma.practicalTestEvaluation.upsert({
        where: { appointmentId },
        create: {
          appointmentId,
          answers: normalized,
          experienceScore: scores.experienceScore,
          customerServiceScore: scores.customerServiceScore,
          overallScore: scores.overallScore,
          analystNotes: analystNotes?.trim() || null,
        },
        update: {
          answers: normalized,
          experienceScore: scores.experienceScore,
          customerServiceScore: scores.customerServiceScore,
          overallScore: scores.overallScore,
          analystNotes: analystNotes?.trim() || null,
          submittedAt: new Date(),
        },
      }),
      prisma.practicalTestAppointment.update({
        where: { id: appointmentId },
        data: { status: "COMPLETED" },
      }),
    ]);

    res.json({ ok: true, scores });
  } catch (err) {
    next(err);
  }
});

analystPracticalTestRouter.get("/available-slots-preview", async (req, res, next) => {
  try {
    const from = typeof req.query.from === "string" ? req.query.from : new Date().toISOString().slice(0, 10);
    const slots = await listAvailablePracticalTestSlots(req.auth!.id, from, 14);
    res.json(slots);
  } catch (err) {
    next(err);
  }
});
