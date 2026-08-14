import { prisma } from "./prisma.js";
import { createUserNotification } from "./userNotifications.js";

function bogotaDate(value = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function addDays(date: string, days: number): string {
  const base = new Date(`${date}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function dateDiffDays(from: string, to: string): number {
  const fromMs = new Date(`${from}T12:00:00Z`).getTime();
  const toMs = new Date(`${to}T12:00:00Z`).getTime();
  return Math.round((toMs - fromMs) / 86_400_000);
}

export async function ensureInspectionReminders(userId: string): Promise<void> {
  const today = bogotaDate();
  const tomorrow = addDays(today, 1);
  const [plan, openAppointments, tomorrowAppointments] = await Promise.all([
    prisma.clientVehiclePlan.findUnique({ where: { userId } }),
    prisma.inspectionAppointment.count({
      where: {
        userId,
        status: { in: ["PENDING", "CONFIRMED", "IN_PROGRESS", "RESCHEDULE_PENDING"] },
      },
    }),
    prisma.inspectionAppointment.findMany({
      where: {
        userId,
        status: "CONFIRMED",
        appointmentDate: tomorrow,
      },
      include: { workshop: { select: { name: true } } },
    }),
  ]);

  if (plan && openAppointments === 0) {
    const dueDate = plan.nextInspectionDueAt.toISOString().slice(0, 10);
    const daysUntilDue = dateDiffDays(today, dueDate);
    if (daysUntilDue <= 14) {
      const overdue = daysUntilDue < 0;
      await createUserNotification({
        userId,
        type: "inspection_reminder",
        title: overdue ? "Revisión vencida" : "Tu revisión se acerca",
        message: overdue
          ? `La revisión de ${plan.vehicleName} venció el ${dueDate}. Agenda una cita cuanto antes.`
          : `La revisión de ${plan.vehicleName} vence el ${dueDate}. Agenda tu cita con anticipación.`,
        reminderKey: `due:${dueDate}:${overdue ? "OVERDUE" : "DUE_SOON"}`,
        metadata: {
          reminderKind: overdue ? "OVERDUE" : "DUE_SOON",
          nextInspectionDueAt: dueDate,
          daysUntilDue,
        },
      });
    }
  }

  for (const appointment of tomorrowAppointments) {
    await createUserNotification({
      userId,
      type: "inspection_reminder",
      title: "Tu cita es mañana",
      message: `Recuerda tu cita en ${appointment.workshop.name} mañana a las ${appointment.appointmentTime ?? "la hora acordada"}.`,
      reminderKey: `appointment:${appointment.id}:TOMORROW`,
      metadata: {
        reminderKind: "APPOINTMENT_TOMORROW",
        appointmentId: appointment.id,
        appointmentDate: appointment.appointmentDate,
      },
    });
  }
}
