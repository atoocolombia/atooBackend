import type {
  InspectionAppointment,
  InspectionChecklistItem,
  InspectionProcedureSuggestion,
  InspectionSession,
  Workshop,
} from "@prisma/client";
import { generateMixedId } from "./generateMixedId.js";
import { createUserNotification } from "./userNotifications.js";
import { prisma } from "./prisma.js";

export const DEFAULT_INSPECTION_STEPS: Array<{ title: string; description: string }> = [
  {
    title: "Verificación documental",
    description: "SOAT, tecnomecánica vigente y coincidencia de placa/VIN",
  },
  {
    title: "Inspección visual general",
    description: "Carrocería, fugas visibles y estado general del vehículo",
  },
  {
    title: "Sistema de frenos",
    description: "Pastillas, discos/tambores, líquido y respuesta al pedal",
  },
  {
    title: "Suspensión y dirección",
    description: "Amortiguadores, rótulas, terminales y holguras",
  },
  {
    title: "Luces y señalización",
    description: "Faros, stops, direccionales e iluminación interior relevante",
  },
  {
    title: "Neumáticos y rines",
    description: "Desgaste, presión, profundidad de labrado y daños",
  },
  {
    title: "Niveles de fluidos",
    description: "Aceite, refrigerante, frenos y demás depósitos",
  },
  {
    title: "Escape y emisiones",
    description: "Fugas, ruidos anormales y estado del sistema de escape",
  },
  {
    title: "Diagnóstico electrónico",
    description: "Lectura OBD / códigos de falla cuando aplique",
  },
  {
    title: "Prueba funcional",
    description: "Verificación dinámica o en estación según el motivo de visita",
  },
];

export function formatCop(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return "Sin costo";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(amount);
}

export async function notifyAllAdmins(input: {
  type: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { userType: "ADMIN" },
    select: { id: true },
  });

  await Promise.all(
    admins.map((admin) =>
      createUserNotification({
        userId: admin.id,
        type: input.type,
        title: input.title,
        message: input.message,
        metadata: input.metadata,
      }),
    ),
  );
}

type SessionWithRelations = InspectionSession & {
  checklistItems: InspectionChecklistItem[];
  suggestions: InspectionProcedureSuggestion[];
  appointment: InspectionAppointment & {
    workshop: Pick<Workshop, "name" | "address" | "city">;
    user?: {
      email: string;
      identityExtraction?: { firstName: string | null; lastName: string | null } | null;
    } | null;
  };
};

export function mapInspectionSession(session: SessionWithRelations) {
  const firstName = session.appointment.user?.identityExtraction?.firstName?.trim() ?? "";
  const lastName = session.appointment.user?.identityExtraction?.lastName?.trim() ?? "";
  const clientName = `${firstName} ${lastName}`.trim() || session.appointment.user?.email || null;

  return {
    id: session.id,
    appointmentId: session.appointmentId,
    status: session.status,
    startedAt: session.startedAt.toISOString(),
    completedAt: session.completedAt?.toISOString() ?? null,
    notes: session.notes,
    reason: session.appointment.reason,
    appointmentDate: session.appointment.appointmentDate,
    appointmentTime: session.appointment.appointmentTime,
    workshopName: session.appointment.workshop.name,
    clientEmail: session.appointment.user?.email ?? null,
    clientDisplayName: clientName,
    checklistItems: [...session.checklistItems]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        sortOrder: item.sortOrder,
        completed: item.completed,
        completedAt: item.completedAt?.toISOString() ?? null,
      })),
    suggestions: [...session.suggestions]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        estimatedCostCop: s.estimatedCostCop,
        isUrgent: s.isUrgent,
        status: s.status,
        adminNotes: s.adminNotes,
        reviewedAt: s.reviewedAt?.toISOString() ?? null,
        deadlineAt: s.deadlineAt?.toISOString() ?? null,
        createdAt: s.createdAt.toISOString(),
      })),
  };
}

export async function loadSessionByAppointmentId(appointmentId: string) {
  return prisma.inspectionSession.findUnique({
    where: { appointmentId },
    include: {
      checklistItems: true,
      suggestions: true,
      appointment: {
        include: {
          workshop: { select: { name: true, address: true, city: true } },
          user: {
            select: {
              email: true,
              identityExtraction: { select: { firstName: true, lastName: true } },
            },
          },
        },
      },
    },
  });
}

export async function createDefaultChecklist(sessionId: string): Promise<void> {
  await prisma.inspectionChecklistItem.createMany({
    data: DEFAULT_INSPECTION_STEPS.map((step, index) => ({
      id: generateMixedId(),
      sessionId,
      title: step.title,
      description: step.description,
      sortOrder: index + 1,
    })),
  });
}
