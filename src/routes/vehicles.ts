import { Prisma } from "@prisma/client";
import { Router } from "express";
import { generateMixedId } from "../lib/generateMixedId.js";
import { prisma } from "../lib/prisma.js";

export const vehiclesRouter = Router();

vehiclesRouter.get("/", async (_req, res, next) => {
  try {
    const items = await prisma.vehicle.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json(items);
  } catch (err) {
    next(err);
  }
});

vehiclesRouter.get("/:id", async (req, res, next) => {
  try {
    const item = await prisma.vehicle.findUnique({
      where: { id: req.params.id },
    });
    if (!item) {
      res.status(404).json({ error: "No encontrado" });
      return;
    }
    res.json(item);
  } catch (err) {
    next(err);
  }
});

vehiclesRouter.post("/", async (req, res, next) => {
  try {
    const { name, brand, price } = req.body as {
      name?: string;
      brand?: string;
      price?: number;
    };
    if (!name || typeof name !== "string") {
      res.status(400).json({ error: "El campo name es obligatorio" });
      return;
    }
    let created = null;
    for (let attempt = 0; attempt < 15; attempt++) {
      try {
        created = await prisma.vehicle.create({
          data: {
            id: generateMixedId(),
            name,
            brand: typeof brand === "string" ? brand : undefined,
            price: typeof price === "number" ? price : undefined,
          },
        });
        break;
      } catch (err) {
        const isIdCollision =
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002" &&
          Array.isArray(err.meta?.target) &&
          (err.meta.target as string[]).includes("id");
        if (!isIdCollision || attempt === 14) {
          throw err;
        }
      }
    }
    if (!created) {
      throw new Error("No se pudo generar un id único");
    }
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

vehiclesRouter.put("/:id", async (req, res, next) => {
  try {
    const { name, brand, price } = req.body as {
      name?: string;
      brand?: string | null;
      price?: number | null;
    };
    const updated = await prisma.vehicle.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(brand !== undefined && { brand }),
        ...(price !== undefined && { price }),
      },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

vehiclesRouter.delete("/:id", async (req, res, next) => {
  try {
    await prisma.vehicle.delete({
      where: { id: req.params.id },
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
