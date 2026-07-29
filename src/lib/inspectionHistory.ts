import { prisma } from "./prisma.js";

export async function listClientInspectionHistory(userId: string) {
  const [plan, sessions] = await Promise.all([
    prisma.clientVehiclePlan.findUnique({ where: { userId } }),
    prisma.inspectionSession.findMany({
      where: {
        status: "COMPLETED",
        appointment: { userId },
      },
      orderBy: { completedAt: "desc" },
      include: {
        appointment: {
          include: {
            workshop: { select: { name: true, city: true } },
          },
        },
        checklistItems: true,
        suggestions: true,
        survey: true,
      },
    }),
  ]);

  return sessions.map((session) => ({
    appointmentId: session.appointmentId,
    sessionId: session.id,
    completedAt: session.completedAt?.toISOString() ?? null,
    appointmentDate: session.appointment.appointmentDate,
    appointmentTime: session.appointment.appointmentTime,
    workshopName: session.appointment.workshop.name,
    workshopCity: session.appointment.workshop.city,
    reason: session.appointment.reason,
    notes: session.notes,
    vehicleName: session.appointment.vehicleNameSnapshot ?? plan?.vehicleName ?? null,
    vin: session.appointment.vinSnapshot ?? plan?.vin ?? null,
    checklistSummary: {
      total: session.checklistItems.length,
      completed: session.checklistItems.filter((item) => item.completed).length,
    },
    procedures: session.suggestions.map((suggestion) => ({
      id: suggestion.id,
      title: suggestion.title,
      status: suggestion.status,
      estimatedCostCop: suggestion.estimatedCostCop,
      isUrgent: suggestion.isUrgent,
    })),
    survey: session.survey
      ? {
          status: session.survey.status,
          rating: session.survey.rating,
          comment: session.survey.comment,
          submittedAt: session.survey.submittedAt?.toISOString() ?? null,
        }
      : null,
  }));
}
