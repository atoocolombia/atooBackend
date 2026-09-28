import type { ClientPayment } from "@prisma/client";

export function normalizeIdDocumentNumber(value: string): string {
  return value.replace(/\D/g, "").trim();
}

export function mapClientPayment(row: ClientPayment) {
  return {
    id: row.id,
    idDocumentNumber: row.idDocumentNumber,
    amountCop: row.amountCop,
    paidAt: row.paidAt.toISOString(),
    clientName: row.clientName,
    notes: row.notes,
    userId: row.userId,
    registeredByUserId: row.registeredByUserId,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function resolveClientByIdDocument(idDocumentNumber: string) {
  const { prisma } = await import("./prisma.js");
  const normalized = normalizeIdDocumentNumber(idDocumentNumber);
  if (!normalized) return { userId: null as string | null, clientName: null as string | null };

  const identity = await prisma.userIdentityExtraction.findFirst({
    where: {
      OR: [{ idDocumentNumber: normalized }, { idDocumentNumber: { contains: normalized } }],
    },
    include: { user: { include: { identityExtraction: true } } },
  });
  if (identity?.user) {
    const name = [identity.firstName, identity.lastName].filter(Boolean).join(" ").trim();
    return {
      userId: identity.user.id,
      clientName: name || identity.user.email.split("@")[0],
    };
  }

  const delivery = await prisma.vehicleDelivery.findFirst({
    where: {
      OR: [{ idDocumentNumber: normalized }, { idDocumentNumber: { contains: normalized } }],
    },
    orderBy: { createdAt: "desc" },
  });
  if (delivery) {
    return { userId: delivery.userId, clientName: delivery.clientName };
  }

  return { userId: null, clientName: null };
}
