import bcrypt from "bcrypt";
import { DeliveryStatus, Prisma, UserType } from "@prisma/client";
import { Router } from "express";
import { sendAuthSession } from "../lib/authTokens.js";
import { generateMixedId } from "../lib/generateMixedId.js";
import { validatePassword } from "../lib/passwordPolicy.js";
import { prisma } from "../lib/prisma.js";
import { finalizeClientVehiclePlan } from "../lib/vehicleDeliveryService.js";

export const accountSetupRouter = Router();

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 12);

accountSetupRouter.get("/:token", async (req, res, next) => {
  try {
    const delivery = await prisma.vehicleDelivery.findUnique({
      where: { onboardingToken: req.params.token },
    });
    if (!delivery) {
      res.status(404).json({ error: "Enlace inválido o expirado" });
      return;
    }
    if (delivery.userId && delivery.status === DeliveryStatus.COMPLETED) {
      res.json({
        email: delivery.email,
        clientName: delivery.clientName,
        alreadyActivated: true,
      });
      return;
    }
    res.json({
      email: delivery.email,
      clientName: delivery.clientName,
      alreadyActivated: false,
    });
  } catch (err) {
    next(err);
  }
});

accountSetupRouter.post("/:token", async (req, res, next) => {
  try {
    const { password } = req.body as { password?: string };
    if (!password?.trim()) {
      res.status(400).json({ error: "La contraseña es obligatoria" });
      return;
    }
    const passwordError = validatePassword(password);
    if (passwordError) {
      res.status(400).json({ error: passwordError });
      return;
    }

    const delivery = await prisma.vehicleDelivery.findUnique({
      where: { onboardingToken: req.params.token },
    });
    if (!delivery) {
      res.status(404).json({ error: "Enlace inválido o expirado" });
      return;
    }

    const emailNorm = delivery.email.trim().toLowerCase();
    let user = await prisma.user.findUnique({ where: { email: emailNorm } });

    if (user?.passwordHash) {
      res.status(409).json({
        error: "Ya existe una cuenta con este correo. Inicia sesión con tu contraseña.",
      });
      return;
    }

    const passwordHash = await bcrypt.hash(password!, BCRYPT_ROUNDS);

    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash, phone: user.phone ?? delivery.phone },
      });
    } else {
      for (let attempt = 0; attempt < 15; attempt++) {
        try {
          user = await prisma.user.create({
            data: {
              id: generateMixedId(),
              email: emailNorm,
              passwordHash,
              phone: delivery.phone,
              userType: UserType.USER,
            },
          });
          break;
        } catch (err) {
          const isIdCollision =
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === "P2002" &&
            Array.isArray(err.meta?.target) &&
            (err.meta.target as string[]).includes("id");
          if (!isIdCollision || attempt === 14) throw err;
        }
      }
    }

    if (!user) {
      res.status(500).json({ error: "No se pudo crear la cuenta" });
      return;
    }

    const now = new Date();
    await prisma.vehicleDelivery.update({
      where: { id: delivery.id },
      data: {
        userId: user.id,
        status: DeliveryStatus.COMPLETED,
        clientConfirmedAt: now,
        completedByAdvisorAt: delivery.completedByAdvisorAt ?? now,
      },
    });

    await finalizeClientVehiclePlan(delivery.id);

    sendAuthSession(
      res,
      { id: user.id, email: user.email, userType: user.userType, createdAt: user.createdAt },
      200,
    );
  } catch (err) {
    next(err);
  }
});
