/** Ranuras de plataforma en el paso 3 (cada una puede ser una app distinta). */
export const PLATFORM_UI_SLOTS = [1, 2, 3] as const;
export type PlatformUiSlot = (typeof PLATFORM_UI_SLOTS)[number];

/** Máximo de capturas (foto/PDF por archivo) numeradas por plataforma. */
export const MAX_PLATFORM_PHOTO_INDEX_PER_SLOT = 40;

/** PDF único que puede documentar varias apps a la vez. */
export const PLATFORM_MOBILITY_MULTI_APP_PDF = "platformMobilityMultiAppPdf";

const PLATFORM_PHOTO_KIND = /^platformWork([1-3])(?:Photo(\d+))?$/;
const PLATFORM_VIDEO_KIND = /^platformWork([1-3])Video$/;
const PLATFORM_PDF_KIND = /^platformWork([1-3])Pdf$/;

export function photoKindForSlotIndex(slot: PlatformUiSlot, index: number): string {
  if (index < 1 || index > MAX_PLATFORM_PHOTO_INDEX_PER_SLOT) {
    throw new Error("Índice de captura fuera de rango");
  }
  if (index === 1) return `platformWork${slot}`;
  return `platformWork${slot}Photo${index}`;
}

export function videoKindForSlot(slot: PlatformUiSlot): string {
  return `platformWork${slot}Video`;
}

export function pdfKindForSlot(slot: PlatformUiSlot): string {
  return `platformWork${slot}Pdf`;
}

/** Tipos fijos (no numerados dinámicamente) para registro en DOCUMENT_KINDS. */
export function fixedPlatformDocumentKinds(): string[] {
  const kinds: string[] = ["platformWork4", PLATFORM_MOBILITY_MULTI_APP_PDF];
  for (const slot of PLATFORM_UI_SLOTS) {
    kinds.push(photoKindForSlotIndex(slot, 1), videoKindForSlot(slot), pdfKindForSlot(slot));
  }
  return kinds;
}

/** Valida kinds dinámicos platformWork{N}Photo{k} con k >= 2. */
export function isDynamicPlatformPhotoKind(value: string): boolean {
  const m = value.match(/^platformWork([1-3])Photo(\d+)$/);
  if (!m) return false;
  const idx = Number(m[2]);
  return idx >= 2 && idx <= MAX_PLATFORM_PHOTO_INDEX_PER_SLOT;
}

export function parsePlatformPhotoKind(
  kind: string,
): { slot: PlatformUiSlot; photoIndex: number; media: "photo" | "video" | "pdf" } | null {
  if (kind === PLATFORM_MOBILITY_MULTI_APP_PDF) {
    return null;
  }

  const video = kind.match(PLATFORM_VIDEO_KIND);
  if (video) {
    return { slot: Number(video[1]) as PlatformUiSlot, photoIndex: 0, media: "video" };
  }

  const pdf = kind.match(PLATFORM_PDF_KIND);
  if (pdf) {
    return { slot: Number(pdf[1]) as PlatformUiSlot, photoIndex: 0, media: "pdf" };
  }

  const photo = kind.match(PLATFORM_PHOTO_KIND);
  if (photo) {
    const slot = Number(photo[1]) as PlatformUiSlot;
    const photoIndex = photo[2] ? Number(photo[2]) : 1;
    if (photoIndex < 1 || photoIndex > MAX_PLATFORM_PHOTO_INDEX_PER_SLOT) return null;
    return { slot, photoIndex, media: "photo" };
  }

  if (kind === "platformWork4") {
    return { slot: 3, photoIndex: 1, media: "photo" };
  }

  return null;
}

export function isPlatformMobilityMultiAppPdfKind(value: string): boolean {
  return value === PLATFORM_MOBILITY_MULTI_APP_PDF;
}

export function isPlatformWorkDocumentKind(value: string): boolean {
  if (value === "platformWork4") return true;
  if (isPlatformMobilityMultiAppPdfKind(value)) return true;
  if (isDynamicPlatformPhotoKind(value)) return true;
  return parsePlatformPhotoKind(value) !== null;
}

export function slotKeyFromDocumentKind(documentKind: string): PlatformUiSlot | null {
  const parsed = parsePlatformPhotoKind(documentKind);
  return parsed?.slot ?? null;
}

export function slotHasAnyAttachmentInPhotos(
  photos: Record<string, unknown>,
  slot: PlatformUiSlot,
): boolean {
  return Object.keys(photos).some((kind) => parsePlatformPhotoKind(kind)?.slot === slot);
}
