import bcrypt from "bcrypt";
import { Prisma, UserType } from "@prisma/client";
import { Router } from "express";
import { generateMixedId } from "../lib/generateMixedId.js";
import { prisma } from "../lib/prisma.js";

export const authRouter = Router();

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 12);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

authRouter.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || typeof email !== "string" || !EMAIL_REGEX.test(email.trim())) {
      res.status(400).json({ error: "Correo inválido o obligatorio" });
      return;
    }
    if (!password || typeof password !== "string") {
      res.status(400).json({ error: "La contraseña es obligatoria" });
      return;
    }

    const emailNorm = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email: emailNorm },
      select: { id: true, email: true, userType: true, passwordHash: true, createdAt: true },
    });

    if (!user) {
      res.status(401).json({ error: "Correo o contraseña incorrectos" });
      return;
    }

    const passwordOk = await bcrypt.compare(password, user.passwordHash);
    if (!passwordOk) {
      res.status(401).json({ error: "Correo o contraseña incorrectos" });
      return;
    }

    res.status(200).json({
      id: user.id,
      email: user.email,
      userType: user.userType,
      createdAt: user.createdAt,
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/register", async (req, res, next) => {
  try {
    const { email, password, userType } = req.body as {
      email?: string;
      password?: string;
      userType?: string;
    };

    if (!email || typeof email !== "string" || !EMAIL_REGEX.test(email.trim())) {
      res.status(400).json({ error: "Correo inválido o obligatorio" });
      return;
    }
    if (!password || typeof password !== "string" || password.length < 8) {
      res.status(400).json({ error: "La contraseña es obligatoria y debe tener al menos 8 caracteres" });
      return;
    }
    if (!userType || typeof userType !== "string") {
      res.status(400).json({ error: "El tipo de usuario es obligatorio" });
      return;
    }

    const normalizedType = userType.trim().toUpperCase();
    if (!Object.values(UserType).includes(normalizedType as UserType)) {
      res.status(400).json({
        error: "Tipo de usuario inválido",
        allowed: Object.values(UserType),
      });
      return;
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const emailNorm = email.trim().toLowerCase();
    let user = null;
    for (let attempt = 0; attempt < 15; attempt++) {
      try {
        user = await prisma.user.create({
          data: {
            id: generateMixedId(),
            email: emailNorm,
            passwordHash,
            userType: normalizedType as UserType,
          },
          select: {
            id: true,
            email: true,
            userType: true,
            createdAt: true,
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

    if (!user) {
      throw new Error("No se pudo generar un id único");
    }

    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
});
