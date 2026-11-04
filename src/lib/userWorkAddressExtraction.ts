import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import {
  aggregatePlatformSlot,
  normalizePlatformCapturesMeta,
  type PlatformPhotoMetaEntry,
} from "./platformSlotAggregate.js";
import {
  isPlatformMobilityMultiAppPdfKind,
  isPlatformWorkDocumentKind,
  PLATFORM_MOBILITY_MULTI_APP_PDF,
  PLATFORM_UI_SLOTS,
  slotKeyFromDocumentKind,
  type PlatformUiSlot,
} from "./platformWorkPhotoKinds.js";

export type PlatformCaptureMetaEntry = PlatformPhotoMetaEntry;

function rebuildPlatformCapturesJson(
  photos: Record<string, PlatformPhotoMetaEntry>,
  multiAppBySlot: Partial<Record<PlatformUiSlot, PlatformPhotoMetaEntry>>,
): Prisma.InputJsonValue {
  const slots: Record<string, ReturnType<typeof aggregatePlatformSlot>> = {};
  for (const slot of PLATFORM_UI_SLOTS) {
    slots[String(slot)] = aggregatePlatformSlot(photos, slot, multiAppBySlot);
  }
  const bySlot: Record<string, PlatformPhotoMetaEntry> = {};
  for (const slot of PLATFORM_UI_SLOTS) {
    if (multiAppBySlot[slot]) bySlot[String(slot)] = multiAppBySlot[slot]!;
  }
  return {
    photos: nextPhotosShape(photos),
    multiAppPdf: Object.keys(bySlot).length > 0 ? { bySlot } : undefined,
    slots,
  } as Prisma.InputJsonValue;
}

function nextPhotosShape(photos: Record<string, PlatformPhotoMetaEntry>): Record<string, PlatformPhotoMetaEntry> {
  return { ...photos };
}

function serializePhotoEntry(entry: PlatformPhotoMetaEntry): PlatformPhotoMetaEntry {
  return {
    appKey: entry.appKey.trim().toLowerCase(),
    rating: entry.rating,
    yearsExperience: entry.yearsExperience ?? null,
    drivenComfortOrBlack: entry.drivenComfortOrBlack,
    comfortOrBlackNotApplicable: entry.comfortOrBlackNotApplicable,
    comfortOrBlackTierText: entry.comfortOrBlackTierText ?? null,
    electricVehicleIndicated: entry.electricVehicleIndicated,
    nameMatchesCedula: entry.nameMatchesCedula,
  };
}

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

  if (documentKind === PLATFORM_MOBILITY_MULTI_APP_PDF) {
    const { photos, multiAppBySlot } = normalizePlatformCapturesMeta(row.platformCapturesMeta);
    if (Object.keys(multiAppBySlot).length === 0) return;
    const payload = rebuildPlatformCapturesJson(photos, {});
    await prisma.userWorkAddressExtraction.update({
      where: { userId },
      data: {
        platformCapturesMeta:
          Object.keys(photos).length > 0 ? payload : Prisma.DbNull,
      },
    });
    return;
  }

  if (isPlatformWorkDocumentKind(documentKind)) {
    const { photos, multiAppBySlot } = normalizePlatformCapturesMeta(row.platformCapturesMeta);
    if (!photos[documentKind]) return;
    const nextPhotos = { ...photos };
    delete nextPhotos[documentKind];
    const payload = rebuildPlatformCapturesJson(nextPhotos, multiAppBySlot);
    await prisma.userWorkAddressExtraction.update({
      where: { userId },
      data: {
        platformCapturesMeta:
          Object.keys(nextPhotos).length > 0 || Object.keys(multiAppBySlot).length > 0
            ? payload
            : Prisma.DbNull,
      },
    });
  }
}

/** Apps ya identificadas en otras ranuras (no en la misma plataforma). */
export function collectForbiddenAppKeys(meta: unknown, exceptDocumentKind: string): string[] {
  const exceptSlot = slotKeyFromDocumentKind(exceptDocumentKind);
  const { photos, multiAppBySlot } = normalizePlatformCapturesMeta(meta);
  const keys: string[] = [];
  for (const slot of PLATFORM_UI_SLOTS) {
    if (exceptSlot != null && slot === exceptSlot) continue;
    const agg = aggregatePlatformSlot(photos, slot, multiAppBySlot);
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
  const { photos, multiAppBySlot } = normalizePlatformCapturesMeta(previous);
  const nextPhotos = { ...photos };
  nextPhotos[documentKind] = serializePhotoEntry(entry);
  return rebuildPlatformCapturesJson(nextPhotos, multiAppBySlot);
}

export function mergePlatformMultiAppPdfMeta(
  previous: unknown,
  bySlot: Partial<Record<PlatformUiSlot, PlatformPhotoMetaEntry>>,
): Prisma.InputJsonValue {
  const { photos } = normalizePlatformCapturesMeta(previous);
  const nextMulti: Partial<Record<PlatformUiSlot, PlatformPhotoMetaEntry>> = {};
  for (const slot of PLATFORM_UI_SLOTS) {
    if (bySlot[slot]) nextMulti[slot] = serializePhotoEntry(bySlot[slot]!);
  }
  return rebuildPlatformCapturesJson(photos, nextMulti);
}

/** @deprecated use mergePlatformPhotoMeta */
export function mergePlatformMeta(
  previous: unknown,
  slot: string,
  entry: PlatformCaptureMetaEntry,
): Prisma.InputJsonValue {
  return mergePlatformPhotoMeta(previous, slot, entry);
}

export { isPlatformMobilityMultiAppPdfKind };
