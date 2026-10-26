import type { ClientGpsReport } from "@prisma/client";

export type ClientGpsReportDto = {
  id: string;
  userId: string;
  originalFileName: string;
  plate: string | null;
  vin: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  totalDistanceKm: number | null;
  tripPointsCount: number | null;
  avgSpeedKmh: number | null;
  maxSpeedKmh: number | null;
  lastLocation: string | null;
  lastLatitude: number | null;
  lastLongitude: number | null;
  lastReportAt: string | null;
  highlights: Array<{ label: string; value: string }>;
  samplePoints: Array<{
    at: string | null;
    latitude: number | null;
    longitude: number | null;
    location: string | null;
    speedKmh: number | null;
  }>;
  parseWarnings: string[];
  analystNotes: string | null;
  uploadedAt: string;
  clientDisplayName: string | null;
  vehicleName: string | null;
};

export function mapGpsReport(
  row: ClientGpsReport & {
    user?: {
      email: string;
      identityExtraction: { firstName: string | null; lastName: string | null } | null;
      vehiclePlan: { vehicleName: string; vin: string | null } | null;
    };
  },
): ClientGpsReportDto {
  const ie = row.user?.identityExtraction;
  const name = [ie?.firstName, ie?.lastName].filter(Boolean).join(" ").trim();
  return {
    id: row.id,
    userId: row.userId,
    originalFileName: row.originalFileName,
    plate: row.plate,
    vin: row.vin,
    periodFrom: row.periodFrom?.toISOString() ?? null,
    periodTo: row.periodTo?.toISOString() ?? null,
    totalDistanceKm: row.totalDistanceKm,
    tripPointsCount: row.tripPointsCount,
    avgSpeedKmh: row.avgSpeedKmh,
    maxSpeedKmh: row.maxSpeedKmh,
    lastLocation: row.lastLocation,
    lastLatitude: row.lastLatitude,
    lastLongitude: row.lastLongitude,
    lastReportAt: row.lastReportAt?.toISOString() ?? null,
    highlights: Array.isArray(row.highlights) ? (row.highlights as ClientGpsReportDto["highlights"]) : [],
    samplePoints: Array.isArray(row.samplePoints)
      ? (row.samplePoints as ClientGpsReportDto["samplePoints"])
      : [],
    parseWarnings: Array.isArray(row.parseWarnings) ? (row.parseWarnings as string[]) : [],
    analystNotes: row.analystNotes,
    uploadedAt: row.createdAt.toISOString(),
    clientDisplayName: name || row.user?.email || null,
    vehicleName: row.user?.vehiclePlan?.vehicleName ?? null,
  };
}
