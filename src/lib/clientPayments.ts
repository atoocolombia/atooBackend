import type { ClientPayment, User } from "@prisma/client";
import { prisma } from "./prisma.js";

export function normalizeIdDocumentNumber(value: string): string {
  return value.replace(/\D/g, "").trim();
}

export type ClientPaymentLookup = {
  userId: string | null;
  idDocumentNumber: string;
  idDocumentType: string;
  clientName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  source: "user" | "delivery";
};

export function mapClientPayment(
  row: ClientPayment & { registeredBy?: Pick<User, "email"> | null },
) {
  return {
    id: row.id,
    idDocumentNumber: row.idDocumentNumber,
    idDocumentType: row.idDocumentType,
    amountCop: row.amountCop,
    paidAt: row.paidAt.toISOString(),
    clientName: row.clientName,
    clientEmail: row.clientEmail,
    clientPhone: row.clientPhone,
    clientAddress: row.clientAddress,
    paymentMethod: row.paymentMethod,
    paymentReference: row.paymentReference,
    payerName: row.payerName,
    notes: row.notes,
    userId: row.userId,
    registeredByUserId: row.registeredByUserId,
    registeredByEmail: row.registeredBy?.email ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function buildName(firstName?: string | null, lastName?: string | null, fallback?: string) {
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  return name || fallback || "";
}

function lookupFromDelivery(d: {
  userId: string | null;
  idDocumentNumber: string;
  clientName: string;
  email: string;
  phone: string | null;
  address: string | null;
}): ClientPaymentLookup {
  return {
    userId: d.userId,
    idDocumentNumber: normalizeIdDocumentNumber(d.idDocumentNumber),
    idDocumentType: "CC",
    clientName: d.clientName,
    email: d.email,
    phone: d.phone,
    address: d.address,
    source: "delivery",
  };
}

export async function resolveClientByIdDocument(idDocumentNumber: string): Promise<{
  userId: string | null;
  clientName: string | null;
  clientEmail: string | null;
  clientPhone: string | null;
  clientAddress: string | null;
  idDocumentType: string;
}> {
  const normalized = normalizeIdDocumentNumber(idDocumentNumber);
  if (!normalized) {
    return {
      userId: null,
      clientName: null,
      clientEmail: null,
      clientPhone: null,
      clientAddress: null,
      idDocumentType: "CC",
    };
  }

  const full = await lookupClientPaymentProfile(normalized);
  if (full) {
    return {
      userId: full.userId,
      clientName: full.clientName,
      clientEmail: full.email,
      clientPhone: full.phone,
      clientAddress: full.address,
      idDocumentType: full.idDocumentType,
    };
  }

  return {
    userId: null,
    clientName: null,
    clientEmail: null,
    clientPhone: null,
    clientAddress: null,
    idDocumentType: "CC",
  };
}

export async function lookupClientPaymentProfile(
  idDocumentNumber: string,
): Promise<ClientPaymentLookup | null> {
  const normalized = normalizeIdDocumentNumber(idDocumentNumber);
  if (!normalized || normalized.length < 5) return null;

  const delivery = await prisma.vehicleDelivery.findFirst({
    where: {
      OR: [{ idDocumentNumber: normalized }, { idDocumentNumber: { contains: normalized } }],
    },
    orderBy: { createdAt: "desc" },
  });
  if (delivery) {
    return lookupFromDelivery(delivery);
  }

  const identity = await prisma.userIdentityExtraction.findFirst({
    where: {
      OR: [{ idDocumentNumber: normalized }, { idDocumentNumber: { contains: normalized } }],
    },
    include: {
      user: {
        include: {
          identityExtraction: true,
          workAddressExtraction: true,
        },
      },
    },
  });
  if (identity?.user) {
    const u = identity.user;
    const name = buildName(identity.firstName, identity.lastName, u.email.split("@")[0]);
    return {
      userId: u.id,
      idDocumentNumber: normalized,
      idDocumentType: "CC",
      clientName: name,
      email: u.email,
      phone: u.phone,
      address: u.workAddressExtraction?.utilityServiceAddress ?? null,
      source: "user",
    };
  }

  return null;
}

export async function searchClientsForPayment(query: string, limit = 10): Promise<ClientPaymentLookup[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const normalizedDoc = normalizeIdDocumentNumber(trimmed);
  const byDoc = new Map<string, ClientPaymentLookup>();

  if (normalizedDoc.length >= 3) {
    const deliveries = await prisma.vehicleDelivery.findMany({
      where: {
        OR: [{ idDocumentNumber: normalizedDoc }, { idDocumentNumber: { contains: normalizedDoc } }],
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    for (const d of deliveries) {
      const row = lookupFromDelivery(d);
      byDoc.set(row.idDocumentNumber, row);
    }

    const identities = await prisma.userIdentityExtraction.findMany({
      where: {
        OR: [{ idDocumentNumber: normalizedDoc }, { idDocumentNumber: { contains: normalizedDoc } }],
      },
      include: {
        user: { include: { workAddressExtraction: true } },
      },
      take: limit,
    });
    for (const id of identities) {
      const doc = normalizeIdDocumentNumber(id.idDocumentNumber ?? "");
      if (!doc) continue;
      if (byDoc.has(doc)) continue;
      const u = id.user;
      byDoc.set(doc, {
        userId: u.id,
        idDocumentNumber: doc,
        idDocumentType: "CC",
        clientName: buildName(id.firstName, id.lastName, u.email.split("@")[0]),
        email: u.email,
        phone: u.phone,
        address: u.workAddressExtraction?.utilityServiceAddress ?? null,
        source: "user",
      });
    }
  }

  if (byDoc.size >= limit) {
    return [...byDoc.values()].slice(0, limit);
  }

  const deliveriesByName = await prisma.vehicleDelivery.findMany({
    where: { clientName: { contains: trimmed, mode: "insensitive" } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  for (const d of deliveriesByName) {
    const row = lookupFromDelivery(d);
    if (!byDoc.has(row.idDocumentNumber)) byDoc.set(row.idDocumentNumber, row);
  }

  if (byDoc.size >= limit) {
    return [...byDoc.values()].slice(0, limit);
  }

  const identitiesByName = await prisma.userIdentityExtraction.findMany({
    where: {
      OR: [
        { firstName: { contains: trimmed, mode: "insensitive" } },
        { lastName: { contains: trimmed, mode: "insensitive" } },
      ],
    },
    include: {
      user: { include: { workAddressExtraction: true } },
    },
    take: limit,
  });
  for (const id of identitiesByName) {
    const doc = normalizeIdDocumentNumber(id.idDocumentNumber ?? "");
    if (!doc || byDoc.has(doc)) continue;
    const u = id.user;
    byDoc.set(doc, {
      userId: u.id,
      idDocumentNumber: doc,
      idDocumentType: "CC",
      clientName: buildName(id.firstName, id.lastName, u.email.split("@")[0]),
      email: u.email,
      phone: u.phone,
      address: u.workAddressExtraction?.utilityServiceAddress ?? null,
      source: "user",
    });
  }

  return [...byDoc.values()].slice(0, limit);
}
