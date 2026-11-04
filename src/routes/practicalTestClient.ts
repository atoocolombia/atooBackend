import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { listAvailablePracticalTestSlots } from "../lib/practicalTestSlots.js";
import { bookPracticalTestAppointment } from "../lib/practicalTestService.js";

export const practicalTestClientRouter = Router({ mergeParams: true });

function paramUserId(req: { params: Record<string, string | string[] | undefined> }): string {
  const v = req.params.userId;
  return Array.isArray(v) ? v[0] ?? "" : v ?? "";
}

practicalTestClientRouter.get("/state", async (req, res, next) => {
  try {
    const userId = paramUserId(req);
    const app = await prisma.application.findUnique({
      where: { userId },
      include: { practicalTestAppointment: true },
    });
    res.json({
      schedulingEnabled: app?.practicalTestSchedulingEnabled === true,
      appointment: app?.practicalTestAppointment
        ? {
            id: app.practicalTestAppointment.id,
            date: app.practicalTestAppointment.date,
            startTime: app.practicalTestAppointment.startTime,
            endTime: app.practicalTestAppointment.endTime,
            status: app.practicalTestAppointment.status,
          }
        : null,
    });
  } catch (err) {
    next(err);
  }
});

practicalTestClientRouter.get("/available-slots", async (req, res, next) => {
  try {
    const userId = paramUserId(req);
    const from = typeof req.query.from === "string" ? req.query.from : new Date().toISOString().slice(0, 10);
    const app = await prisma.application.findUnique({ where: { userId } });
    if (!app?.practicalTestSchedulingEnabled || !app.assignedAnalystUserId) {
      res.json([]);
      return;
    }
    const slots = await listAvailablePracticalTestSlots(app.assignedAnalystUserId, from, 21);
    res.json(slots);
  } catch (err) {
    next(err);
  }
});

practicalTestClientRouter.post("/appointments", async (req, res, next) => {
  try {
    const userId = paramUserId(req);
    const { date, startTime, endTime } = req.body as {
      date?: string;
      startTime?: string;
      endTime?: string;
    };
    if (!date || !startTime || !endTime) {
      res.status(400).json({ error: "date, startTime y endTime son obligatorios" });
      return;
    }
    const appt = await bookPracticalTestAppointment(userId, { date, startTime, endTime });
    res.status(201).json(appt);
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo agendar";
    res.status(400).json({ error: message });
  }
});
