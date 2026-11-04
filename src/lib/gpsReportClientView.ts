import type { ClientGpsReportDto } from "./gpsReportDto.js";

/** Máximo razonable de km recorridos en un informe (p. ej. mensual de flota). */
const MAX_PERIOD_KM = 8_000;
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

export type ClientGpsUsageSummary = {
  /** Km recorridos en el periodo del informe (longitud de ruta). */
  routeKm: number | null;
  maxSpeedKmh: number | null;
  avgSpeedKmh: number | null;
  /** Odómetro al cierre del periodo (km totales del vehículo). */
  vehicleOdometerKm: number | null;
  /** Campo «Odómetro total» del informe (según proveedor, suele coincidir con km del periodo). */
  odometerTotalKm: number | null;
  movementDuration: string | null;
  parkedDuration: string | null;
  engineHours: string | null;
};

export type ClientGpsReportViewDto = ClientGpsReportDto & {
  hasGpsLocation: boolean;
  summaryTitle: string;
  clientHighlights: Array<{ label: string; value: string }>;
  usageSummary: ClientGpsUsageSummary;
};

function highlightValue(highlights: Array<{ label: string; value: string }>, ...labelNeedles: string[]): string | null {
  for (const row of highlights) {
    const key = normalizeLabel(row.label);
    if (labelNeedles.some((n) => key.includes(n))) return row.value?.trim() || null;
  }
  return null;
}

function parseKmFromText(value: string | null): number | null {
  if (!value) return null;
  const m = value.match(/([\d]+(?:[.,]\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]!.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function parseOdometerFromHighlight(value: string | null): number | null {
  return sanitizeOdometerKm(parseKmFromText(value));
}

function buildUsageSummary(dto: ClientGpsReportDto, sanitized: ClientGpsReportDto): ClientGpsUsageSummary {
  const all = [...sanitized.highlights, ...dto.highlights];
  const movementDuration = highlightValue(all, "tiempo en movimiento", "duracion de movimiento");
  const parkedDuration = highlightValue(all, "tiempo estacionado", "duracion de estacionado");
  const engineHours = highlightValue(all, "horas del motor");
  const vehicleOdometerKm =
    parseOdometerFromHighlight(highlightValue(all, "kilometraje del vehiculo", "odometro fin")) ??
    null;

  let routeKm = sanitized.totalDistanceKm;
  if (routeKm == null) {
    routeKm = sanitizeKm(parseKmFromText(highlightValue(all, "longitud de ruta", "longitud ruta")));
  }

  let maxSpeedKmh = sanitized.maxSpeedKmh;
  if (maxSpeedKmh == null) {
    maxSpeedKmh = sanitizeSpeed(parseKmFromText(highlightValue(all, "velocidad maxima", "vel maxima")));
  }
  let avgSpeedKmh = sanitized.avgSpeedKmh;
  if (avgSpeedKmh == null) {
    avgSpeedKmh = sanitizeSpeed(
      parseKmFromText(highlightValue(all, "velocidad media", "vel media", "velocidad promedio")),
    );
  }

  const odometerTotalKm = sanitizeKm(parseKmFromText(highlightValue(all, "odometro total")));

  return {
    routeKm,
    maxSpeedKmh,
    avgSpeedKmh,
    vehicleOdometerKm,
    odometerTotalKm,
    movementDuration,
    parkedDuration,
    engineHours,
  };
}

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

  const usageSummary = buildUsageSummary(dto, sanitized);

  let clientHighlights = pickClientHighlights(sanitized.highlights).filter((h) => {
    const key = normalizeLabel(h.label);
    if (key.includes("registros en archivo") || key.includes("fuente") || key.includes("evento:")) return false;
    if (key.includes("distancia estimada")) return false;
    if (usageSummary.routeKm != null && (key.includes("distanc") || key.includes("longitud"))) return false;
    if (usageSummary.maxSpeedKmh != null && key.includes("veloc") && key.includes("max")) return false;
    if (usageSummary.avgSpeedKmh != null && key.includes("veloc") && (key.includes("media") || key.includes("prom"))) {
      return false;
    }
    if (usageSummary.vehicleOdometerKm != null && key.includes("kilometraje del vehiculo")) return false;
    if (usageSummary.odometerTotalKm != null && key.includes("odometro total")) return false;
    if (key.includes("informe recibido")) return false;
    if (usageSummary.movementDuration && key.includes("movimiento")) return false;
    if (usageSummary.parkedDuration && key.includes("estacionado")) return false;
    if (usageSummary.engineHours && key.includes("horas del motor")) return false;
    return true;
  });

  const summaryTitle = hasGpsLocation ? "Rastreo GPS" : "Uso del vehículo (informe)";

  return {
    ...sanitized,
    hasGpsLocation,
    summaryTitle,
    clientHighlights,
    usageSummary,
  };
}

export function sanitizeOdometerKm(value: number | null): number | null {
  if (value == null || !Number.isFinite(value) || value < 0 || value > MAX_ODOMETER_KM) return null;
  return Math.round(value);
}
