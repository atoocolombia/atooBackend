import { prisma } from "./prisma.js";
import type { SupportVehicle } from "./supportKnowledgePaths.js";

export function mapTextToSupportVehicle(text: string): SupportVehicle | null {
  const t = text.toLowerCase();
  if (/\bnammi\b/.test(t)) return "nammi";
  if (/\baeolus\b|\bsky\b/.test(t)) return "aeolus";
  return null;
}

export async function resolveSupportVehicleForUser(userId: string): Promise<{
  vehicle: SupportVehicle | null;
  vehicleLabel: string | null;
  source: "plan" | "delivery" | null;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      vehiclePlan: { select: { vehicleName: true } },
      vehicleDeliveries: {
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: { brand: true, line: true, model: true },
      },
    },
  });

  if (!user) {
    return { vehicle: null, vehicleLabel: null, source: null };
  }

  const planName = user.vehiclePlan?.vehicleName?.trim();
  if (planName) {
    const vehicle = mapTextToSupportVehicle(planName);
    if (vehicle) {
      return { vehicle, vehicleLabel: planName, source: "plan" };
    }
  }

  const delivery = user.vehicleDeliveries[0];
  if (delivery) {
    const label = [delivery.brand, delivery.line, delivery.model].filter(Boolean).join(" ").trim();
    if (label) {
      const vehicle = mapTextToSupportVehicle(label);
      if (vehicle) {
        return { vehicle, vehicleLabel: label, source: "delivery" };
      }
    }
  }

  return { vehicle: null, vehicleLabel: planName ?? null, source: null };
}
