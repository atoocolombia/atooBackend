import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const usersRouter = Router();

function paramUserId(req: Request): string {
  const v = req.params.userId;
  return Array.isArray(v) ? v[0] ?? "" : v ?? "";
}

/**
 * Datos para el paso 5 (confirmación): correo de registro, nombres/apellidos y dirección extraídos en BD.
 * El teléfono no se guarda aún: el cliente lo envía vacío para que el usuario lo complete.
 */
usersRouter.get("/:userId/application-confirmation", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = paramUserId(req);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        identityExtraction: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        workAddressExtraction: {
          select: {
            utilityServiceAddress: true,
          },
        },
      },
    });

    if (!user) {
      res.status(404).json({ error: "Usuario no encontrado" });
      return;
    }

    res.json({
      email: user.email,
      firstName: user.identityExtraction?.firstName?.trim() ?? "",
      lastName: user.identityExtraction?.lastName?.trim() ?? "",
      address: user.workAddressExtraction?.utilityServiceAddress?.trim() ?? "",
      phone: "",
    });
  } catch (err) {
    next(err);
  }
});
