import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { isPlatformWorkDocumentKind } from "./workAddressDocumentKinds.js";

const PLATFORM_SLOTS = ["platformWork1", "platformWork2", "platformWork3", "platformWork4"] as const;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Quita metadatos de una ranura de app o campos derivados al borrar ese documento. */
export async function pruneWorkAddressExtractionAfterDocumentDelete(
  userId: string,
  documentKind: string,
): Promise<void> {
  const row = await prisma.userWorkAddressExtraction.findUnique({ where: { userId } });
  if (!row) return;

  if (documentKind === "utilityAddressReceipt") {
    await prisma.userWorkAddressExtraction.update({
      where: { userId },
      data: { utilityServiceAddress: null },
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
    const meta = row.platformCapturesMeta;
    if (!isRecord(meta)) return;
    const next: Record<string, unknown> = { ...meta };
    delete next[documentKind];
    await prisma.userWorkAddressExtraction.update({
      where: { userId },
      data: {
        platformCapturesMeta:
          Object.keys(next).length > 0 ? (next as Prisma.InputJsonValue) : Prisma.DbNull,
      },
    });
  }
}

export type PlatformCaptureMetaEntry = { appKey: string; rating: number };

export function collectForbiddenAppKeys(
  meta: unknown,
  exceptSlot: string,
): string[] {
  if (!isRecord(meta)) return [];
  const keys: string[] = [];
  for (const slot of PLATFORM_SLOTS) {
    if (slot === exceptSlot) continue;
    const entry = meta[slot];
    if (!isRecord(entry)) continue;
    const appKey = typeof entry.appKey === "string" ? entry.appKey.trim().toLowerCase() : "";
    if (appKey && appKey !== "unknown") keys.push(appKey);
  }
  return keys;
}

export function mergePlatformMeta(
  previous: unknown,
  slot: string,
  entry: PlatformCaptureMetaEntry,
): Prisma.InputJsonValue {
  const base = isRecord(previous) ? { ...previous } : {};
  base[slot] = { appKey: entry.appKey.trim().toLowerCase(), rating: entry.rating };
  return base as Prisma.InputJsonValue;
}
