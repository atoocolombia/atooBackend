import { normalizeIdDocumentNumber } from "./clientPayments.js";
import { prisma } from "./prisma.js";

export type BillingCollectionStatus =
  | "paid"
  | "partial"
  | "pending"
  | "due_soon"
  | "overdue";

export type BillingCollectionDto = {
  status: BillingCollectionStatus;
  paidRegisteredCop: number;
  remainingDueCop: number;
  dueAt: string | null;
  alertTitle: string | null;
  alertMessage: string | null;
};

const DUE_SOON_DAYS = 3;

function monthRange(year: number, month: number): { start: Date; end: Date } {
  return {
    start: new Date(year, month - 1, 1, 0, 0, 0, 0),
    end: new Date(year, month, 1, 0, 0, 0, 0),
  };
}

function lastDayOfMonth(year: number, month: number): Date {
  return new Date(year, month, 0, 23, 59, 59, 999);
}

export async function sumRegisteredPaymentsInMonth(
  userId: string,
  year: number,
  month: number,
): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { identityExtraction: true },
  });
  const idDoc = normalizeIdDocumentNumber(user?.identityExtraction?.idDocumentNumber ?? "");
  const email = user?.email?.trim() ?? "";

  const { start, end } = monthRange(year, month);
  const orFilters: Array<
    { userId: string } | { idDocumentNumber: string } | { clientEmail: { equals: string; mode: "insensitive" } }
  > = [{ userId }];
  if (idDoc.length >= 5) orFilters.push({ idDocumentNumber: idDoc });
  if (email) orFilters.push({ clientEmail: { equals: email, mode: "insensitive" } });

  const rows = await prisma.clientPayment.findMany({
    where: {
      OR: orFilters,
      paidAt: { gte: start, lt: end },
    },
    select: { amountCop: true },
  });

  return rows.reduce((sum, row) => sum + row.amountCop, 0);
}

function formatCopPlain(amount: number): string {
  return `$${amount.toLocaleString("es-CO")}`;
}

export function buildBillingCollectionInfo(input: {
  totalDueCop: number;
  paidRegisteredCop: number;
  dueAt: Date | null;
  isCurrentPeriod: boolean;
}): BillingCollectionDto {
  const { totalDueCop, paidRegisteredCop, isCurrentPeriod } = input;
  const remainingDueCop = Math.max(0, totalDueCop - paidRegisteredCop);
  const dueAt = input.dueAt;

  if (totalDueCop <= 0) {
    return {
      status: "paid",
      paidRegisteredCop,
      remainingDueCop: 0,
      dueAt: dueAt?.toISOString() ?? null,
      alertTitle: null,
      alertMessage: null,
    };
  }

  if (paidRegisteredCop >= totalDueCop) {
    return {
      status: "paid",
      paidRegisteredCop,
      remainingDueCop: 0,
      dueAt: dueAt?.toISOString() ?? null,
      alertTitle: "Pago del mes registrado",
      alertMessage: `atoo registró ${formatCopPlain(paidRegisteredCop)} para este periodo. Gracias por tu pago.`,
    };
  }

  if (paidRegisteredCop > 0) {
    return {
      status: "partial",
      paidRegisteredCop,
      remainingDueCop,
      dueAt: dueAt?.toISOString() ?? null,
      alertTitle: "Pago incompleto",
      alertMessage: `Registramos ${formatCopPlain(paidRegisteredCop)} de ${formatCopPlain(totalDueCop)} de tu cuenta de cobro. Falta ${formatCopPlain(remainingDueCop)} por confirmar en atoo.`,
    };
  }

  const now = new Date();
  if (dueAt) {
    const msPerDay = 86400000;
    const daysUntilDue = Math.ceil((dueAt.getTime() - now.getTime()) / msPerDay);
    if (daysUntilDue < 0) {
      const daysLate = Math.abs(daysUntilDue);
      return {
        status: "overdue",
        paidRegisteredCop: 0,
        remainingDueCop,
        dueAt: dueAt.toISOString(),
        alertTitle: "Pago vencido",
        alertMessage: isCurrentPeriod
          ? `No tenemos registrado tu pago de ${formatCopPlain(totalDueCop)}. La fecha de referencia venció hace ${daysLate} día${daysLate === 1 ? "" : "s"}. Regulariza cuanto antes o escribe a soporte.`
          : `Este mes no quedó registrado el pago de ${formatCopPlain(totalDueCop)}.`,
      };
    }
    if (daysUntilDue <= DUE_SOON_DAYS) {
      return {
        status: "due_soon",
        paidRegisteredCop: 0,
        remainingDueCop,
        dueAt: dueAt.toISOString(),
        alertTitle: "Pago por vencer",
        alertMessage: `Aún no registramos tu pago de ${formatCopPlain(totalDueCop)}. La fecha de referencia es ${dueAt.toLocaleDateString("es-CO")} (${daysUntilDue === 0 ? "hoy" : `en ${daysUntilDue} día${daysUntilDue === 1 ? "" : "s"}`}).`,
      };
    }
  }

  return {
    status: "pending",
    paidRegisteredCop: 0,
    remainingDueCop,
    dueAt: dueAt?.toISOString() ?? null,
    alertTitle: isCurrentPeriod ? "Pago pendiente de registro" : null,
    alertMessage: isCurrentPeriod
      ? `Cuando transfieras o consignes, atoo registrará el pago aquí. Monto de este mes: ${formatCopPlain(totalDueCop)}.`
      : `No hay pagos registrados en este mes por ${formatCopPlain(totalDueCop)}.`,
  };
}

export function resolvePeriodDueDate(
  year: number,
  month: number,
  isCurrentPeriod: boolean,
  nextPaymentDueAt: string | null,
): Date | null {
  if (isCurrentPeriod && nextPaymentDueAt) {
    const parsed = new Date(nextPaymentDueAt);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return lastDayOfMonth(year, month);
}

export async function attachBillingCollection(
  userId: string,
  statement: {
    year: number;
    month: number;
    totalDueCop: number;
    isCurrentPeriod: boolean;
    nextPaymentDueAt: string | null;
  },
): Promise<BillingCollectionDto> {
  const paidRegisteredCop = await sumRegisteredPaymentsInMonth(userId, statement.year, statement.month);
  const dueAt = resolvePeriodDueDate(
    statement.year,
    statement.month,
    statement.isCurrentPeriod,
    statement.nextPaymentDueAt,
  );
  return buildBillingCollectionInfo({
    totalDueCop: statement.totalDueCop,
    paidRegisteredCop,
    dueAt,
    isCurrentPeriod: statement.isCurrentPeriod,
  });
}
