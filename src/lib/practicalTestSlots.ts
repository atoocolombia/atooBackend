import { prisma } from "./prisma.js";

function parseHm(hm: string): number {
  const [h, m] = hm.split(":").map((x) => Number.parseInt(x, 10));
  return (h ?? 0) * 60 + (m ?? 0);
}

function formatHm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export type AvailablePracticalSlot = {
  date: string;
  startTime: string;
  endTime: string;
};

export async function listAvailablePracticalTestSlots(
  analystUserId: string,
  fromDate: string,
  days = 21,
): Promise<AvailablePracticalSlot[]> {
  const schedules = await prisma.analystWeeklySchedule.findMany({
    where: { analystUserId },
  });
  if (schedules.length === 0) return [];

  const toDate = addDaysIso(fromDate, days);
  const booked = await prisma.practicalTestAppointment.findMany({
    where: {
      analystUserId,
      status: "SCHEDULED",
      date: { gte: fromDate, lte: toDate },
    },
    select: { date: true, startTime: true, endTime: true },
  });

  const bookedSet = new Set(booked.map((b) => `${b.date}|${b.startTime}`));
  const slots: AvailablePracticalSlot[] = [];

  for (let offset = 0; offset <= days; offset += 1) {
    const date = addDaysIso(fromDate, offset);
    const weekday = new Date(`${date}T12:00:00`).getDay();
    const daySchedules = schedules.filter((s) => s.weekday === weekday);
    for (const sched of daySchedules) {
      const startMin = parseHm(sched.startTime);
      const endMin = parseHm(sched.endTime);
      for (let t = startMin; t + sched.slotMinutes <= endMin; t += sched.slotMinutes) {
        const startTime = formatHm(t);
        const endTime = formatHm(t + sched.slotMinutes);
        const key = `${date}|${startTime}`;
        if (!bookedSet.has(key)) {
          slots.push({ date, startTime, endTime });
        }
      }
    }
  }

  return slots.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
}
