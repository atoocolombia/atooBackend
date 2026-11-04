import type { VehicleHistoryEventType } from "@prisma/client";
import { prisma } from "./prisma.js";

export type VehicleHistoryTimelineItem = {
  id: string;
  source: "record" | "inspection";
  eventType: VehicleHistoryEventType;
  title: string;
  description: string | null;
  occurredAt: string;
  workshopName?: string | null;
  metadata?: Record<string, unknown> | null;
};

function inferInspectionEventType(reason: string | null, kind: string): VehicleHistoryEventType {
  const text = (reason ?? "").toLowerCase();
  if (text.includes("tecno") || text.includes("revisión técnico")) return "TECHNOMECHANICAL";
  if (text.includes("period") || text.includes("preventiv")) return "PERIODIC_REVIEW";
  if (kind === "BUSINESS_PLANNED") return "PERIODIC_REVIEW";
  return "WORKSHOP_VISIT";
}

export async function buildVehicleHistoryTimeline(userId: string): Promise<VehicleHistoryTimelineItem[]> {
  const [records, sessions] = await Promise.all([
    prisma.vehicleHistoryEvent.findMany({
      where: { userId },
      orderBy: { occurredAt: "desc" },
    }),
    prisma.inspectionSession.findMany({
      where: { status: "COMPLETED", appointment: { userId } },
      orderBy: { completedAt: "desc" },
      include: {
        appointment: { include: { workshop: { select: { name: true } } } },
        suggestions: true,
      },
    }),
  ]);

  const items: VehicleHistoryTimelineItem[] = records.map((row) => ({
    id: row.id,
    source: "record",
    eventType: row.eventType,
    title: row.title,
    description: row.description,
    occurredAt: row.occurredAt.toISOString(),
    metadata: row.metadata as Record<string, unknown> | null,
  }));

  for (const session of sessions) {
    const appt = session.appointment;
    const occurredAt = session.completedAt ?? appt.createdAt;
    items.push({
      id: `inspection-${session.id}`,
      source: "inspection",
      eventType: inferInspectionEventType(appt.reason, appt.kind),
      title: `Visita a taller — ${appt.workshop.name}`,
      description: session.notes ?? appt.reason,
      occurredAt: occurredAt.toISOString(),
      workshopName: appt.workshop.name,
      metadata: {
        appointmentDate: appt.appointmentDate,
        appointmentTime: appt.appointmentTime,
      },
    });

    for (const suggestion of session.suggestions) {
      if (suggestion.status === "REJECTED") continue;
      items.push({
        id: `part-${suggestion.id}`,
        source: "inspection",
        eventType: "PART_REPLACEMENT",
        title: suggestion.title,
        description: suggestion.description,
        occurredAt: (suggestion.reviewedAt ?? occurredAt).toISOString(),
        workshopName: appt.workshop.name,
        metadata: {
          estimatedCostCop: suggestion.estimatedCostCop,
          status: suggestion.status,
        },
      });
    }
  }

  return items.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}
