import type { ClientPayment } from "@prisma/client";
import { normalizeIdDocumentNumber } from "./clientPayments.js";
import { prisma } from "./prisma.js";

const PLAN_WEEKS = 260;
const DEFAULT_WEEKLY_COP = 207_000;
const DEPOSIT_THRESHOLD_COP = 1_500_000;

export type ClientPortalPaymentItem = {
  id: string;
  amountCop: number;
  paidAt: string;
  paymentMethod: string | null;
  paymentMethodLabel: string;
  kind: "deposit" | "weekly" | "other";
};

export type ClientPaymentSummary = {
  weeklyPaymentCop: number;
  planWeeks: number;
  totalPaidCop: number;
  paymentsCount: number;
  weeksRecognized: number;
  progressPercent: number;
  remainingWeeks: number;
  lastPaidAt: string | null;
  nextPaymentDueAt: string | null;
  paymentStatus: "current" | "warning" | "critical";
  depositPaid: boolean;
  depositPaidAt: string | null;
  depositAmountCop: number | null;
  history: ClientPortalPaymentItem[];
};

function paymentMethodLabel(method: string | null): string {
  if (!method) return "Pago registrado";
  const labels: Record<string, string> = {
    transferencia: "Transferencia bancaria",
    consignacion: "Consignación",
    pse: "PSE",
    nequi: "Nequi",
    daviplata: "Daviplata",
    efectivo: "Efectivo",
    otro: "Otro",
  };
  return labels[method] ?? method;
}

function classifyPayment(amountCop: number): ClientPortalPaymentItem["kind"] {
  if (amountCop >= DEPOSIT_THRESHOLD_COP) return "deposit";
  if (amountCop >= DEFAULT_WEEKLY_COP * 0.5 && amountCop <= DEFAULT_WEEKLY_COP * 2.5) return "weekly";
  return "other";
}

function mapPortalPayment(row: ClientPayment): ClientPortalPaymentItem {
  return {
    id: row.id,
    amountCop: row.amountCop,
    paidAt: row.paidAt.toISOString(),
    paymentMethod: row.paymentMethod,
    paymentMethodLabel: paymentMethodLabel(row.paymentMethod),
    kind: classifyPayment(row.amountCop),
  };
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function computePaymentStatus(nextDueAt: Date | null): ClientPaymentSummary["paymentStatus"] {
  if (!nextDueAt) return "current";
  const now = new Date();
  const msPerDay = 86400000;
  const daysUntilDue = Math.ceil((nextDueAt.getTime() - now.getTime()) / msPerDay);
  if (daysUntilDue >= 0) return "current";
  const daysLate = Math.abs(daysUntilDue);
  if (daysLate >= 7) return "critical";
  if (daysLate >= 1) return "warning";
  return "current";
}

async function linkOrphanPaymentsToUser(userId: string, email: string, idDoc: string): Promise<void> {
  const emailFilter = email.trim();
  if (!emailFilter && idDoc.length < 5) return;

  await prisma.clientPayment.updateMany({
    where: {
      userId: null,
      OR: [
        ...(emailFilter ? [{ clientEmail: { equals: emailFilter, mode: "insensitive" as const } }] : []),
        ...(idDoc.length >= 5 ? [{ idDocumentNumber: idDoc }] : []),
      ],
    },
    data: { userId },
  });
}

export async function buildClientPaymentSummary(userId: string): Promise<ClientPaymentSummary> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { identityExtraction: true },
  });

  const idDoc = normalizeIdDocumentNumber(user?.identityExtraction?.idDocumentNumber ?? "");
  const email = user?.email?.trim() ?? "";

  await linkOrphanPaymentsToUser(userId, email, idDoc);

  const orFilters: Array<
    { userId: string } | { idDocumentNumber: string } | { clientEmail: { equals: string; mode: "insensitive" } }
  > = [{ userId }];
  if (idDoc.length >= 5) {
    orFilters.push({ idDocumentNumber: idDoc });
  }
  if (email) {
    orFilters.push({ clientEmail: { equals: email, mode: "insensitive" } });
  }

  const payments = await prisma.clientPayment.findMany({
    where: { OR: orFilters },
    orderBy: { paidAt: "desc" },
  });

  const weeklyPaymentCop = DEFAULT_WEEKLY_COP;
  const totalPaidCop = payments.reduce((sum, row) => sum + row.amountCop, 0);
  const weeksRecognized = weeklyPaymentCop > 0 ? Math.floor(totalPaidCop / weeklyPaymentCop) : 0;
  const progressPercent = Math.min(100, Math.round((weeksRecognized / PLAN_WEEKS) * 100));
  const remainingWeeks = Math.max(0, PLAN_WEEKS - weeksRecognized);

  const lastPayment = payments[0] ?? null;
  const nextPaymentDueAt = lastPayment ? addDays(lastPayment.paidAt, 7) : null;

  const depositPayment = payments.find((p) => p.amountCop >= DEPOSIT_THRESHOLD_COP) ?? null;

  const history = payments.map(mapPortalPayment);

  return {
    weeklyPaymentCop,
    planWeeks: PLAN_WEEKS,
    totalPaidCop,
    paymentsCount: payments.length,
    weeksRecognized,
    progressPercent,
    remainingWeeks,
    lastPaidAt: lastPayment?.paidAt.toISOString() ?? null,
    nextPaymentDueAt: nextPaymentDueAt?.toISOString() ?? null,
    paymentStatus: computePaymentStatus(nextPaymentDueAt),
    depositPaid: Boolean(depositPayment),
    depositPaidAt: depositPayment?.paidAt.toISOString() ?? null,
    depositAmountCop: depositPayment?.amountCop ?? null,
    history,
  };
}
