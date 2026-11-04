import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import { buildClientPaymentSummary } from "../lib/clientPaymentSummary.js";
import { getClientAccessState } from "../lib/clientAccess.js";
import { mapUserToProfile } from "../lib/userProfile.js";
import { patchWorkAddressStepMeta } from "../lib/patchWorkAddressStepMeta.js";
import {
  getApplicationKnowledgeTestState,
  submitApplicationKnowledgeTest,
} from "../lib/applicationKnowledgeTestService.js";
import { serializeWorkAddressStepMeta } from "../lib/workAddressStepMeta.js";
import { prisma } from "../lib/prisma.js";
import { submitApplication } from "../lib/vehicleDeliveryService.js";
import { requireAuth, requireSelfUserParam } from "../middleware/auth.js";

export const usersRouter = Router();

function paramUserId(req: Request): string {
  const v = req.params.userId;
  return Array.isArray(v) ? v[0] ?? "" : v ?? "";
}

const profileSelect = {
  id: true,
  email: true,
  phone: true,
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
      mobilityDrivenElectricVehicle: true,
    },
  },
} as const;

async function loadUserProfile(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: profileSelect,
  });
}

usersRouter.use("/:userId", requireAuth, requireSelfUserParam({ allowAdmin: true }));

/** Estado del portal cliente según solicitud y entrega. */
usersRouter.get("/:userId/client-access", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = paramUserId(req);
    const access = await getClientAccessState(userId);
    const includePayments =
      req.query.includePayments === "1" || req.query.includePayments === "true";
    if (includePayments) {
      try {
        const summary = await buildClientPaymentSummary(userId);
        res.json({ ...access, paymentSummary: summary });
        return;
      } catch (err) {
        next(err);
        return;
      }
    }
    res.json(access);
  } catch (err) {
    next(err);
  }
});

/** Resumen de pagos del portal cliente (misma respuesta que /client/payments/summary). */
usersRouter.get("/:userId/payment-summary", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const summary = await buildClientPaymentSummary(paramUserId(req));
    res.json({ summary });
  } catch (err) {
    next(err);
  }
});

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
 * Datos para el paso 5 (confirmación): correo de registro, nombres/apellidos y dirección.
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

/** Paso 3: declaración de conducción de vehículo eléctrico y metadatos ya guardados. */
usersRouter.get("/:userId/work-address-step-meta", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = paramUserId(req);
    const row = await prisma.userWorkAddressExtraction.findUnique({
      where: { userId },
      select: {
        mobilityDrivenElectricVehicle: true,
        mobilityElectricExperienceText: true,
        platformCapturesMeta: true,
      },
    });
    res.json(serializeWorkAddressStepMeta(row));
  } catch (err) {
    next(err);
  }
});

usersRouter.patch("/:userId/work-address-step-meta", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = paramUserId(req);
    const body = req.body as {
      mobilityDrivenElectricVehicle?: unknown;
      mobilityElectricExperienceText?: unknown;
    };
    const input: {
      mobilityDrivenElectricVehicle?: boolean;
      mobilityElectricExperienceText?: string | null;
    } = {};
    if (body.mobilityDrivenElectricVehicle !== undefined) {
      if (typeof body.mobilityDrivenElectricVehicle !== "boolean") {
        res.status(400).json({ error: "mobilityDrivenElectricVehicle debe ser true o false" });
        return;
      }
      input.mobilityDrivenElectricVehicle = body.mobilityDrivenElectricVehicle;
    }
    if (body.mobilityElectricExperienceText !== undefined) {
      input.mobilityElectricExperienceText =
        body.mobilityElectricExperienceText === null
          ? null
          : typeof body.mobilityElectricExperienceText === "string"
            ? body.mobilityElectricExperienceText
            : undefined;
      if (input.mobilityElectricExperienceText === undefined) {
        res.status(400).json({ error: "mobilityElectricExperienceText debe ser texto o null" });
        return;
      }
    }

    const result = await patchWorkAddressStepMeta(userId, input);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    const row = await prisma.userWorkAddressExtraction.findUnique({
      where: { userId },
      select: {
        mobilityDrivenElectricVehicle: true,
        mobilityElectricExperienceText: true,
        platformCapturesMeta: true,
      },
    });
    res.json(serializeWorkAddressStepMeta(row));
  } catch (err) {
    next(err);
  }
});

/** Evaluaciones teóricas (entre paso 3 y 4): preguntas y puntajes guardados. */
usersRouter.get("/:userId/application-knowledge-test", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const state = await getApplicationKnowledgeTestState(paramUserId(req));
    res.json(state);
  } catch (err) {
    next(err);
  }
});

usersRouter.post("/:userId/application-knowledge-test", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = paramUserId(req);
    const answers = (req.body as { answers?: unknown }).answers;
    if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
      res.status(400).json({ error: "answers debe ser un objeto preguntaId → índice" });
      return;
    }
    const result = await submitApplicationKnowledgeTest(userId, answers as Record<string, unknown>);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    const state = await getApplicationKnowledgeTestState(userId);
    res.json(state);
  } catch (err) {
    next(err);
  }
});

usersRouter.post("/:userId/application/submit", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const application = await submitApplication(paramUserId(req));
    res.status(201).json(application);
  } catch (err) {
    next(err);
  }
});
