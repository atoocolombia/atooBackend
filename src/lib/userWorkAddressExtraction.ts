import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import {
  aggregatePlatformSlot,
  normalizePlatformCapturesMeta,
  type PlatformPhotoMetaEntry,
} from "./platformSlotAggregate.js";
import {
  isPlatformWorkDocumentKind,
  PLATFORM_UI_SLOTS,
  slotKeyFromDocumentKind,
} from "./platformWorkPhotoKinds.js";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export type PlatformCaptureMetaEntry = PlatformPhotoMetaEntry;

/** Quita metadatos de una foto o campos derivados al borrar ese documento. */
export async function pruneWorkAddressExtractionAfterDocumentDelete(
  userId: string,
  documentKind: string,
): Promise<void> {
  const row = await prisma.userWorkAddressExtraction.findUnique({ where: { userId } });
  if (!row) return;

  if (documentKind === "utilityAddressReceipt") {
    await prisma.userWorkAddressExtraction.update({
      where: { userId },
      data: {
        utilityServiceAddress: null,
        utilityDwellingType: null,
        utilityAddressComplement: null,
        utilityBillHolderMatchesApplicant: null,
      },
    });
    return;
  }

  if (documentKind === "bankDocument") {
    await prisma.userWorkAddressExtraction.update({
      where: { userId },
      data: { bankHolderMatchesIdentity: null },
    });
    return;
  }

  if (isPlatformWorkDocumentKind(documentKind)) {
    const { photos } = normalizePlatformCapturesMeta(row.platformCapturesMeta);
    if (!photos[documentKind]) return;
    const nextPhotos = { ...photos };
    delete nextPhotos[documentKind];
    await prisma.userWorkAddressExtraction.update({
      where: { userId },
      data: {
        platformCapturesMeta:
          Object.keys(nextPhotos).length > 0
            ? ({ photos: nextPhotos } as Prisma.InputJsonValue)
            : Prisma.DbNull,
      },
    });
  }
}

/** Apps ya identificadas en otras ranuras (no en la misma plataforma). */
export function collectForbiddenAppKeys(meta: unknown, exceptDocumentKind: string): string[] {
  const exceptSlot = slotKeyFromDocumentKind(exceptDocumentKind);
  if (!exceptSlot) return [];

  const { photos } = normalizePlatformCapturesMeta(meta);
  const keys: string[] = [];
  for (const slot of PLATFORM_UI_SLOTS) {
    if (slot === exceptSlot) continue;
    const agg = aggregatePlatformSlot(photos, slot);
    const appKey = agg.appKey?.trim().toLowerCase();
    if (appKey && appKey !== "unknown") keys.push(appKey);
  }
  return keys;
}

export function mergePlatformPhotoMeta(
  previous: unknown,
  documentKind: string,
  entry: PlatformPhotoMetaEntry,
): Prisma.InputJsonValue {
  const { photos } = normalizePlatformCapturesMeta(previous);
  const nextPhotos = { ...photos };
  nextPhotos[documentKind] = {
    appKey: entry.appKey.trim().toLowerCase(),
    rating: entry.rating,
    yearsExperience: entry.yearsExperience ?? null,
    drivenComfortOrBlack: entry.drivenComfortOrBlack,
    comfortOrBlackNotApplicable: entry.comfortOrBlackNotApplicable,
    comfortOrBlackTierText: entry.comfortOrBlackTierText ?? null,
    electricVehicleIndicated: entry.electricVehicleIndicated,
    nameMatchesCedula: entry.nameMatchesCedula,
  };

  const slots: Record<string, ReturnType<typeof aggregatePlatformSlot>> = {};
  for (const slot of PLATFORM_UI_SLOTS) {
    slots[String(slot)] = aggregatePlatformSlot(nextPhotos, slot);
  }

  return { photos: nextPhotos, slots } as Prisma.InputJsonValue;
}

/** @deprecated use mergePlatformPhotoMeta */
export function mergePlatformMeta(
  previous: unknown,
  slot: string,
  entry: PlatformCaptureMetaEntry,
): Prisma.InputJsonValue {
  return mergePlatformPhotoMeta(previous, slot, entry);
}
