import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import { mapUserToProfile } from "../lib/userProfile.js";
import { prisma } from "../lib/prisma.js";

export const usersRouter = Router();

function paramUserId(req: Request): string {
  const v = req.params.userId;
  return Array.isArray(v) ? v[0] ?? "" : v ?? "";
}

const profileSelect = {
  id: true,
  email: true,
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

async function loadUserProfile(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: profileSelect,
  });
}

/** Perfil del cliente para dashboard y vistas autenticadas. */
usersRouter.get("/:userId/profile", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = paramUserId(req);
    const user = await loadUserProfile(userId);

    if (!user) {
      res.status(404).json({ error: "Usuario no encontrado" });
      return;
    }

    res.json(mapUserToProfile(user));
  } catch (err) {
    next(err);
  }
});

/**
 * Datos para el paso 5 (confirmación): correo de registro, nombres/apellidos y dirección extraídos en BD.
 * El teléfono no se guarda aún: el cliente lo envía vacío para que el usuario lo complete.
 */
usersRouter.get("/:userId/application-confirmation", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = paramUserId(req);
    const user = await loadUserProfile(userId);

    if (!user) {
      res.status(404).json({ error: "Usuario no encontrado" });
      return;
    }

    const profile = mapUserToProfile(user);
    res.json({
      email: profile.email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      address: profile.address,
      phone: profile.phone,
    });
  } catch (err) {
    next(err);
  }
});
