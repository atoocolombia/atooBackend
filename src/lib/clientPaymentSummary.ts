import type { ClientPayment } from "@prisma/client";
import { normalizeIdDocumentNumber } from "./clientPayments.js";
import { prisma } from "./prisma.js";

const LEGACY_PLAN_WEEKS = 260;
const LEGACY_WEEKLY_COP = 207_000;
const DEPOSIT_THRESHOLD_COP = 1_500_000;
const INSTALLMENT_DUE_DAYS = 30;

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
  /** Plan por cuotas fijas (cada pago registrado = 1 cuota). */
  installmentPlan: boolean;
  installmentsPaid: number;
  planInstallments: number;
  remainingInstallments: number;
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

function classifyPayment(
  amountCop: number,
  installmentAmountCop: number,
  installmentPlan: boolean,
): ClientPortalPaymentItem["kind"] {
  if (installmentPlan) return "weekly";
  if (amountCop >= DEPOSIT_THRESHOLD_COP) return "deposit";
  if (amountCop >= installmentAmountCop * 0.5 && amountCop <= installmentAmountCop * 2.5) return "weekly";
  return "other";
}

function mapPortalPayment(
  row: ClientPayment,
  installmentAmountCop: number,
  installmentPlan: boolean,
): ClientPortalPaymentItem {
  return {
    id: row.id,
    amountCop: row.amountCop,
    paidAt: row.paidAt.toISOString(),
    paymentMethod: row.paymentMethod,
    paymentMethodLabel: paymentMethodLabel(row.paymentMethod),
    kind: classifyPayment(row.amountCop, installmentAmountCop, installmentPlan),
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
    include: { identityExtraction: true, vehiclePlan: true },
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

  const plan = user?.vehiclePlan;
  let installmentAmountCop = plan?.installmentAmountCop ?? null;
  let installmentCount = plan?.installmentCount ?? null;

  // Demo en prod si aún no corrió seed/migración del plan por cuotas
  if (
    (installmentAmountCop == null || installmentCount == null) &&
    email.toLowerCase() === "cliente@gmail.com"
  ) {
    installmentAmountCop = 700_000;
    installmentCount = 26;
  }

  const installmentPlan = Boolean(
    installmentAmountCop != null && installmentAmountCop > 0 && installmentCount != null && installmentCount > 0,
  );

  const weeklyPaymentCop = installmentPlan ? installmentAmountCop! : LEGACY_WEEKLY_COP;
  const planInstallments = installmentPlan ? installmentCount! : LEGACY_PLAN_WEEKS;

  const history = payments.map((row) => mapPortalPayment(row, weeklyPaymentCop, installmentPlan));
  const installmentPayments = history.filter((p) => p.kind !== "deposit");

  const totalPaidCop = payments.reduce((sum, row) => sum + row.amountCop, 0);

  let installmentsPaid: number;
  let progressPercent: number;
  let remainingInstallments: number;

  if (installmentPlan) {
    installmentsPaid = installmentPayments.length;
    progressPercent =
      planInstallments > 0 ? Math.min(100, Math.round((installmentsPaid / planInstallments) * 100)) : 0;
    remainingInstallments = Math.max(0, planInstallments - installmentsPaid);
  } else {
    installmentsPaid =
      weeklyPaymentCop > 0 ? Math.floor(totalPaidCop / weeklyPaymentCop) : 0;
    progressPercent =
      planInstallments > 0 ? Math.min(100, Math.round((installmentsPaid / planInstallments) * 100)) : 0;
    remainingInstallments = Math.max(0, planInstallments - installmentsPaid);
  }

  const weeksRecognized = installmentsPaid;
  const remainingWeeks = remainingInstallments;

  const lastPayment = payments[0] ?? null;
  const dueIntervalDays = installmentPlan ? INSTALLMENT_DUE_DAYS : 7;
  const nextPaymentDueAt =
    lastPayment && installmentsPaid < planInstallments ? addDays(lastPayment.paidAt, dueIntervalDays) : null;

  const depositPayment = installmentPlan
    ? null
    : (payments.find((p) => p.amountCop >= DEPOSIT_THRESHOLD_COP) ?? null);

  return {
    weeklyPaymentCop,
    planWeeks: planInstallments,
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
    installmentPlan,
    installmentsPaid,
    planInstallments,
    remainingInstallments,
  };
}
