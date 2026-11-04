import type { PlatformCaptureExtraction } from "./verifyWorkAddressDocuments.js";
import {
  PLATFORM_UI_SLOTS,
  platformPhotoKindsForSlot,
  type PlatformUiSlot,
} from "./platformWorkPhotoKinds.js";

export type PlatformPhotoMetaEntry = PlatformCaptureExtraction & {
  comfortOrBlackTierText?: string | null;
};

export type PlatformSlotAggregate = {
  appKey: string;
  nameMatchesCedula: boolean;
  rating: number | null;
  yearsExperience: string | null;
  drivenComfortOrBlack: boolean;
  comfortOrBlackNotApplicable: boolean;
  /** Texto leído (Comfort, Black, Premium, etc.) cuando aparece en alguna captura. */
  comfortOrBlackTierText: string | null;
  electricVehicleIndicated: boolean;
};

export type PlatformSlotStatus = {
  complete: boolean;
  missing: string[];
  aggregate: PlatformSlotAggregate | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function readPhotoEntry(raw: unknown): PlatformPhotoMetaEntry | null {
  if (!isRecord(raw)) return null;
  const appKey = typeof raw.appKey === "string" ? raw.appKey : "unknown";
  const rating =
    typeof raw.rating === "number" && Number.isFinite(raw.rating) ? raw.rating : null;
  return {
    appKey,
    rating,
    yearsExperience: typeof raw.yearsExperience === "string" ? raw.yearsExperience : null,
    drivenComfortOrBlack: raw.drivenComfortOrBlack === true,
    comfortOrBlackNotApplicable: raw.comfortOrBlackNotApplicable === true,
    comfortOrBlackTierText:
      typeof raw.comfortOrBlackTierText === "string" && raw.comfortOrBlackTierText.trim()
        ? raw.comfortOrBlackTierText.trim()
        : null,
    electricVehicleIndicated: raw.electricVehicleIndicated === true,
    nameMatchesCedula: raw.nameMatchesCedula === true,
  };
}

/** Normaliza meta antigua (plano por kind) o nueva ({ photos, slots }). */
export function normalizePlatformCapturesMeta(meta: unknown): {
  photos: Record<string, PlatformPhotoMetaEntry>;
} {
  if (!isRecord(meta)) {
    return { photos: {} };
  }
  if (isRecord(meta.photos)) {
    const photos: Record<string, PlatformPhotoMetaEntry> = {};
    for (const [k, v] of Object.entries(meta.photos)) {
      const entry = readPhotoEntry(v);
      if (entry) photos[k] = entry;
    }
    return { photos };
  }
  const photos: Record<string, PlatformPhotoMetaEntry> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (k === "slots") continue;
    const entry = readPhotoEntry(v);
    if (entry) photos[k] = entry;
  }
  return { photos };
}

export function aggregatePlatformSlot(
  photos: Record<string, PlatformPhotoMetaEntry>,
  slot: PlatformUiSlot,
): PlatformSlotAggregate {
  const kinds = platformPhotoKindsForSlot(slot);
  const entries = kinds.map((k) => photos[k]).filter(Boolean) as PlatformPhotoMetaEntry[];

  let appKey = "unknown";
  for (const e of entries) {
    const k = e.appKey?.trim().toLowerCase();
    if (k && k !== "unknown") {
      appKey = k;
      break;
    }
  }

  let rating: number | null = null;
  for (const e of entries) {
    if (e.rating != null && e.rating > 4) {
      rating = e.rating;
      break;
    }
    if (e.rating != null && (rating == null || e.rating > rating)) {
      rating = e.rating;
    }
  }

  let yearsExperience: string | null = null;
  for (const e of entries) {
    if (e.yearsExperience?.trim()) {
      yearsExperience = e.yearsExperience.trim();
      break;
    }
  }

  const nameMatchesCedula = entries.some((e) => e.nameMatchesCedula);
  const drivenComfortOrBlack = entries.some((e) => e.drivenComfortOrBlack);
  const comfortOrBlackNotApplicable =
    entries.length > 0 &&
    entries.every((e) => e.comfortOrBlackNotApplicable || e.drivenComfortOrBlack);
  const electricVehicleIndicated = entries.some((e) => e.electricVehicleIndicated);

  let comfortOrBlackTierText: string | null = null;
  for (const e of entries) {
    if (e.comfortOrBlackTierText?.trim()) {
      comfortOrBlackTierText = e.comfortOrBlackTierText.trim();
      break;
    }
  }

  return {
    appKey,
    nameMatchesCedula,
    rating: rating != null && rating > 4 ? rating : null,
    yearsExperience,
    drivenComfortOrBlack,
    comfortOrBlackNotApplicable,
    comfortOrBlackTierText,
    electricVehicleIndicated,
  };
}

const MISSING_LABELS: Record<string, string> = {
  name: "nombre que coincida con tu cédula",
  rating: "calificación mayor a 4",
  years: "años o tiempo de experiencia",
  electric: "indicio de vehículo eléctrico (declaraste que sí conduces EV)",
};

export function evaluatePlatformSlot(
  aggregate: PlatformSlotAggregate,
  applicantDeclaredElectricVehicle: boolean | null,
): PlatformSlotStatus {
  const missing: string[] = [];
  if (!aggregate.nameMatchesCedula) missing.push(MISSING_LABELS.name);
  if (aggregate.rating == null) missing.push(MISSING_LABELS.rating);
  if (!aggregate.yearsExperience) missing.push(MISSING_LABELS.years);
  if (applicantDeclaredElectricVehicle === true && !aggregate.electricVehicleIndicated) {
    missing.push(MISSING_LABELS.electric);
  }
  return {
    complete: missing.length === 0,
    missing,
    aggregate,
  };
}

export function buildAllPlatformSlotStatuses(
  meta: unknown,
  applicantDeclaredElectricVehicle: boolean | null,
): Record<PlatformUiSlot, PlatformSlotStatus> {
  const { photos } = normalizePlatformCapturesMeta(meta);
  const out = {} as Record<PlatformUiSlot, PlatformSlotStatus>;
  for (const slot of PLATFORM_UI_SLOTS) {
    const aggregate = aggregatePlatformSlot(photos, slot);
    const hasAnyPhoto = platformPhotoKindsForSlot(slot).some((k) => photos[k]);
    if (!hasAnyPhoto) {
      out[slot] = { complete: false, missing: ["al menos una captura de esta plataforma"], aggregate: null };
    } else {
      out[slot] = evaluatePlatformSlot(aggregate, applicantDeclaredElectricVehicle);
    }
  }
  return out;
}
