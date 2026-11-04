import { ApplicationStatus } from "@prisma/client";
import { generateMixedId } from "./generateMixedId.js";
import { prisma } from "./prisma.js";
import { sendPracticalTestInviteEmail } from "./deliveryEmails.js";
import { buildClientName } from "./mapVehicleDelivery.js";
import type { BackgroundCheckId } from "./backgroundCheckLinks.js";

const BG_FIELD: Record<
  BackgroundCheckId,
  { approved: "backgroundJudicialApproved" | "backgroundProcuraduriaApproved" | "backgroundSimitApproved"; comment: "backgroundJudicialComment" | "backgroundProcuraduriaComment" | "backgroundSimitComment" }
> = {
  judicial: { approved: "backgroundJudicialApproved", comment: "backgroundJudicialComment" },
  procuraduria: { approved: "backgroundProcuraduriaApproved", comment: "backgroundProcuraduriaComment" },
  simit: { approved: "backgroundSimitApproved", comment: "backgroundSimitComment" },
};

const applicationInclude = {
  user: { include: { identityExtraction: true, workAddressExtraction: true, applicationKnowledgeTest: true } },
  practicalTestAppointment: { include: { evaluation: true } },
} as const;

function allBackgroundChecksApproved(app: {
  backgroundJudicialApproved: boolean | null;
  backgroundProcuraduriaApproved: boolean | null;
  backgroundSimitApproved: boolean | null;
}): boolean {
  return (
    app.backgroundJudicialApproved === true &&
    app.backgroundProcuraduriaApproved === true &&
    app.backgroundSimitApproved === true
  );
}

export async function patchApplicationBackgroundChecks(
  applicationId: string,
  checks: Partial<
    Record<BackgroundCheckId, { approved?: boolean | null; comment?: string | null }>
  >,
) {
  const data: Record<string, boolean | string | null> = {};
  for (const id of Object.keys(checks) as BackgroundCheckId[]) {
    const patch = checks[id];
    if (!patch) continue;
    const fields = BG_FIELD[id];
    if (patch.approved !== undefined) {
      data[fields.approved] = patch.approved;
    }
    if (patch.comment !== undefined) {
      data[fields.comment] =
        typeof patch.comment === "string" && patch.comment.trim() ? patch.comment.trim() : null;
    }
  }

  return prisma.application.update({
    where: { id: applicationId },
    data,
    include: applicationInclude,
  });
}

export async function enablePracticalTestScheduling(applicationId: string, analystUserId: string) {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { user: { include: { identityExtraction: true } } },
  });
  if (!app) throw new Error("Solicitud no encontrada");
  if (app.status !== ApplicationStatus.SUBMITTED) {
    throw new Error("Solo puedes habilitar citas en solicitudes pendientes");
  }
  if (!allBackgroundChecksApproved(app)) {
    throw new Error("Aprueba las tres revisiones de antecedentes antes de habilitar la cita");
  }

  const updated = await prisma.application.update({
    where: { id: applicationId },
    data: {
      practicalTestSchedulingEnabled: true,
      assignedAnalystUserId: analystUserId,
      practicalTestInviteSentAt: new Date(),
    },
    include: applicationInclude,
  });

  const clientName = buildClientName(updated.user.identityExtraction, updated.user.email);
  await sendPracticalTestInviteEmail(clientName, updated.user.email);

  return updated;
}

export async function bookPracticalTestAppointment(
  userId: string,
  slot: { date: string; startTime: string; endTime: string },
) {
  const app = await prisma.application.findUnique({
    where: { userId },
    include: { practicalTestAppointment: true },
  });
  if (!app?.practicalTestSchedulingEnabled) {
    throw new Error("Aún no puedes agendar la prueba práctica");
  }
  if (app.practicalTestAppointment) {
    throw new Error("Ya tienes una cita agendada");
  }
  const analystUserId = app.assignedAnalystUserId;
  if (!analystUserId) throw new Error("No hay analista asignado");

  const conflict = await prisma.practicalTestAppointment.findFirst({
    where: {
      analystUserId,
      date: slot.date,
      startTime: slot.startTime,
      status: "SCHEDULED",
    },
  });
  if (conflict) throw new Error("Ese horario ya no está disponible");

  return prisma.practicalTestAppointment.create({
    data: {
      id: generateMixedId(),
      applicationId: app.id,
      userId,
      analystUserId,
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
    },
  });
}
