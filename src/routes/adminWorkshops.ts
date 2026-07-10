import bcrypt from "bcrypt";
import { Prisma, UserType } from "@prisma/client";
import type { Request, Response } from "express";
import { Router } from "express";
import { generateMixedId } from "../lib/generateMixedId.js";
import { readActorEmail, recordLandingAudit } from "../lib/landingAuditLog.js";
import { prisma } from "../lib/prisma.js";

export const adminWorkshopsRouter = Router();

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 12);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_WORKSHOP_PASSWORD = "Atoo#Tll5hY6c";

function paramWorkshopId(req: Request): string {
  const v = req.params.workshopId;
  return Array.isArray(v) ? v[0] ?? "" : v ?? "";
}

async function requireAdminActor(req: Request, res: Response): Promise<{ id: string; email: string } | null> {
  const email = readActorEmail(req);
  if (!EMAIL_REGEX.test(email) || email === "desconocido@atoo.local") {
    res.status(401).json({ error: "Inicia sesión como administrador para continuar" });
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, userType: true },
  });

  if (!user || user.userType !== UserType.ADMIN) {
    res.status(403).json({ error: "Solo administradores pueden gestionar talleres" });
    return null;
  }

  return user;
}

function mapWorkshopRow(
  row: {
    id: string;
    name: string;
    address: string;
    city: string;
    phone: string | null;
    active: boolean;
    userId: string | null;
    createdAt: Date;
    user: { email: string } | null;
  },
) {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    city: row.city,
    phone: row.phone,
    active: row.active,
    userId: row.userId,
    loginEmail: row.user?.email ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

adminWorkshopsRouter.get("/", async (req, res, next) => {
  try {
    const admin = await requireAdminActor(req, res);
    if (!admin) return;

    const workshops = await prisma.workshop.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: {
        user: { select: { email: true } },
      },
    });

    res.json(workshops.map(mapWorkshopRow));
  } catch (err) {
    next(err);
  }
});

adminWorkshopsRouter.post("/", async (req, res, next) => {
  try {
    const admin = await requireAdminActor(req, res);
    if (!admin) return;

    const { name, address, city, email, password, phone } = req.body as {
      name?: string;
      address?: string;
      city?: string;
      email?: string;
      password?: string;
      phone?: string;
    };

    const nameTrim = name?.trim();
    const addressTrim = address?.trim();
    const cityTrim = city?.trim();
    const emailNorm = email?.trim().toLowerCase();
    const passwordValue = (password?.trim() || DEFAULT_WORKSHOP_PASSWORD);
    const phoneTrim = phone?.trim() || null;

    if (!nameTrim || !addressTrim || !cityTrim) {
      res.status(400).json({ error: "Nombre, dirección y ciudad son obligatorios" });
      return;
    }
    if (!emailNorm || !EMAIL_REGEX.test(emailNorm)) {
      res.status(400).json({ error: "Correo de acceso inválido u obligatorio" });
      return;
    }
    if (passwordValue.length < 5) {
      res.status(400).json({ error: "La contraseña debe tener al menos 5 caracteres" });
      return;
    }

    const existingEmail = await prisma.user.findUnique({ where: { email: emailNorm } });
    if (existingEmail) {
      res.status(409).json({ error: "Ese correo ya está registrado" });
      return;
    }

    const passwordHash = await bcrypt.hash(passwordValue, BCRYPT_ROUNDS);

    const created = await prisma.$transaction(async (tx) => {
      let user = null;
      for (let attempt = 0; attempt < 15; attempt++) {
        try {
          user = await tx.user.create({
            data: {
              id: generateMixedId(),
              email: emailNorm,
              passwordHash,
              userType: UserType.WORKSHOP,
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
      if (!user) throw new Error("No se pudo crear el usuario del taller");

      let workshop = null;
      for (let attempt = 0; attempt < 15; attempt++) {
        try {
          workshop = await tx.workshop.create({
            data: {
              id: generateMixedId(),
              name: nameTrim,
              address: addressTrim,
              city: cityTrim,
              phone: phoneTrim,
              active: true,
              userId: user.id,
            },
            include: { user: { select: { email: true } } },
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
      if (!workshop) throw new Error("No se pudo crear el taller");

      return workshop;
    });

    await recordLandingAudit(admin.email, "workshop.create", `Creó taller ${created.name}`, {
      workshopId: created.id,
      loginEmail: emailNorm,
    });

    res.status(201).json({
      ...mapWorkshopRow(created),
      initialPassword: passwordValue,
      portalPath: "/taller",
    });
  } catch (err) {
    next(err);
  }
});

adminWorkshopsRouter.patch("/:workshopId", async (req, res, next) => {
  try {
    const admin = await requireAdminActor(req, res);
    if (!admin) return;

    const workshopId = paramWorkshopId(req);
    const { name, address, city, phone, active } = req.body as {
      name?: string;
      address?: string;
      city?: string;
      phone?: string | null;
      active?: boolean;
    };

    const existing = await prisma.workshop.findUnique({ where: { id: workshopId } });
    if (!existing) {
      res.status(404).json({ error: "Taller no encontrado" });
      return;
    }

    const updated = await prisma.workshop.update({
      where: { id: workshopId },
      data: {
        name: name?.trim() || undefined,
        address: address?.trim() || undefined,
        city: city?.trim() || undefined,
        phone: phone === null ? null : phone?.trim() || undefined,
        active: typeof active === "boolean" ? active : undefined,
      },
      include: { user: { select: { email: true } } },
    });

    await recordLandingAudit(admin.email, "workshop.update", `Actualizó taller ${updated.name}`, {
      workshopId: updated.id,
    });

    res.json(mapWorkshopRow(updated));
  } catch (err) {
    next(err);
  }
});
