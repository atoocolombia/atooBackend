import type { ClientBillingExtra, ClientServiceOffer, ClientServiceOfferDecision } from "@prisma/client";
import { ClientServiceOfferDecisionStatus } from "@prisma/client";
import { generateMixedId } from "./generateMixedId.js";
import { prisma } from "./prisma.js";
import { attachBillingCollection, type BillingCollectionDto } from "./clientBillingCollection.js";
import { buildClientPaymentSummary } from "./clientPaymentSummary.js";
import {
  advanceWorkshopDeferredInstallments,
  loadWorkshopLinesForMonth,
  syncWorkshopPlansFromApprovedProcedures,
  type WorkshopBillingLineDto,
} from "./clientWorkshopBilling.js";

export type BillingExtraLineDto = {
  id: string;
  label: string;
  description: string | null;
  category: string;
  amountCop: number;
  totalServiceCop: number | null;
  deferInstallmentsTotal: number | null;
  deferInstallmentsRemaining: number | null;
};

export type ServiceOfferItemDto = {
  label: string;
  amountCop: number;
  description?: string;
};

export type PendingServiceOfferDto = {
  id: string;
  title: string;
  bannerTitle: string;
  bannerSubtitle: string | null;
  detailBody: string;
  extraItems: ServiceOfferItemDto[];
  deferMonths: number;
};

export type BillingPeriodListItemDto = {
  year: number;
  month: number;
  label: string;
  totalDueCop: number;
  isCurrent: boolean;
};

export type ClientBillingStatementDto = {
  year: number;
  month: number;
  periodLabel: string;
  isCurrentPeriod: boolean;
  baseInstallmentCop: number;
  baseInstallmentLabel: string;
  extras: BillingExtraLineDto[];
  extrasSubtotalCop: number;
  workshopCharges: WorkshopBillingLineDto[];
  workshopSubtotalCop: number;
  totalDueCop: number;
  nextPaymentDueAt: string | null;
  pendingOffer: PendingServiceOfferDto | null;
  collection: BillingCollectionDto;
};

const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export function periodLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1] ?? month} ${year}`;
}

function currentCalendarPeriod(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function parseOfferItems(raw: unknown): ServiceOfferItemDto[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      const item = row as Record<string, unknown>;
      const label = String(item.label ?? "").trim();
      const amountCop = Number(item.amountCop);
      if (!label || !Number.isFinite(amountCop) || amountCop < 0) return null;
      const description = item.description != null ? String(item.description).trim() : undefined;
      return { label, amountCop, ...(description ? { description } : {}) };
    })
    .filter((x): x is ServiceOfferItemDto => x !== null);
}

function mapExtra(row: ClientBillingExtra): BillingExtraLineDto {
  return {
    id: row.id,
    label: row.label,
    description: row.description,
    category: row.category,
    amountCop: row.amountCop,
    totalServiceCop: row.totalServiceCop,
    deferInstallmentsTotal: row.deferInstallmentsTotal,
    deferInstallmentsRemaining: row.deferInstallmentsRemaining,
  };
}

function monthlyDeferredCharge(totalCop: number, months: number): number {
  if (months <= 1) return totalCop;
  return Math.ceil(totalCop / months);
}

async function findPendingOfferForUser(
  userId: string,
): Promise<(ClientServiceOffer & { decisions: ClientServiceOfferDecision[] }) | null> {
  const offers = await prisma.clientServiceOffer.findMany({
    where: { active: true },
    orderBy: { createdAt: "desc" },
    include: {
      decisions: { where: { userId }, take: 1 },
    },
  });
  for (const offer of offers) {
    if (offer.decisions.length === 0) return offer;
  }
  return null;
}

async function maybeAdvanceDeferredInstallments(userId: string, year: number, month: number): Promise<void> {
  const prev =
    month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const [prevPeriod, curPeriod] = await Promise.all([
    prisma.clientBillingPeriod.findUnique({
      where: { userId_year_month: { userId, year: prev.year, month: prev.month } },
    }),
    prisma.clientBillingPeriod.findUnique({
      where: { userId_year_month: { userId, year, month } },
    }),
  ]);
  if (curPeriod || !prevPeriod) return;

  const deferred = await prisma.clientBillingExtra.findMany({
    where: {
      userId,
      active: true,
      deferInstallmentsRemaining: { gt: 0 },
    },
  });

  for (const row of deferred) {
    const next = Math.max(0, (row.deferInstallmentsRemaining ?? 0) - 1);
    await prisma.clientBillingExtra.update({
      where: { id: row.id },
      data: {
        deferInstallmentsRemaining: next,
        active: next > 0,
      },
    });
  }

  await advanceWorkshopDeferredInstallments(userId);
}

async function buildLiveStatementCore(
  userId: string,
  year: number,
  month: number,
): Promise<Omit<ClientBillingStatementDto, "year" | "month" | "isCurrentPeriod" | "collection">> {
  const summary = await buildClientPaymentSummary(userId);

  await syncWorkshopPlansFromApprovedProcedures(userId);

  const extrasRows = await prisma.clientBillingExtra.findMany({
    where: { userId, active: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  const extras = extrasRows.map(mapExtra);
  const extrasSubtotalCop = extras.reduce((sum, line) => sum + line.amountCop, 0);
  const workshopCharges = await loadWorkshopLinesForMonth(userId, year, month);
  const workshopSubtotalCop = workshopCharges.reduce((sum, line) => sum + line.amountCop, 0);
  const baseInstallmentCop = summary.weeklyPaymentCop;
  const totalDueCop = baseInstallmentCop + extrasSubtotalCop + workshopSubtotalCop;

  const baseInstallmentLabel = summary.installmentPlan ? "Cuota mensual del plan" : "Cuota semanal del plan";

  const pendingOfferRow = await findPendingOfferForUser(userId);
  const pendingOffer: PendingServiceOfferDto | null = pendingOfferRow
    ? {
        id: pendingOfferRow.id,
        title: pendingOfferRow.title,
        bannerTitle: pendingOfferRow.bannerTitle,
        bannerSubtitle: pendingOfferRow.bannerSubtitle,
        detailBody: pendingOfferRow.detailBody,
        extraItems: parseOfferItems(pendingOfferRow.extraItems),
        deferMonths: Math.max(1, pendingOfferRow.deferMonths ?? 1),
      }
    : null;

  return {
    periodLabel: summary.installmentPlan ? "Cuenta de cobro mensual" : "Cuenta de cobro del periodo",
    baseInstallmentCop,
    baseInstallmentLabel,
    extras,
    extrasSubtotalCop,
    workshopCharges,
    workshopSubtotalCop,
    totalDueCop,
    nextPaymentDueAt: summary.nextPaymentDueAt,
    pendingOffer,
  };
}

async function upsertPeriodSnapshot(
  userId: string,
  year: number,
  month: number,
  core: Omit<ClientBillingStatementDto, "year" | "month" | "isCurrentPeriod" | "pendingOffer" | "collection">,
): Promise<void> {
  const lines = core.extras;
  const workshopLines = core.workshopCharges;
  await prisma.clientBillingPeriod.upsert({
    where: { userId_year_month: { userId, year, month } },
    create: {
      id: generateMixedId(),
      userId,
      year,
      month,
      baseInstallmentCop: core.baseInstallmentCop,
      baseInstallmentLabel: core.baseInstallmentLabel,
      lines,
      workshopLines,
      extrasSubtotalCop: core.extrasSubtotalCop,
      workshopSubtotalCop: core.workshopSubtotalCop,
      totalDueCop: core.totalDueCop,
    },
    update: {
      baseInstallmentCop: core.baseInstallmentCop,
      baseInstallmentLabel: core.baseInstallmentLabel,
      lines,
      workshopLines,
      extrasSubtotalCop: core.extrasSubtotalCop,
      workshopSubtotalCop: core.workshopSubtotalCop,
      totalDueCop: core.totalDueCop,
      snapshotAt: new Date(),
    },
  });
}

function statementFromSnapshot(
  row: {
    year: number;
    month: number;
    baseInstallmentCop: number;
    baseInstallmentLabel: string;
    lines: unknown;
    workshopLines?: unknown;
    extrasSubtotalCop: number;
    workshopSubtotalCop?: number;
    totalDueCop: number;
  },
  isCurrentPeriod: boolean,
): Omit<ClientBillingStatementDto, "collection"> {
  const extras = Array.isArray(row.lines)
    ? (row.lines as BillingExtraLineDto[])
    : [];
  const workshopCharges = Array.isArray(row.workshopLines)
    ? (row.workshopLines as WorkshopBillingLineDto[])
    : [];
  return {
    year: row.year,
    month: row.month,
    periodLabel: `Cuenta de cobro — ${periodLabel(row.year, row.month)}`,
    isCurrentPeriod,
    baseInstallmentCop: row.baseInstallmentCop,
    baseInstallmentLabel: row.baseInstallmentLabel,
    extras,
    extrasSubtotalCop: row.extrasSubtotalCop,
    workshopCharges,
    workshopSubtotalCop: row.workshopSubtotalCop ?? 0,
    totalDueCop: row.totalDueCop,
    nextPaymentDueAt: null,
    pendingOffer: null,
  };
}

async function finalizeStatement(
  userId: string,
  partial: Omit<ClientBillingStatementDto, "collection">,
): Promise<ClientBillingStatementDto> {
  const collection = await attachBillingCollection(userId, {
    year: partial.year,
    month: partial.month,
    totalDueCop: partial.totalDueCop,
    isCurrentPeriod: partial.isCurrentPeriod,
    nextPaymentDueAt: partial.nextPaymentDueAt,
  });
  return { ...partial, collection };
}

export async function listClientBillingPeriods(userId: string): Promise<BillingPeriodListItemDto[]> {
  const { year: cy, month: cm } = currentCalendarPeriod();
  await buildClientBillingStatement(userId, cy, cm);

  const rows = await prisma.clientBillingPeriod.findMany({
    where: { userId },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    take: 24,
  });

  return rows.map((row) => ({
    year: row.year,
    month: row.month,
    label: periodLabel(row.year, row.month),
    totalDueCop: row.totalDueCop,
    isCurrent: row.year === cy && row.month === cm,
  }));
}

export async function buildClientBillingStatement(
  userId: string,
  year?: number,
  month?: number,
): Promise<ClientBillingStatementDto> {
  const current = currentCalendarPeriod();
  const targetYear = year ?? current.year;
  const targetMonth = month ?? current.month;

  if (targetYear > current.year || (targetYear === current.year && targetMonth > current.month)) {
    throw new Error("No puedes consultar un periodo futuro");
  }

  const isCurrentPeriod = targetYear === current.year && targetMonth === current.month;

  if (isCurrentPeriod) {
    await maybeAdvanceDeferredInstallments(userId, targetYear, targetMonth);
    const core = await buildLiveStatementCore(userId, targetYear, targetMonth);
    await upsertPeriodSnapshot(userId, targetYear, targetMonth, {
      periodLabel: core.periodLabel,
      baseInstallmentCop: core.baseInstallmentCop,
      baseInstallmentLabel: core.baseInstallmentLabel,
      extras: core.extras,
      extrasSubtotalCop: core.extrasSubtotalCop,
      workshopCharges: core.workshopCharges,
      workshopSubtotalCop: core.workshopSubtotalCop,
      totalDueCop: core.totalDueCop,
      nextPaymentDueAt: core.nextPaymentDueAt,
    });
    return finalizeStatement(userId, {
      year: targetYear,
      month: targetMonth,
      periodLabel: `${core.periodLabel} — ${periodLabel(targetYear, targetMonth)}`,
      isCurrentPeriod: true,
      baseInstallmentCop: core.baseInstallmentCop,
      baseInstallmentLabel: core.baseInstallmentLabel,
      extras: core.extras,
      extrasSubtotalCop: core.extrasSubtotalCop,
      workshopCharges: core.workshopCharges,
      workshopSubtotalCop: core.workshopSubtotalCop,
      totalDueCop: core.totalDueCop,
      nextPaymentDueAt: core.nextPaymentDueAt,
      pendingOffer: core.pendingOffer,
    });
  }

  const snapshot = await prisma.clientBillingPeriod.findUnique({
    where: { userId_year_month: { userId, year: targetYear, month: targetMonth } },
  });
  if (!snapshot) {
    throw new Error("No hay cuenta de cobro guardada para ese mes");
  }

  return finalizeStatement(userId, statementFromSnapshot(snapshot, false));
}

export async function respondToClientServiceOffer(input: {
  userId: string;
  offerId: string;
  accept: boolean;
}): Promise<ClientBillingStatementDto> {
  const offer = await prisma.clientServiceOffer.findFirst({
    where: { id: input.offerId, active: true },
  });
  if (!offer) {
    throw new Error("Esta oferta ya no está disponible");
  }

  const existing = await prisma.clientServiceOfferDecision.findUnique({
    where: { userId_offerId: { userId: input.userId, offerId: input.offerId } },
  });
  if (existing) {
    throw new Error("Ya respondiste a esta oferta");
  }

  const status = input.accept
    ? ClientServiceOfferDecisionStatus.ACCEPTED
    : ClientServiceOfferDecisionStatus.DECLINED;

  const deferMonths = Math.max(1, offer.deferMonths ?? 1);

  await prisma.$transaction(async (tx) => {
    await tx.clientServiceOfferDecision.create({
      data: {
        id: generateMixedId(),
        offerId: input.offerId,
        userId: input.userId,
        status,
      },
    });

    if (input.accept) {
      const items = parseOfferItems(offer.extraItems);
      const sortBase = await tx.clientBillingExtra.count({ where: { userId: input.userId } });
      for (let i = 0; i < items.length; i++) {
        const item = items[i]!;
        const totalServiceCop = item.amountCop;
        const monthly = monthlyDeferredCharge(totalServiceCop, deferMonths);
        const deferNote =
          deferMonths > 1
            ? `Pago en ${deferMonths} cuotas mensuales de ${monthly.toLocaleString("es-CO")} COP (total ${totalServiceCop.toLocaleString("es-CO")} COP).`
            : undefined;
        await tx.clientBillingExtra.create({
          data: {
            id: generateMixedId(),
            userId: input.userId,
            label: item.label,
            description:
              [item.description, deferNote, `Incluido al aceptar: ${offer.title}`]
                .filter(Boolean)
                .join(" ") || null,
            category: "service",
            amountCop: monthly,
            totalServiceCop: deferMonths > 1 ? totalServiceCop : null,
            deferInstallmentsTotal: deferMonths > 1 ? deferMonths : null,
            deferInstallmentsRemaining: deferMonths > 1 ? deferMonths : null,
            active: true,
            sortOrder: sortBase + i,
          },
        });
      }
    }
  });

  const { year, month } = currentCalendarPeriod();
  return buildClientBillingStatement(input.userId, year, month);
}
