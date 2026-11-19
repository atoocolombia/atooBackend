import { WompiPaymentKind } from "@prisma/client";
import { generateMixedId } from "./generateMixedId.js";
import { buildClientPaymentSummary } from "./clientPaymentSummary.js";
import { getWompiConfig, isWompiConfigured } from "./wompiConfig.js";
import { resolveWompiRedirectUrl } from "./wompiRedirect.js";
import { buildWompiIntegritySignature, copToCents } from "./wompiIntegrity.js";
import { prisma } from "./prisma.js";

export type WompiWidgetSessionDto = {
  publicKey: string;
  currency: string;
  amountInCents: number;
  amountCop: number;
  reference: string;
  integritySignature: string;
  redirectUrl: string;
  kind: "deposit" | "installment";
  customerEmail: string;
  customerFullName: string | null;
};

function buildReference(): string {
  return `atoo-${generateMixedId().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32)}`;
}

async function resolvePayableAmount(
  userId: string,
  kind: WompiPaymentKind,
): Promise<{ amountCop: number; summary: Awaited<ReturnType<typeof buildClientPaymentSummary>> }> {
  const summary = await buildClientPaymentSummary(userId);

  if (kind === WompiPaymentKind.DEPOSIT) {
    if (summary.depositPaid) {
      throw Object.assign(new Error("El depósito inicial ya fue registrado"), { statusCode: 400 });
    }
    const amountCop = summary.depositAmountCop;
    if (amountCop == null || amountCop <= 0) {
      throw Object.assign(new Error("No hay monto de depósito definido para tu cuenta. Contacta a atoo."), {
        statusCode: 400,
      });
    }
    return { amountCop, summary };
  }

  if (summary.remainingInstallments <= 0 && summary.planInstallments > 0) {
    throw Object.assign(new Error("Ya completaste todas las cuotas de tu plan"), { statusCode: 400 });
  }

  const amountCop = summary.weeklyPaymentCop;
  if (!Number.isFinite(amountCop) || amountCop <= 0) {
    throw Object.assign(new Error("No hay monto de cuota definido para tu plan"), { statusCode: 400 });
  }

  return { amountCop, summary };
}

export async function createWompiWidgetSession(
  userId: string,
  kindParam: "deposit" | "installment",
  redirectUrlRequested?: string,
): Promise<WompiWidgetSessionDto> {
  if (!isWompiConfigured()) {
    throw Object.assign(new Error("Los pagos en línea no están disponibles"), { statusCode: 503 });
  }

  const kind = kindParam === "deposit" ? WompiPaymentKind.DEPOSIT : WompiPaymentKind.INSTALLMENT;
  const { amountCop } = await resolvePayableAmount(userId, kind);
  const redirectUrl = resolveWompiRedirectUrl(redirectUrlRequested);

  const pending = await prisma.wompiPaymentIntent.findFirst({
    where: { userId, kind, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
  if (pending && pending.amountCop === amountCop) {
    const config = getWompiConfig();
    const amountInCents = copToCents(pending.amountCop);
    const integritySignature = buildWompiIntegritySignature({
      reference: pending.reference,
      amountInCents,
      integritySecret: config.integritySecret,
    });
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { identityExtraction: true },
    });
    const customerFullName = user?.identityExtraction
      ? [user.identityExtraction.firstName, user.identityExtraction.lastName].filter(Boolean).join(" ").trim()
      : null;

    return {
      publicKey: config.publicKey,
      currency: "COP",
      amountInCents,
      amountCop: pending.amountCop,
      reference: pending.reference,
      integritySignature,
      redirectUrl,
      kind: kindParam,
      customerEmail: user?.email ?? "",
      customerFullName: customerFullName || null,
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { identityExtraction: true },
  });
  if (!user?.email) {
    throw Object.assign(new Error("Tu cuenta no tiene correo registrado"), { statusCode: 400 });
  }

  const reference = buildReference();
  const config = getWompiConfig();
  const amountInCents = copToCents(amountCop);
  const integritySignature = buildWompiIntegritySignature({
    reference,
    amountInCents,
    integritySecret: config.integritySecret,
  });

  await prisma.wompiPaymentIntent.create({
    data: {
      id: generateMixedId(),
      userId,
      kind,
      amountCop,
      reference,
    },
  });

  const customerFullName = user.identityExtraction
    ? [user.identityExtraction.firstName, user.identityExtraction.lastName].filter(Boolean).join(" ").trim()
    : null;

  return {
    publicKey: config.publicKey,
    currency: "COP",
    amountInCents,
    amountCop,
    reference,
    integritySignature,
    redirectUrl,
    kind: kindParam,
    customerEmail: user.email,
    customerFullName: customerFullName || null,
  };
}