import type { ClientGpsReportDto } from "./gpsReportDto.js";

/** Máximo razonable de km recorridos en un informe semanal/mensual. */
const MAX_PERIOD_KM = 2_500;
const MAX_SPEED_KMH = 250;
const MAX_ODOMETER_KM = 600_000;

export function sanitizeKm(value: number | null | undefined, max = MAX_PERIOD_KM): number | null {
  if (value == null || !Number.isFinite(value) || value < 0 || value > max) return null;
  return Math.round(value * 10) / 10;
}

export function sanitizeSpeed(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value < 0 || value > MAX_SPEED_KMH) return null;
  return Math.round(value);
}

export function isValidGpsCoordinate(lat: number | null, lng: number | null): boolean {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  // Colombia aprox.; evita coordenadas basura del PDF
  return lat >= -5 && lat <= 16 && lng >= -82 && lng <= -66;
}

function isReadableLocation(text: string | null): boolean {
  if (!text?.trim()) return false;
  const t = text.trim();
  if (t.length > 180) return false;
  if (/^\d[\d.\s,]+$/.test(t)) return false;
  return /[A-Za-zÁÉÍÓÚáéíóú]/.test(t);
}

const CLIENT_HIGHLIGHT_LABELS = new Set([
  "nivel de carga",
  "soc",
  "autonomia restante",
  "autonomía restante",
  "kilometraje actual",
  "odometro",
  "odómetro",
  "consumo",
  "estado de carga",
  "alertas",
  "testigos",
  "distancia estimada",
  "distancia",
  "velocidad maxima",
  "velocidad máxima",
  "velocidad promedio",
  "registros en archivo",
  "fuente",
]);

function normalizeLabel(label: string): string {
  return label
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLowerCase();
}

function pickClientHighlights(
  highlights: Array<{ label: string; value: string }>,
): Array<{ label: string; value: string }> {
  const out: Array<{ label: string; value: string }> = [];
  for (const row of highlights) {
    const key = normalizeLabel(row.label);
    const allowed =
      CLIENT_HIGHLIGHT_LABELS.has(key) ||
      key.includes("autonom") ||
      key.includes("bater") ||
      key.includes("carga") ||
      key.includes("km") ||
      key.includes("veloc");
    if (!allowed) continue;
    if (!row.value?.trim()) continue;
    if (/^\d{12,}$/.test(row.value.replace(/\D/g, ""))) continue;
    out.push(row);
    if (out.length >= 8) break;
  }
  return out;
}

export type ClientGpsReportViewDto = ClientGpsReportDto & {
  hasGpsLocation: boolean;
  summaryTitle: string;
  clientHighlights: Array<{ label: string; value: string }>;
};

export function toClientGpsReportView(dto: ClientGpsReportDto): ClientGpsReportViewDto {
  const hasGpsLocation = isValidGpsCoordinate(dto.lastLatitude, dto.lastLongitude);
  const totalDistanceKm = sanitizeKm(dto.totalDistanceKm);
  const maxSpeedKmh = sanitizeSpeed(dto.maxSpeedKmh);
  const avgSpeedKmh = sanitizeSpeed(dto.avgSpeedKmh);

  let lastLocation = isReadableLocation(dto.lastLocation) ? dto.lastLocation : null;
  if (!hasGpsLocation) {
    lastLocation = null;
  }

  const sanitized: ClientGpsReportDto = {
    ...dto,
    totalDistanceKm,
    maxSpeedKmh,
    avgSpeedKmh,
    lastLocation,
    lastLatitude: hasGpsLocation ? dto.lastLatitude : null,
    lastLongitude: hasGpsLocation ? dto.lastLongitude : null,
    samplePoints: hasGpsLocation ? dto.samplePoints : [],
  };

  let clientHighlights = pickClientHighlights(sanitized.highlights);

  if (totalDistanceKm != null && !clientHighlights.some((h) => normalizeLabel(h.label).includes("distanc"))) {
    clientHighlights.unshift({ label: "Distancia del periodo", value: `${totalDistanceKm} km` });
  }
  if (maxSpeedKmh != null && !clientHighlights.some((h) => h.label.toLowerCase().includes("max"))) {
    clientHighlights.push({ label: "Velocidad máxima", value: `${maxSpeedKmh} km/h` });
  }

  const summaryTitle = hasGpsLocation ? "Rastreo GPS" : "Resumen de telemetría";

  if (clientHighlights.length === 0 && !totalDistanceKm && !hasGpsLocation) {
    clientHighlights = [
      {
        label: "Informe recibido",
        value: "atoO procesó el archivo; no hay ubicación GPS en este informe.",
      },
    ];
  }

  return {
    ...sanitized,
    hasGpsLocation,
    summaryTitle,
    clientHighlights,
  };
}

export function sanitizeOdometerKm(value: number | null): number | null {
  if (value == null || !Number.isFinite(value) || value < 0 || value > MAX_ODOMETER_KM) return null;
  return Math.round(value);
}
