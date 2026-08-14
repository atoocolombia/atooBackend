import bcrypt from "bcrypt";
import { Prisma, UserType } from "@prisma/client";
import { Router } from "express";
import { authenticateWithGoogle } from "../lib/authenticateWithGoogle.js";
import {
  clearAuthCookie,
  sendAuthSession,
} from "../lib/authTokens.js";
import { generateMixedId } from "../lib/generateMixedId.js";
import { mapUserToProfile } from "../lib/userProfile.js";
import { prisma } from "../lib/prisma.js";
import { optionalAuth, requireAuth } from "../middleware/auth.js";

export const authRouter = Router();

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 12);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const profileSelect = {
  id: true,
  email: true,
  phone: true,
  userType: true,
  createdAt: true,
  passwordHash: true,
  identityExtraction: {
    select: {
      firstName: true,
      lastName: true,
      idDocumentNumber: true,
    },
  },
  workAddressExtraction: {
    select: {
      utilityServiceAddress: true,
    },
  },
} as const;

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

    if (!user.passwordHash) {
      res.status(401).json({ error: "Esta cuenta usa Google. Inicia sesión con Google." });
      return;
    }

    const passwordOk = await bcrypt.compare(password, user.passwordHash);
    if (!passwordOk) {
      res.status(401).json({ error: "Correo o contraseña incorrectos" });
      return;
    }

    sendAuthSession(res, user, 200);
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

    if (userType !== undefined && userType !== null) {
      const normalizedType = String(userType).trim().toUpperCase();
      if (normalizedType && normalizedType !== UserType.USER) {
        res.status(403).json({
          error: "El registro público solo permite cuentas de cliente (USER)",
        });
        return;
      }
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
            userType: UserType.USER,
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

    sendAuthSession(res, user, 201);
  } catch (err) {
    next(err);
  }
});

authRouter.post("/google", async (req, res, next) => {
  try {
    const { credential, userType } = req.body as {
      credential?: string;
      userType?: string;
    };

    if (!credential || typeof credential !== "string") {
      res.status(400).json({ error: "Falta el token de Google (credential)" });
      return;
    }

    if (userType !== undefined && userType !== null) {
      const normalizedType = String(userType).trim().toUpperCase();
      if (normalizedType !== UserType.USER) {
        res.status(403).json({
          error: "El registro público solo permite cuentas de cliente (USER)",
        });
        return;
      }
    }

    const user = await authenticateWithGoogle(credential, UserType.USER);
    sendAuthSession(res, user, 200);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.includes("GOOGLE_CLIENT_ID")) {
        res.status(503).json({ error: "Inicio de sesión con Google no configurado en el servidor" });
        return;
      }
      if (
        err.message.includes("Token de Google") ||
        err.message.includes("no está verificado") ||
        err.message.includes("otra cuenta de Google")
      ) {
        res.status(401).json({ error: err.message });
        return;
      }
    }
    next(err);
  }
});

authRouter.get("/me", optionalAuth, async (req, res, next) => {
  try {
    if (!req.auth) {
      res.status(401).json({ error: "No hay sesión activa" });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { id: req.auth.id },
      select: { id: true, email: true, userType: true, createdAt: true },
    });
    if (!user) {
      clearAuthCookie(res);
      res.status(401).json({ error: "Sesión inválida" });
      return;
    }
    sendAuthSession(res, user, 200);
  } catch (err) {
    next(err);
  }
});

authRouter.post("/logout", (_req, res) => {
  clearAuthCookie(res);
  res.status(204).send();
});

authRouter.get("/profile", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.auth!.id },
      select: profileSelect,
    });
    if (!user) {
      res.status(404).json({ error: "Usuario no encontrado" });
      return;
    }
    res.json(mapUserToProfile(user));
  } catch (err) {
    next(err);
  }
});

authRouter.patch("/profile", requireAuth, async (req, res, next) => {
  try {
    const { firstName, lastName, phone, address } = req.body as {
      firstName?: string;
      lastName?: string;
      phone?: string;
      address?: string;
    };

    const userId = req.auth!.id;
    const nextPhone =
      phone === undefined ? undefined : String(phone).trim().slice(0, 40) || null;
    const nextFirst =
      firstName === undefined ? undefined : String(firstName).trim().slice(0, 80) || null;
    const nextLast =
      lastName === undefined ? undefined : String(lastName).trim().slice(0, 80) || null;
    const nextAddress =
      address === undefined ? undefined : String(address).trim().slice(0, 240) || null;

    await prisma.$transaction(async (tx) => {
      if (nextPhone !== undefined) {
        await tx.user.update({
          where: { id: userId },
          data: { phone: nextPhone },
        });
      }

      if (nextFirst !== undefined || nextLast !== undefined) {
        await tx.userIdentityExtraction.upsert({
          where: { userId },
          create: {
            userId,
            firstName: nextFirst ?? null,
            lastName: nextLast ?? null,
          },
          update: {
            ...(nextFirst !== undefined ? { firstName: nextFirst } : {}),
            ...(nextLast !== undefined ? { lastName: nextLast } : {}),
          },
        });
      }

      if (nextAddress !== undefined) {
        await tx.userWorkAddressExtraction.upsert({
          where: { userId },
          create: {
            userId,
            utilityServiceAddress: nextAddress,
          },
          update: {
            utilityServiceAddress: nextAddress,
          },
        });
      }
    });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: profileSelect,
    });
    res.json(mapUserToProfile(user!));
  } catch (err) {
    next(err);
  }
});

authRouter.patch("/password", requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
    };

    if (!currentPassword || typeof currentPassword !== "string") {
      res.status(400).json({ error: "La contraseña actual es obligatoria" });
      return;
    }
    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
      res.status(400).json({ error: "La nueva contraseña debe tener al menos 8 caracteres" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.auth!.id },
      select: { id: true, passwordHash: true },
    });
    if (!user) {
      res.status(404).json({ error: "Usuario no encontrado" });
      return;
    }
    if (!user.passwordHash) {
      res.status(400).json({
        error: "Esta cuenta usa Google y no tiene contraseña local. Configura una desde soporte o vincula contraseña más adelante.",
      });
      return;
    }

    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) {
      res.status(401).json({ error: "La contraseña actual no es correcta" });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
