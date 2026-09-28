import type { Application, User, UserIdentityExtraction, VehicleDelivery } from "@prisma/client";
import { normalizeAccessoryChecklist } from "./deliveryDefaults.js";

type DeliveryWithRelations = VehicleDelivery & {
  user?: (User & { identityExtraction?: UserIdentityExtraction | null }) | null;
  application?: Application | null;
};

export function mapVehicleDelivery(row: DeliveryWithRelations) {
  return {
    id: row.id,
    userId: row.userId,
    applicationId: row.applicationId,
    status: row.status,
    clientName: row.clientName,
    idDocumentNumber: row.idDocumentNumber,
    address: row.address,
    email: row.email,
    phone: row.phone,
    deliveryLocation: row.deliveryLocation,
    documents: {
      contract: {
        sentAt: row.contractSentAt?.toISOString() ?? null,
        signedAt: row.contractSignedAt?.toISOString() ?? null,
      },
      insurance: {
        sentAt: row.insuranceSentAt?.toISOString() ?? null,
        signedAt: row.insuranceSignedAt?.toISOString() ?? null,
      },
      promissoryNote: {
        sentAt: row.promissoryNoteSentAt?.toISOString() ?? null,
        signedAt: row.promissoryNoteSignedAt?.toISOString() ?? null,
      },
    },
    vehicle: {
      vin: row.vin,
      taxPayment: row.taxPayment,
      soatPayment: row.soatPayment,
      platesChassisDecl: row.platesChassisDecl,
      engineNumber: row.engineNumber,
      serialNumber: row.serialNumber,
      axles: row.axles,
      pbvKg: row.pbvKg,
      color: row.color,
      fuelType: row.fuelType,
      vehicleClass: row.vehicleClass,
      brand: row.brand,
      line: row.line,
      model: row.model,
      bodyType: row.bodyType,
      passengerCapacity: row.passengerCapacity,
      displacement: row.displacement,
    },
    accessoryChecklist: normalizeAccessoryChecklist(row.accessoryChecklist),
    completedByAdvisorAt: row.completedByAdvisorAt?.toISOString() ?? null,
    clientConfirmedAt: row.clientConfirmedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function buildClientName(identity: UserIdentityExtraction | null | undefined, email: string): string {
  const full = [identity?.firstName, identity?.lastName].filter(Boolean).join(" ").trim();
  return full || email.split("@")[0];
}
