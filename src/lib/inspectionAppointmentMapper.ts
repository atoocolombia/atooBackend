import type { InspectionAppointment, Workshop, WorkshopAvailabilitySlot } from "@prisma/client";

export type InspectionAppointmentDto = {
  id: string;
  userId: string;
  workshopId: string;
  workshopName: string;
  workshopAddress: string;
  workshopCity: string;
  kind: InspectionAppointment["kind"];
  status: InspectionAppointment["status"];
  appointmentDate: string;
  appointmentTime: string | null;
  proposedAppointmentDate: string | null;
  proposedAppointmentTime: string | null;
  rescheduleInitiatedBy: string | null;
  reason: string | null;
  proofOriginalName: string | null;
  workshopNotes: string | null;
  createdAt: string;
  updatedAt: string;
  clientEmail?: string;
  clientDisplayName?: string;
};

export function mapInspectionAppointment(
  row: InspectionAppointment & {
    workshop: Pick<Workshop, "name" | "address" | "city">;
    user?: { email: string; identityExtraction?: { firstName: string | null; lastName: string | null } | null };
  },
): InspectionAppointmentDto {
  const firstName = row.user?.identityExtraction?.firstName?.trim() ?? "";
  const lastName = row.user?.identityExtraction?.lastName?.trim() ?? "";
  const fromIdentity = `${firstName} ${lastName}`.trim();

  return {
    id: row.id,
    userId: row.userId,
    workshopId: row.workshopId,
    workshopName: row.workshop.name,
    workshopAddress: row.workshop.address,
    workshopCity: row.workshop.city,
    kind: row.kind,
    status: row.status,
    appointmentDate: row.appointmentDate,
    appointmentTime: row.appointmentTime,
    proposedAppointmentDate: row.proposedAppointmentDate,
    proposedAppointmentTime: row.proposedAppointmentTime,
    rescheduleInitiatedBy: row.rescheduleInitiatedBy,
    reason: row.reason,
    proofOriginalName: row.proofOriginalName,
    workshopNotes: row.workshopNotes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    clientEmail: row.user?.email,
    clientDisplayName: fromIdentity || row.user?.email,
  };
}

export type WorkshopAvailabilitySlotDto = {
  id: string;
  workshopId: string;
  date: string;
  startTime: string;
  endTime: string;
  maxAppointments: number;
  bookedCount: number;
  remainingCapacity: number;
};

export function mapAvailabilitySlot(slot: WorkshopAvailabilitySlot): WorkshopAvailabilitySlotDto {
  return {
    id: slot.id,
    workshopId: slot.workshopId,
    date: slot.date,
    startTime: slot.startTime,
    endTime: slot.endTime,
    maxAppointments: slot.maxAppointments,
    bookedCount: slot.bookedCount,
    remainingCapacity: Math.max(0, slot.maxAppointments - slot.bookedCount),
  };
}
