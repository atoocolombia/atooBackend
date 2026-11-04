/** Ranuras de plataforma en el paso 3 (cada una puede ser una app distinta). */
export const PLATFORM_UI_SLOTS = [1, 2, 3] as const;
export type PlatformUiSlot = (typeof PLATFORM_UI_SLOTS)[number];

export const PHOTOS_PER_PLATFORM_SLOT = 4;

/** Todos los `documentKind` de capturas de apps (incluye platformWork4 legacy). */
export function allPlatformPhotoDocumentKinds(): string[] {
  const kinds: string[] = ["platformWork4"];
  for (const slot of PLATFORM_UI_SLOTS) {
    kinds.push(...platformPhotoKindsForSlot(slot));
  }
  return kinds;
}

export function platformPhotoKindsForSlot(slot: PlatformUiSlot): string[] {
  const kinds = [`platformWork${slot}`];
  for (let i = 2; i <= PHOTOS_PER_PLATFORM_SLOT; i++) {
    kinds.push(`platformWork${slot}Photo${i}`);
  }
  return kinds;
}

export function parsePlatformPhotoKind(
  kind: string,
): { slot: PlatformUiSlot; photoIndex: number } | null {
  const extra = kind.match(/^platformWork([1-3])Photo([2-4])$/);
  if (extra) {
    return {
      slot: Number(extra[1]) as PlatformUiSlot,
      photoIndex: Number(extra[2]),
    };
  }
  const base = kind.match(/^platformWork([1-4])$/);
  if (base) {
    const slotNum = Number(base[1]);
    if (slotNum >= 1 && slotNum <= 3) {
      return { slot: slotNum as PlatformUiSlot, photoIndex: 1 };
    }
    if (slotNum === 4) {
      return { slot: 3, photoIndex: 1 };
    }
  }
  return null;
}

export function isPlatformWorkDocumentKind(value: string): boolean {
  if (value === "platformWork4") return true;
  return parsePlatformPhotoKind(value) !== null;
}

export function slotKeyFromDocumentKind(documentKind: string): PlatformUiSlot | null {
  const parsed = parsePlatformPhotoKind(documentKind);
  return parsed?.slot ?? null;
}
