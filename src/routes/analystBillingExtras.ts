import { Router } from "express";
import { generateMixedId } from "../lib/generateMixedId.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const analystBillingExtrasRouter = Router();

analystBillingExtrasRouter.use(requireAuth, requireRole("ANALYST", "ADMIN"));

analystBillingExtrasRouter.get("/users/:userId/extras", async (req, res, next) => {
  try {
    const rows = await prisma.clientBillingExtra.findMany({
      where: { userId: req.params.userId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    res.json({ extras: rows });
  } catch (err) {
    next(err);
  }
});

analystBillingExtrasRouter.post("/users/:userId/extras", async (req, res, next) => {
  try {
    const { label, description, category, amountCop, active, sortOrder } = req.body as {
      label?: string;
      description?: string;
      category?: string;
      amountCop?: number;
      active?: boolean;
      sortOrder?: number;
    };

    if (!label?.trim()) {
      res.status(400).json({ error: "El nombre del cargo es obligatorio" });
      return;
    }
    if (typeof amountCop !== "number" || amountCop < 0) {
      res.status(400).json({ error: "Indica un monto válido en COP" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
    if (!user) {
      res.status(404).json({ error: "Cliente no encontrado" });
      return;
    }

    const row = await prisma.clientBillingExtra.create({
      data: {
        id: generateMixedId(),
        userId: user.id,
        label: label.trim(),
        description: description?.trim() || null,
        category: category?.trim() || "service",
        amountCop: Math.round(amountCop),
        active: active ?? true,
        sortOrder: sortOrder ?? 0,
      },
    });

    res.status(201).json({ extra: row });
  } catch (err) {
    next(err);
  }
});

analystBillingExtrasRouter.patch("/extras/:extraId", async (req, res, next) => {
  try {
    const { label, description, category, amountCop, active, sortOrder } = req.body as {
      label?: string;
      description?: string;
      category?: string;
      amountCop?: number;
      active?: boolean;
      sortOrder?: number;
    };

    const row = await prisma.clientBillingExtra.update({
      where: { id: req.params.extraId },
      data: {
        ...(label !== undefined ? { label: label.trim() } : {}),
        ...(description !== undefined ? { description: description?.trim() || null } : {}),
        ...(category !== undefined ? { category: category.trim() || "service" } : {}),
        ...(amountCop !== undefined ? { amountCop: Math.round(amountCop) } : {}),
        ...(active !== undefined ? { active } : {}),
        ...(sortOrder !== undefined ? { sortOrder } : {}),
      },
    });

    res.json({ extra: row });
  } catch (err) {
    next(err);
  }
});
