import { prisma } from "./prisma.js";

const MAX_ELECTRIC_EXPERIENCE_LEN = 120;

export type PatchWorkAddressStepMetaInput = {
  mobilityDrivenElectricVehicle?: boolean;
  mobilityElectricExperienceText?: string | null;
};

export type PatchWorkAddressStepMetaResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

function normalizeExperienceText(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  return t.slice(0, MAX_ELECTRIC_EXPERIENCE_LEN);
}

export async function patchWorkAddressStepMeta(
  userId: string,
  input: PatchWorkAddressStepMetaInput,
): Promise<PatchWorkAddressStepMetaResult> {
  const hasEv = typeof input.mobilityDrivenElectricVehicle === "boolean";
  const hasExp = input.mobilityElectricExperienceText !== undefined;

  if (!hasEv && !hasExp) {
    return { ok: false, status: 400, error: "No hay campos para actualizar" };
  }

  const existing = await prisma.userWorkAddressExtraction.findUnique({ where: { userId } });

  let mobilityDrivenElectricVehicle = existing?.mobilityDrivenElectricVehicle ?? null;
  let mobilityElectricExperienceText = existing?.mobilityElectricExperienceText ?? null;

  if (hasEv) {
    mobilityDrivenElectricVehicle = input.mobilityDrivenElectricVehicle!;
    if (!input.mobilityDrivenElectricVehicle) {
      mobilityElectricExperienceText = null;
    }
  }

  if (hasExp) {
    if (mobilityDrivenElectricVehicle !== true) {
      return {
        ok: false,
        status: 400,
        error: "Solo puedes indicar experiencia con vehículo eléctrico si respondiste que sí has conducido EV",
      };
    }
    mobilityElectricExperienceText = normalizeExperienceText(input.mobilityElectricExperienceText);
    if (!mobilityElectricExperienceText) {
      return {
        ok: false,
        status: 400,
        error: "Indica cuánto tiempo de experiencia tienes conduciendo vehículo eléctrico",
      };
    }
  }

  await prisma.userWorkAddressExtraction.upsert({
    where: { userId },
    create: {
      userId,
      mobilityDrivenElectricVehicle,
      mobilityElectricExperienceText,
    },
    update: {
      mobilityDrivenElectricVehicle,
      mobilityElectricExperienceText,
    },
  });

  return { ok: true };
}
