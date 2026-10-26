import type { ClientBillingExtra, ClientServiceOffer, ClientServiceOfferDecision } from "@prisma/client";
import { ClientServiceOfferDecisionStatus } from "@prisma/client";
import { generateMixedId } from "./generateMixedId.js";
import { prisma } from "./prisma.js";
import { buildClientPaymentSummary } from "./clientPaymentSummary.js";

export type BillingExtraLineDto = {
  id: string;
  label: string;
  description: string | null;
  category: string;
  amountCop: number;
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
};

export type ClientBillingStatementDto = {
  periodLabel: string;
  baseInstallmentCop: number;
  baseInstallmentLabel: string;
  extras: BillingExtraLineDto[];
  extrasSubtotalCop: number;
  totalDueCop: number;
  nextPaymentDueAt: string | null;
  pendingOffer: PendingServiceOfferDto | null;
};

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
  };
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

export async function buildClientBillingStatement(userId: string): Promise<ClientBillingStatementDto> {
  const summary = await buildClientPaymentSummary(userId);

  const extrasRows = await prisma.clientBillingExtra.findMany({
    where: { userId, active: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  const extras = extrasRows.map(mapExtra);
  const extrasSubtotalCop = extras.reduce((sum, line) => sum + line.amountCop, 0);
  const baseInstallmentCop = summary.weeklyPaymentCop;
  const totalDueCop = baseInstallmentCop + extrasSubtotalCop;

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
      }
    : null;

  return {
    periodLabel: summary.installmentPlan ? "Cuenta de cobro — periodo mensual" : "Cuenta de cobro — periodo semanal",
    baseInstallmentCop,
    baseInstallmentLabel,
    extras,
    extrasSubtotalCop,
    totalDueCop,
    nextPaymentDueAt: summary.nextPaymentDueAt,
    pendingOffer,
  };
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
        await tx.clientBillingExtra.create({
          data: {
            id: generateMixedId(),
            userId: input.userId,
            label: item.label,
            description: item.description ?? `Incluido al aceptar: ${offer.title}`,
            category: "service",
            amountCop: item.amountCop,
            active: true,
            sortOrder: sortBase + i,
          },
        });
      }
    }
  });

  return buildClientBillingStatement(input.userId);
}
