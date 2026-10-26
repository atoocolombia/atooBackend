import fs from "node:fs";
import path from "path";
import { extractPdfText } from "./extractPdfText.js";
import { sanitizeKm, sanitizeOdometerKm, sanitizeSpeed } from "./gpsReportClientView.js";

export type GpsHighlight = { label: string; value: string };

export type GpsSamplePoint = {
  at: string | null;
  latitude: number | null;
  longitude: number | null;
  location: string | null;
  speedKmh: number | null;
};

export type ParsedGpsReport = {
  plate: string | null;
  vin: string | null;
  periodFrom: Date | null;
  periodTo: Date | null;
  totalDistanceKm: number | null;
  tripPointsCount: number;
  avgSpeedKmh: number | null;
  maxSpeedKmh: number | null;
  lastLocation: string | null;
  lastLatitude: number | null;
  lastLongitude: number | null;
  lastReportAt: Date | null;
  highlights: GpsHighlight[];
  samplePoints: GpsSamplePoint[];
  warnings: string[];
};

type ColKey =
  | "date"
  | "plate"
  | "vin"
  | "lat"
  | "lng"
  | "address"
  | "speed"
  | "distance"
  | "odometer"
  | "event";

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}

function normHeader(h: string): string {
  return stripAccents(h.trim().toLowerCase()).replace(/\s+/g, " ");
}

function detectDelimiter(line: string): string {
  const counts: Array<[string, number]> = [
    [";", (line.match(/;/g) ?? []).length],
    [",", (line.match(/,/g) ?? []).length],
    ["\t", (line.match(/\t/g) ?? []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0]![1] > 0 ? counts[0]![0] : ",";
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && ch === delimiter) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const HEADER_ALIASES: Record<ColKey, string[]> = {
  date: ["fecha", "fecha hora", "datetime", "date time", "timestamp", "hora", "fecha/hora"],
  plate: ["placa", "matricula", "plate", "patente"],
  vin: ["vin", "chasis", "serial", "numero chasis", "no chasis"],
  lat: ["latitud", "lat", "latitude"],
  lng: ["longitud", "lon", "lng", "long", "longitude"],
  address: ["direccion", "ubicacion", "address", "location", "referencia"],
  speed: ["velocidad", "speed", "vel kmh", "velocidad kmh"],
  distance: ["distancia", "km recorrido", "kilometros", "recorrido", "distance km"],
  odometer: ["odometro", "odometro km", "kilometraje", "km total", "total km"],
  event: ["evento", "estado", "status", "ignicion", "ignition"],
};

function mapHeaderIndex(headers: string[]): Partial<Record<ColKey, number>> {
  const map: Partial<Record<ColKey, number>> = {};
  headers.forEach((raw, idx) => {
    const h = normHeader(raw);
    for (const [key, aliases] of Object.entries(HEADER_ALIASES) as Array<[ColKey, string[]]>) {
      if (map[key] != null) continue;
      if (aliases.some((a) => h === a || h.includes(a))) {
        map[key] = idx;
      }
    }
  });
  return map;
}

function parseNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  let s = raw.trim().replace(/\s/g, "");
  if (s.length > 24) return null;

  if (/,\d{1,2}$/.test(s)) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    const parts = s.split(".");
    if (parts.length > 2) {
      const last = parts[parts.length - 1] ?? "";
      if (last.length <= 2) {
        s = `${parts.slice(0, -1).join("")}.${last}`;
      } else {
        s = parts.join("");
      }
    }
    s = s.replace(",", ".");
  }

  s = s.replace(/[^\d.-]/g, "");
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  if (Math.abs(n) > 1e9) return null;
  return n;
}

function parseDate(raw: string | undefined): Date | null {
  if (!raw?.trim()) return null;
  const s = raw.trim();
  const iso = Date.parse(s);
  if (Number.isFinite(iso)) return new Date(iso);
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    let yyyy = Number(m[3]);
    if (yyyy < 100) yyyy += 2000;
    const hh = Number(m[4] ?? 0);
    const mi = Number(m[5] ?? 0);
    const ss = Number(m[6] ?? 0);
    const d = new Date(yyyy, mm - 1, dd, hh, mi, ss);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function isPdfBuffer(buf: Buffer): boolean {
  return buf.length >= 4 && buf.subarray(0, 4).toString("ascii") === "%PDF";
}

async function readReportText(
  filePath: string,
  mimeType?: string,
): Promise<{ text: string; warnings: string[] }> {
  const warnings: string[] = [];
  const buf = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();

  if (mimeType === "application/pdf" || ext === ".pdf" || isPdfBuffer(buf)) {
    try {
      const text = await extractPdfText(buf);
      if (!text.trim()) {
        warnings.push(
          "El PDF no tiene texto seleccionable. Si es escaneado, pide al proveedor el informe en PDF con texto o en CSV.",
        );
      } else {
        warnings.push("Informe leído desde PDF.");
      }
      return { text, warnings };
    } catch {
      return {
        text: "",
        warnings: ["No se pudo leer el PDF. Verifica que no esté corrupto o protegido."],
      };
    }
  }

  if (buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4b) {
    warnings.push(
      "El archivo parece Excel (.xlsx). Exporta como CSV o PDF desde la plataforma GPS e intenta de nuevo.",
    );
    return { text: "", warnings };
  }
  let text = buf.toString("utf8");
  if (text.includes("\uFFFD")) {
    text = buf.toString("latin1");
    warnings.push("Se leyó el archivo con codificación Latin-1.");
  }
  return { text, warnings };
}

function extractFieldsFromProse(text: string): {
  plate: string | null;
  vin: string | null;
  totalDistanceKm: number | null;
  maxSpeedKmh: number | null;
  avgSpeedKmh: number | null;
  lastLocation: string | null;
  lastLatitude: number | null;
  lastLongitude: number | null;
  lastReportAt: Date | null;
  periodFrom: Date | null;
  periodTo: Date | null;
  telemetryHighlights: GpsHighlight[];
} {
  const norm = stripAccents(text);

  const vinMatch = norm.match(/\b([A-HJ-NPR-Z0-9]{17})\b/i);
  const plateMatch = norm.match(
    /(?:placa|matricula|plate|patente)\s*[:#]?\s*([A-Z0-9-]{5,10})/i,
  );
  const kmMatch = norm.match(
    /(?:km recorrido|distancia del periodo|distancia recorrida|recorrido del periodo)\s*[:#]?\s*([\d.,]{1,12})\s*(?:km)?/i,
  );
  const odometerMatch = norm.match(
    /(?:kilometraje actual|odometro|odómetro|kilometraje total)\s*[:#]?\s*([\d.,]{1,12})/i,
  );
  const socMatch = norm.match(
    /(?:nivel de carga|soc|estado de carga)\s*[:#]?\s*(\d{1,3})\s*%/i,
  );
  const rangeMatch = norm.match(
    /(?:autonomia restante|autonomía restante|autonomia)\s*[:#]?\s*([\d.,]{1,6})\s*km/i,
  );
  const maxSpeedMatch = norm.match(
    /(?:vel(?:ocidad)?\.?\s*max(?:ima)?|max speed)\s*[:#]?\s*([\d.,]+)/i,
  );
  const avgSpeedMatch = norm.match(
    /(?:vel(?:ocidad)?\.?\s*prom(?:edio)?|avg speed)\s*[:#]?\s*([\d.,]+)/i,
  );
  const addressMatch = norm.match(
    /(?:direccion|ubicacion|ultima ubicacion|address|location)\s*[:#]?\s*([^\n]{8,120})/i,
  );

  let lastLatitude: number | null = null;
  let lastLongitude: number | null = null;
  const coordMatches = [...norm.matchAll(/(-?\d{1,2}\.\d{4,8})\s*[,;\s]\s*(-?\d{2,3}\.\d{4,8})/g)];
  if (coordMatches.length > 0) {
    const last = coordMatches[coordMatches.length - 1]!;
    lastLatitude = parseNumber(last[1]);
    lastLongitude = parseNumber(last[2]);
  }

  const dateCandidates: Date[] = [];
  for (const m of norm.matchAll(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?/g)) {
    const d = parseDate(m[0]);
    if (d) dateCandidates.push(d);
  }
  dateCandidates.sort((a, b) => a.getTime() - b.getTime());

  const telemetryHighlights: GpsHighlight[] = [];
  if (socMatch) {
    telemetryHighlights.push({ label: "Nivel de carga", value: `${socMatch[1]} %` });
  }
  if (rangeMatch) {
    const km = sanitizeKm(parseNumber(rangeMatch[1]), 800);
    if (km != null) telemetryHighlights.push({ label: "Autonomía restante", value: `${km} km` });
  }
  if (odometerMatch) {
    const odo = sanitizeOdometerKm(parseNumber(odometerMatch[1]));
    if (odo != null) telemetryHighlights.push({ label: "Kilometraje actual", value: `${odo} km` });
  }

  return {
    plate: plateMatch?.[1]?.trim().toUpperCase() ?? null,
    vin: vinMatch?.[1]?.trim().toUpperCase() ?? null,
    totalDistanceKm: kmMatch ? sanitizeKm(parseNumber(kmMatch[1])) : null,
    maxSpeedKmh: maxSpeedMatch ? sanitizeSpeed(parseNumber(maxSpeedMatch[1])) : null,
    avgSpeedKmh: avgSpeedMatch ? sanitizeSpeed(parseNumber(avgSpeedMatch[1])) : null,
    lastLocation: addressMatch?.[1]?.trim() ?? null,
    lastLatitude,
    lastLongitude,
    lastReportAt: dateCandidates.length ? dateCandidates[dateCandidates.length - 1]! : null,
    periodFrom: dateCandidates.length ? dateCandidates[0]! : null,
    periodTo: dateCandidates.length ? dateCandidates[dateCandidates.length - 1]! : null,
    telemetryHighlights,
  };
}

function mergeProseIntoParsed(parsed: ParsedGpsReport, prose: ReturnType<typeof extractFieldsFromProse>): ParsedGpsReport {
  const mergedHighlights = [...prose.telemetryHighlights];
  for (const h of parsed.highlights) {
    if (!mergedHighlights.some((x) => x.label === h.label)) mergedHighlights.push(h);
  }
  return {
    ...parsed,
    plate: parsed.plate ?? prose.plate,
    vin: parsed.vin ?? prose.vin,
    totalDistanceKm: parsed.totalDistanceKm ?? prose.totalDistanceKm,
    maxSpeedKmh: parsed.maxSpeedKmh ?? prose.maxSpeedKmh,
    avgSpeedKmh: parsed.avgSpeedKmh ?? prose.avgSpeedKmh,
    lastLocation: parsed.lastLocation ?? prose.lastLocation,
    lastLatitude: parsed.lastLatitude ?? prose.lastLatitude,
    lastLongitude: parsed.lastLongitude ?? prose.lastLongitude,
    lastReportAt: parsed.lastReportAt ?? prose.lastReportAt,
    periodFrom: parsed.periodFrom ?? prose.periodFrom,
    periodTo: parsed.periodTo ?? prose.periodTo,
    tripPointsCount: parsed.tripPointsCount > 0 ? parsed.tripPointsCount : prose.lastReportAt ? 1 : 0,
    highlights: mergedHighlights.length ? mergedHighlights : parsed.highlights,
  };
}

function finalizeParsedReport(parsed: ParsedGpsReport): ParsedGpsReport {
  return {
    ...parsed,
    totalDistanceKm: sanitizeKm(parsed.totalDistanceKm),
    maxSpeedKmh: sanitizeSpeed(parsed.maxSpeedKmh),
    avgSpeedKmh: sanitizeSpeed(parsed.avgSpeedKmh),
    highlights: parsed.highlights.filter((h) => !/^\d{12,}$/.test(h.value.replace(/\D/g, ""))),
  };
}

function parseKeyValueLines(lines: string[]): ParsedGpsReport | null {
  const kv: Record<string, string> = {};
  for (const line of lines) {
    const m = line.match(/^([^:;=]+)\s*[:;=]\s*(.+)$/);
    if (!m) continue;
    kv[normHeader(m[1]!)] = m[2]!.trim();
  }
  if (Object.keys(kv).length < 2) return null;

  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = kv[k];
      if (v) return v;
    }
    return null;
  };

  const plate = pick("placa", "matricula", "plate");
  const vin = pick("vin", "chasis", "serial");
  const lastLocation = pick("direccion", "ubicacion", "ultima ubicacion", "address");
  const lastAt = parseDate(pick("fecha", "ultima fecha", "fecha reporte") ?? undefined);
  const totalKm = parseNumber(pick("kilometraje", "km recorrido", "distancia total", "odometro") ?? undefined);
  const maxSpeed = parseNumber(pick("velocidad maxima", "max speed", "vel max") ?? undefined);
  const avgSpeed = parseNumber(pick("velocidad promedio", "avg speed") ?? undefined);

  const highlights: GpsHighlight[] = Object.entries(kv)
    .slice(0, 12)
    .map(([k, v]) => ({ label: k, value: v }));

  return {
    plate,
    vin: vin?.toUpperCase() ?? null,
    periodFrom: lastAt,
    periodTo: lastAt,
    totalDistanceKm: totalKm,
    tripPointsCount: 0,
    avgSpeedKmh: avgSpeed,
    maxSpeedKmh: maxSpeed,
    lastLocation,
    lastLatitude: parseNumber(pick("latitud", "lat") ?? undefined),
    lastLongitude: parseNumber(pick("longitud", "lon", "lng") ?? undefined),
    lastReportAt: lastAt,
    highlights,
    samplePoints: [],
    warnings: [],
  };
}

function parseGpsReportText(text: string, warnings: string[]): ParsedGpsReport {
  if (!text.trim()) {
    return emptyParsed(warnings.length ? warnings : ["Archivo vacío o formato no legible."]);
  }

  const normalizedText = text.replace(/\r/g, "\n");
  const lines = normalizedText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const kvTry = parseKeyValueLines(lines);
  if (kvTry && (lines.length <= 80 || kvTry.plate || kvTry.vin)) {
    kvTry.warnings = [...warnings, ...kvTry.warnings];
    return finalizeParsedReport(
      mergeProseIntoParsed(kvTry, extractFieldsFromProse(normalizedText)),
    );
  }

  const delimiter = detectDelimiter(lines[0] ?? "");
  const headers = splitCsvLine(lines[0] ?? "", delimiter);
  const col = mapHeaderIndex(headers);

  if (col.date == null && col.lat == null && col.address == null) {
    warnings.push(
      "No se reconocieron columnas GPS habituales (fecha, ubicación, placa/VIN). Se guardaron datos parciales.",
    );
  }

  type Row = {
    at: Date | null;
    plate: string | null;
    vin: string | null;
    lat: number | null;
    lng: number | null;
    address: string | null;
    speed: number | null;
    distance: number | null;
    odometer: number | null;
    event: string | null;
  };

  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]!, delimiter);
    if (cells.every((c) => !c)) continue;
    const get = (key: ColKey) => {
      const idx = col[key];
      return idx != null ? cells[idx] : undefined;
    };
    rows.push({
      at: parseDate(get("date")),
      plate: get("plate")?.trim() || null,
      vin: get("vin")?.trim().toUpperCase() || null,
      lat: parseNumber(get("lat")),
      lng: parseNumber(get("lng")),
      address: get("address")?.trim() || null,
      speed: parseNumber(get("speed")),
      distance: parseNumber(get("distance")),
      odometer: parseNumber(get("odometer")),
      event: get("event")?.trim() || null,
    });
  }

  if (rows.length === 0) {
    const proseOnly = mergeProseIntoParsed(emptyParsed(warnings), extractFieldsFromProse(normalizedText));
    if (proseOnly.vin || proseOnly.plate || proseOnly.lastLocation || proseOnly.totalDistanceKm) {
      proseOnly.highlights = [
        { label: "Fuente", value: "Informe PDF / texto" },
        ...(proseOnly.totalDistanceKm != null
          ? [{ label: "Distancia", value: `${proseOnly.totalDistanceKm} km` }]
          : []),
      ];
      return finalizeParsedReport(proseOnly);
    }
    return emptyParsed([...warnings, "No se encontraron filas de datos en el archivo."]);
  }

  const dated = rows.filter((r) => r.at);
  dated.sort((a, b) => (a.at!.getTime() - b.at!.getTime()));

  const last = dated.length > 0 ? dated[dated.length - 1]! : rows[rows.length - 1]!;
  const first = dated.length > 0 ? dated[0]! : rows[0]!;

  const speeds = rows.map((r) => r.speed).filter((n): n is number => n != null && n >= 0);
  const maxSpeedKmh = speeds.length ? Math.max(...speeds) : null;
  const avgSpeedKmh = speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : null;

  let totalDistanceKm: number | null = null;
  const tripDistances = rows
    .map((r) => r.distance)
    .filter((n): n is number => n != null && n > 0 && n <= 500);
  if (tripDistances.length > 0 && tripDistances.length <= 120) {
    const sum = tripDistances.reduce((a, b) => a + b, 0);
    totalDistanceKm = sanitizeKm(sum);
  }
  if (totalDistanceKm == null) {
    const odom = rows
      .map((r) => sanitizeOdometerKm(r.odometer))
      .filter((n): n is number => n != null);
    if (odom.length >= 2) {
      totalDistanceKm = sanitizeKm(Math.max(...odom) - Math.min(...odom));
    }
  }

  const plate = rows.map((r) => r.plate).find(Boolean) ?? null;
  const vin = rows.map((r) => r.vin).find(Boolean) ?? null;

  const sampleSource = dated.length ? dated : rows;
  const samplePoints: GpsSamplePoint[] = sampleSource.slice(-30).map((r) => ({
    at: r.at?.toISOString() ?? null,
    latitude: r.lat,
    longitude: r.lng,
    location: r.address,
    speedKmh: r.speed,
  }));

  const eventCounts = new Map<string, number>();
  for (const r of rows) {
    if (!r.event) continue;
    eventCounts.set(r.event, (eventCounts.get(r.event) ?? 0) + 1);
  }

  const highlights: GpsHighlight[] = [
    { label: "Registros en archivo", value: String(rows.length) },
  ];
  if (totalDistanceKm != null) {
    highlights.push({ label: "Distancia estimada", value: `${totalDistanceKm} km` });
  }
  if (maxSpeedKmh != null) {
    highlights.push({ label: "Velocidad máxima", value: `${Math.round(maxSpeedKmh)} km/h` });
  }
  if (avgSpeedKmh != null) {
    highlights.push({ label: "Velocidad promedio", value: `${Math.round(avgSpeedKmh)} km/h` });
  }
  for (const [ev, count] of [...eventCounts.entries()].slice(0, 5)) {
    highlights.push({ label: `Evento: ${ev}`, value: String(count) });
  }

  return finalizeParsedReport(
    mergeProseIntoParsed(
      {
        plate,
        vin,
        periodFrom: first.at ?? null,
        periodTo: last.at ?? null,
        totalDistanceKm,
        tripPointsCount: rows.length,
        avgSpeedKmh,
        maxSpeedKmh,
        lastLocation: last.address,
        lastLatitude: last.lat,
        lastLongitude: last.lng,
        lastReportAt: last.at ?? null,
        highlights,
        samplePoints,
        warnings,
      },
      extractFieldsFromProse(normalizedText),
    ),
  );
}

export async function parseGpsReportFile(
  filePath: string,
  mimeType?: string,
): Promise<ParsedGpsReport> {
  const { text, warnings: readWarnings } = await readReportText(filePath, mimeType);
  return finalizeParsedReport(parseGpsReportText(text, [...readWarnings]));
}

function emptyParsed(warnings: string[]): ParsedGpsReport {
  return {
    plate: null,
    vin: null,
    periodFrom: null,
    periodTo: null,
    totalDistanceKm: null,
    tripPointsCount: 0,
    avgSpeedKmh: null,
    maxSpeedKmh: null,
    lastLocation: null,
    lastLatitude: null,
    lastLongitude: null,
    lastReportAt: null,
    highlights: [],
    samplePoints: [],
    warnings,
  };
}

export function relativeGpsStoredPath(absPath: string): string {
  const base = path.resolve(process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads"));
  return path.relative(base, absPath).replace(/\\/g, "/");
}
