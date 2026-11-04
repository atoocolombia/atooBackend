import { VehicleHistoryEventType } from "@prisma/client";
import { Router } from "express";
import { generateMixedId } from "../lib/generateMixedId.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const analystVehicleHistoryRouter = Router();

analystVehicleHistoryRouter.use(requireAuth, requireRole("ANALYST", "ADMIN"));

analystVehicleHistoryRouter.post("/users/:userId/events", async (req, res, next) => {
  try {
    const userId = req.params.userId;
    const { eventType, title, description, occurredAt } = req.body as {
      eventType?: VehicleHistoryEventType;
      title?: string;
      description?: string;
      occurredAt?: string;
    };

    if (!eventType || !Object.values(VehicleHistoryEventType).includes(eventType)) {
      res.status(400).json({ error: "eventType inválido" });
      return;
    }
    if (!title?.trim()) {
      res.status(400).json({ error: "title es obligatorio" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: "Cliente no encontrado" });
      return;
    }

    const row = await prisma.vehicleHistoryEvent.create({
      data: {
        id: generateMixedId(),
        userId,
        eventType,
        title: title.trim(),
        description: description?.trim() || null,
        occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
        createdByUserId: req.auth!.id,
      },
    });
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});
