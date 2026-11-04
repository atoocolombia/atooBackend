import { prisma } from "./prisma.js";
import { normalizeIdDocumentNumber } from "./clientPayments.js";

/** Persiste cédula del PDF de autorización en el perfil del usuario. */
export async function syncUserIdentityFromDataTreatmentPdf(
  userId: string,
  idDocumentNumber: string,
): Promise<void> {
  const normalized = normalizeIdDocumentNumber(idDocumentNumber);
  if (normalized.length < 5) return;

  await prisma.userIdentityExtraction.upsert({
    where: { userId },
    create: {
      userId,
      idDocumentNumber: normalized,
    },
    update: {
      idDocumentNumber: normalized,
    },
  });
}
