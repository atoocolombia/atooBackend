import type { ClientWorkshopPaymentPlan } from "@prisma/client";
import { ProcedureSuggestionStatus } from "@prisma/client";
import { generateMixedId } from "./generateMixedId.js";
import { prisma } from "./prisma.js";

export type WorkshopBillingLineDto = {
  id: string;
  workshopName: string;
  title: string;
  amountCop: number;
  totalCostCop: number;
  paymentMode: "single_month" | "deferred";
  deferMonths: number;
  installmentsTotal: number | null;
  installmentsRemaining: number | null;
  installmentLabel: string | null;
};

function periodIndex(year: number, month: number): number {
  return year * 12 + month;
}

function monthlyCharge(totalCostCop: number, deferMonths: number): number {
  if (deferMonths <= 1) return totalCostCop;
  return Math.ceil(totalCostCop / deferMonths);
}

function chargeAmountForInstallment(plan: ClientWorkshopPaymentPlan, installmentIndex: number): number {
  if (plan.deferMonths <= 1) return plan.totalCostCop;
  if (installmentIndex < 0 || installmentIndex >= plan.installmentsTotal) return 0;
  const isLast = installmentIndex === plan.installmentsTotal - 1;
  if (isLast) {
    const prior = plan.monthlyChargeCop * (plan.installmentsTotal - 1);
    return plan.totalCostCop - prior;
  }
  return plan.monthlyChargeCop;
}

export function mapWorkshopPlanToLine(
  plan: ClientWorkshopPaymentPlan,
  amountCop: number,
  year: number,
  month: number,
): WorkshopBillingLineDto {
  const deferred = plan.deferMonths > 1;
  const start = periodIndex(plan.billingStartYear, plan.billingStartMonth);
  const installmentIndex = periodIndex(year, month) - start;
  return {
    id: plan.id,
    workshopName: plan.workshopName,
    title: plan.title,
    amountCop,
    totalCostCop: plan.totalCostCop,
    paymentMode: deferred ? "deferred" : "single_month",
    deferMonths: plan.deferMonths,
    installmentsTotal: deferred ? plan.installmentsTotal : null,
    installmentsRemaining: deferred ? plan.installmentsRemaining : null,
    installmentLabel: deferred
      ? `Cuota ${installmentIndex + 1} de ${plan.installmentsTotal} (taller)`
      : "Pago único del mes (taller)",
  };
}

export function workshopChargeForPeriod(
  plan: ClientWorkshopPaymentPlan,
  year: number,
  month: number,
): number {
  const target = periodIndex(year, month);
  const start = periodIndex(plan.billingStartYear, plan.billingStartMonth);
  if (target < start) return 0;

  if (plan.deferMonths <= 1) {
    return target === start ? plan.totalCostCop : 0;
  }

  const installmentIndex = target - start;
  if (installmentIndex < 0 || installmentIndex >= plan.installmentsTotal) return 0;
  return chargeAmountForInstallment(plan, installmentIndex);
}

export async function loadWorkshopLinesForMonth(
  userId: string,
  year: number,
  month: number,
): Promise<WorkshopBillingLineDto[]> {
  const plans = await prisma.clientWorkshopPaymentPlan.findMany({
    where: { userId, active: true },
    orderBy: { createdAt: "asc" },
  });

  const lines: WorkshopBillingLineDto[] = [];
  for (const plan of plans) {
    const amount = workshopChargeForPeriod(plan, year, month);
    if (amount > 0) lines.push(mapWorkshopPlanToLine(plan, amount, year, month));
  }
  return lines;
}

export async function syncWorkshopPlansFromApprovedProcedures(userId: string): Promise<void> {
  const approved = await prisma.inspectionProcedureSuggestion.findMany({
    where: {
      status: ProcedureSuggestionStatus.APPROVED_CLIENT_SCHEDULE,
      estimatedCostCop: { gt: 0 },
      session: { appointment: { userId } },
    },
    include: {
      session: {
        include: {
          appointment: { include: { workshop: { select: { name: true } } } },
        },
      },
    },
  });

  for (const row of approved) {
    const existing = await prisma.clientWorkshopPaymentPlan.findUnique({
      where: { suggestionId: row.id },
    });
    if (existing) continue;

    const anchor = row.reviewedAt ?? row.createdAt;
    await createWorkshopPaymentPlanFromApproval({
      userId,
      suggestionId: row.id,
      workshopName: row.session.appointment.workshop.name,
      title: row.title,
      totalCostCop: row.estimatedCostCop!,
      deferMonths: 1,
      billingStartYear: anchor.getFullYear(),
      billingStartMonth: anchor.getMonth() + 1,
    });
  }
}

export async function createWorkshopPaymentPlanFromApproval(input: {
  userId: string;
  suggestionId: string;
  workshopName: string;
  title: string;
  totalCostCop: number;
  deferMonths?: number;
  billingStartYear?: number;
  billingStartMonth?: number;
}): Promise<void> {
  const deferMonths = Math.max(1, Math.min(36, Math.round(input.deferMonths ?? 1)));
  const now = new Date();
  const billingStartYear = input.billingStartYear ?? now.getFullYear();
  const billingStartMonth = input.billingStartMonth ?? now.getMonth() + 1;
  const monthly = monthlyCharge(input.totalCostCop, deferMonths);

  await prisma.clientWorkshopPaymentPlan.upsert({
    where: { suggestionId: input.suggestionId },
    create: {
      id: generateMixedId(),
      userId: input.userId,
      suggestionId: input.suggestionId,
      workshopName: input.workshopName,
      title: input.title,
      totalCostCop: input.totalCostCop,
      monthlyChargeCop: monthly,
      deferMonths,
      installmentsTotal: deferMonths,
      installmentsRemaining: deferMonths,
      billingStartYear,
      billingStartMonth,
      active: true,
    },
    update: {
      totalCostCop: input.totalCostCop,
      monthlyChargeCop: monthly,
      deferMonths,
      installmentsTotal: deferMonths,
      installmentsRemaining: deferMonths,
      active: true,
    },
  });
}

export async function advanceWorkshopDeferredInstallments(userId: string): Promise<void> {
  const plans = await prisma.clientWorkshopPaymentPlan.findMany({
    where: { userId, active: true, deferMonths: { gt: 1 }, installmentsRemaining: { gt: 0 } },
  });
  for (const plan of plans) {
    const next = plan.installmentsRemaining - 1;
    await prisma.clientWorkshopPaymentPlan.update({
      where: { id: plan.id },
      data: {
        installmentsRemaining: next,
        active: next > 0,
      },
    });
  }
}
