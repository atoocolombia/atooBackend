import { randomBytes } from "node:crypto";
import { ApplicationStatus, DeliveryStatus } from "@prisma/client";
import {
  allAccessoriesDelivered,
  allDocumentsSigned,
  DEFAULT_ACCESSORY_CHECKLIST,
  normalizeAccessoryChecklist,
  type AccessoryChecklistItem,
} from "./deliveryDefaults.js";
import { generateMixedId } from "./generateMixedId.js";
import { prisma } from "./prisma.js";
import { buildClientName } from "./mapVehicleDelivery.js";
import {
  sendDeliveryActivationEmail,
  sendDeliveryConfirmationEmail,
  sendDeliveryDocumentsEmail,
} from "./deliveryEmails.js";

export async function loadUserApplicationProfile(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    include: {
      identityExtraction: true,
      workAddressExtraction: true,
      application: true,
    },
  });
}

export async function submitApplication(userId: string) {
  const user = await loadUserApplicationProfile(userId);
  if (!user) throw new Error("Usuario no encontrado");

  const existing = user.application;
  if (existing?.status === ApplicationStatus.APPROVED) {
    return existing;
  }

  const id = generateMixedId();
  if (existing) {
    return prisma.application.update({
      where: { id: existing.id },
      data: {
        status: ApplicationStatus.SUBMITTED,
        submittedAt: new Date(),
        rejectionReason: null,
        reviewedAt: null,
        reviewedByUserId: null,
      },
    });
  }

  return prisma.application.create({
    data: {
      id,
      userId,
      status: ApplicationStatus.SUBMITTED,
    },
  });
}

export async function createDeliveryFromApplication(applicationId: string, advisorUserId?: string) {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      user: { include: { identityExtraction: true, workAddressExtraction: true } },
      vehicleDelivery: true,
    },
  });
  if (!application) throw new Error("Solicitud no encontrada");
  if (application.vehicleDelivery) return application.vehicleDelivery;

  const user = application.user;
  const identity = user.identityExtraction;
  const address = user.workAddressExtraction?.utilityServiceAddress ?? null;

  return prisma.vehicleDelivery.create({
    data: {
      id: generateMixedId(),
      userId: user.id,
      applicationId: application.id,
      advisorUserId: advisorUserId ?? null,
      clientName: buildClientName(identity, user.email),
      idDocumentNumber: identity?.idDocumentNumber ?? "Pendiente",
      address,
      email: user.email,
      phone: user.phone,
      status: DeliveryStatus.PENDING_DOCUMENTS,
      accessoryChecklist: DEFAULT_ACCESSORY_CHECKLIST,
    },
  });
}

export async function createManualDelivery(input: {
  clientName: string;
  idDocumentNumber: string;
  address?: string;
  email: string;
  phone?: string;
  deliveryLocation?: string;
  analystUserId: string;
}) {
  const linkedUser = await prisma.user.findUnique({ where: { email: input.email.trim().toLowerCase() } });

  return prisma.vehicleDelivery.create({
    data: {
      id: generateMixedId(),
      userId: linkedUser?.id ?? null,
      advisorUserId: null,
      clientName: input.clientName.trim(),
      idDocumentNumber: input.idDocumentNumber.trim(),
      address: input.address?.trim() || null,
      email: input.email.trim().toLowerCase(),
      phone: input.phone?.trim() || null,
      deliveryLocation: input.deliveryLocation?.trim() || null,
      status: DeliveryStatus.PENDING_DOCUMENTS,
      accessoryChecklist: DEFAULT_ACCESSORY_CHECKLIST,
    },
  });
}

export async function notifyDeliveryDocuments(
  clientName: string,
  email: string,
): Promise<void> {
  await sendDeliveryDocumentsEmail(clientName, email);
}

export async function notifyDeliveryActivation(
  clientName: string,
  email: string,
  setupUrl: string,
): Promise<void> {
  await sendDeliveryActivationEmail(clientName, email, setupUrl);
}

export async function notifyDeliveryConfirmation(
  clientName: string,
  email: string,
  confirmUrl: string,
): Promise<void> {
  await sendDeliveryConfirmationEmail(clientName, email, confirmUrl);
}

export function deliveryConfirmationToken(): string {
  return randomBytes(24).toString("hex");
}

export function parseVehiclePatch(body: Record<string, unknown>) {
  const str = (key: string) => {
    const v = body[key];
    if (v === undefined || v === null) return undefined;
    return String(v).trim().slice(0, 120) || null;
  };
  return {
    vin: str("vin"),
    taxPayment: str("taxPayment"),
    soatPayment: str("soatPayment"),
    platesChassisDecl: str("platesChassisDecl"),
    engineNumber: str("engineNumber"),
    serialNumber: str("serialNumber"),
    axles: str("axles"),
    pbvKg: str("pbvKg"),
    color: str("color"),
    fuelType: str("fuelType"),
    vehicleClass: str("vehicleClass"),
    brand: str("brand"),
    line: str("line"),
    model: str("model"),
    bodyType: str("bodyType"),
    passengerCapacity: str("passengerCapacity"),
    displacement: str("displacement"),
    deliveryLocation: str("deliveryLocation"),
  };
}

export function validateReadyToComplete(delivery: {
  vin: string | null;
  contractSignedAt: Date | null;
  insuranceSignedAt: Date | null;
  promissoryNoteSignedAt: Date | null;
  accessoryChecklist: unknown;
}): string | null {
  if (!allDocumentsSigned(delivery)) {
    return "Debes registrar contrato, seguro y pagaré firmados antes de completar la entrega";
  }
  if (!delivery.vin?.trim()) {
    return "Debes ingresar el VIN del vehículo";
  }
  const checklist = normalizeAccessoryChecklist(delivery.accessoryChecklist);
  if (!allAccessoriesDelivered(checklist)) {
    return "Debes marcar todos los accesorios entregados (llaves, cargador, manual, etc.)";
  }
  return null;
}

export function mergeAccessoryChecklist(raw: unknown, patch: AccessoryChecklistItem[]): AccessoryChecklistItem[] {
  const current = normalizeAccessoryChecklist(raw);
  const byKey = new Map(patch.map((p) => [p.key, p]));
  return current.map((item) => ({
    ...item,
    delivered: byKey.get(item.key)?.delivered ?? item.delivered,
  }));
}

export async function finalizeClientVehiclePlan(deliveryId: string) {
  const delivery = await prisma.vehicleDelivery.findUnique({ where: { id: deliveryId } });
  if (!delivery?.userId || !delivery.vin) return;

  const vehicleLabel = [delivery.brand, delivery.line, delivery.model].filter(Boolean).join(" ").trim()
    || "Vehículo atoo";

  const deliveredAt = delivery.clientConfirmedAt ?? new Date();
  const nextInspectionDueAt = new Date(deliveredAt);
  nextInspectionDueAt.setMonth(nextInspectionDueAt.getMonth() + 6);

  await prisma.clientVehiclePlan.upsert({
    where: { userId: delivery.userId },
    create: {
      userId: delivery.userId,
      vehicleName: vehicleLabel,
      vin: delivery.vin,
      deliveredAt,
      nextInspectionDueAt,
    },
    update: {
      vehicleName: vehicleLabel,
      vin: delivery.vin,
      deliveredAt,
      nextInspectionDueAt,
    },
  });
}
