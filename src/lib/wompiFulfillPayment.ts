import { WompiPaymentIntentStatus } from "@prisma/client";
import { UserType } from "@prisma/client";
import { generateMixedId } from "./generateMixedId.js";
import { normalizeIdDocumentNumber } from "./clientPayments.js";
import { prisma } from "./prisma.js";

async function resolveRegistrarUserId(): Promise<string> {
  const fromEnv = process.env.WOMPI_REGISTRAR_USER_ID?.trim();
  if (fromEnv) {
    const row = await prisma.user.findUnique({ where: { id: fromEnv }, select: { id: true } });
    if (row) return row.id;
  }
  const admin = await prisma.user.findFirst({
    where: { userType: { in: [UserType.ADMIN, UserType.ANALYST] } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!admin) {
    throw new Error("No hay usuario ADMIN/ANALYST para registrar pagos Wompi");
  }
  return admin.id;
}

export async function fulfillWompiTransaction(input: {
  reference: string;
  wompiTransactionId: string;
  status: string;
  amountInCents: number;
}): Promise<void> {
  const intent = await prisma.wompiPaymentIntent.findUnique({ where: { reference: input.reference } });
  if (!intent) {
    console.warn("[wompi] Referencia desconocida:", input.reference);
    return;
  }

  if (intent.status === WompiPaymentIntentStatus.APPROVED && intent.clientPaymentId) {
    return;
  }

  const status = input.status.toUpperCase();
  if (status !== "APPROVED") {
    const mapped =
      status === "DECLINED"
        ? WompiPaymentIntentStatus.DECLINED
        : status === "VOIDED"
          ? WompiPaymentIntentStatus.VOIDED
          : WompiPaymentIntentStatus.ERROR;
    await prisma.wompiPaymentIntent.update({
      where: { id: intent.id },
      data: { status: mapped, wompiTransactionId: input.wompiTransactionId },
    });
    return;
  }

  const expectedCents = intent.amountCop * 100;
  if (input.amountInCents !== expectedCents) {
    console.error(
      `[wompi] Monto distinto ref=${input.reference} esperado=${expectedCents} recibido=${input.amountInCents}`,
    );
    await prisma.wompiPaymentIntent.update({
      where: { id: intent.id },
      data: { status: WompiPaymentIntentStatus.ERROR, wompiTransactionId: input.wompiTransactionId },
    });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: intent.userId },
    include: { identityExtraction: true },
  });
  if (!user) return;

  const idDoc = normalizeIdDocumentNumber(user.identityExtraction?.idDocumentNumber ?? "");
  if (idDoc.length < 5) {
    console.error(`[wompi] Usuario ${user.id} sin documento; no se registra pago`);
    return;
  }

  const clientName =
    [user.identityExtraction?.firstName, user.identityExtraction?.lastName].filter(Boolean).join(" ").trim() ||
    user.email;

  const registrarId = await resolveRegistrarUserId();
  const notes = intent.kind === "DEPOSIT" ? "wompi:deposit" : "wompi:installment";

  const payment = await prisma.clientPayment.create({
    data: {
      id: generateMixedId(),
      idDocumentNumber: idDoc,
      idDocumentType: "CC",
      amountCop: intent.amountCop,
      paidAt: new Date(),
      registeredByUserId: registrarId,
      userId: user.id,
      clientName,
      clientEmail: user.email,
      clientPhone: null,
      clientAddress: null,
      paymentMethod: "wompi",
      paymentReference: input.wompiTransactionId,
      notes,
    },
  });

  await prisma.wompiPaymentIntent.update({
    where: { id: intent.id },
    data: {
      status: WompiPaymentIntentStatus.APPROVED,
      wompiTransactionId: input.wompiTransactionId,
      clientPaymentId: payment.id,
    },
  });
}