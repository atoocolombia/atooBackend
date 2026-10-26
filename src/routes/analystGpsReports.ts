import { Router } from "express";
import { generateMixedId } from "../lib/generateMixedId.js";
import { mapGpsReport } from "../lib/gpsReportDto.js";
import { gpsReportUpload } from "../lib/gpsReportUpload.js";
import { parseGpsReportFile, relativeGpsStoredPath } from "../lib/parseGpsReportFile.js";
import { prisma } from "../lib/prisma.js";
import { createUserNotification } from "../lib/userNotifications.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const analystGpsReportsRouter = Router();

analystGpsReportsRouter.use(requireAuth, requireRole("ANALYST", "ADMIN"));

const reportInclude = {
  user: {
    select: {
      email: true,
      identityExtraction: { select: { firstName: true, lastName: true } },
      vehiclePlan: { select: { vehicleName: true, vin: true } },
    },
  },
} as const;

function normalizeVin(v: string | null | undefined): string | null {
  const t = v?.trim().toUpperCase();
  return t || null;
}

analystGpsReportsRouter.get("/", async (req, res, next) => {
  try {
    const userId = typeof req.query.userId === "string" ? req.query.userId.trim() : "";
    const rows = await prisma.clientGpsReport.findMany({
      where: userId ? { userId } : undefined,
      orderBy: { createdAt: "desc" },
      take: userId ? 24 : 50,
      include: reportInclude,
    });
    res.json({ reports: rows.map(mapGpsReport) });
  } catch (err) {
    next(err);
  }
});

analystGpsReportsRouter.post("/", (req, res, next) => {
  gpsReportUpload.single("file")(req, res, async (uploadErr: unknown) => {
    try {
      if (uploadErr) {
        const msg = uploadErr instanceof Error ? uploadErr.message : "No se pudo subir el archivo";
        res.status(400).json({ error: msg });
        return;
      }

      const analystId = req.auth!.id;
      const userId = typeof req.body.userId === "string" ? req.body.userId.trim() : "";
      const analystNotes =
        typeof req.body.analystNotes === "string" ? req.body.analystNotes.trim().slice(0, 2000) : null;

      if (!userId) {
        res.status(400).json({ error: "Selecciona el cliente al que corresponde el vehículo." });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: "Adjunta el archivo de la empresa GPS." });
        return;
      }

      const client = await prisma.user.findFirst({
        where: { id: userId, userType: "USER" },
        include: { vehiclePlan: true },
      });
      if (!client) {
        res.status(404).json({ error: "Cliente no encontrado" });
        return;
      }

      const parsed = await parseGpsReportFile(req.file.path, req.file.mimetype);
      const warnings = [...parsed.warnings];

      const planVin = normalizeVin(client.vehiclePlan?.vin);
      const fileVin = normalizeVin(parsed.vin);
      if (planVin && fileVin && planVin !== fileVin) {
        warnings.push(
          `El VIN del archivo (${fileVin}) no coincide con el del plan (${planVin}). Revisa que sea el cliente correcto.`,
        );
      }

      const storedPath = relativeGpsStoredPath(req.file.path);

      const row = await prisma.clientGpsReport.create({
        data: {
          id: generateMixedId(),
          userId,
          uploadedByUserId: analystId,
          originalFileName: req.file.originalname,
          storedPath,
          mimeType: req.file.mimetype,
          sizeBytes: req.file.size,
          plate: parsed.plate,
          vin: parsed.vin ?? planVin,
          periodFrom: parsed.periodFrom,
          periodTo: parsed.periodTo,
          totalDistanceKm: parsed.totalDistanceKm,
          tripPointsCount: parsed.tripPointsCount,
          avgSpeedKmh: parsed.avgSpeedKmh,
          maxSpeedKmh: parsed.maxSpeedKmh,
          lastLocation: parsed.lastLocation,
          lastLatitude: parsed.lastLatitude,
          lastLongitude: parsed.lastLongitude,
          lastReportAt: parsed.lastReportAt,
          highlights: parsed.highlights,
          samplePoints: parsed.samplePoints,
          parseWarnings: warnings,
          analystNotes,
        },
        include: reportInclude,
      });

      const vehicleLabel = client.vehiclePlan?.vehicleName ?? "tu vehículo";
      await createUserNotification({
        userId,
        type: "gps_report_uploaded",
        title: "Nuevo informe GPS disponible",
        message: `Ya puedes ver el informe de ubicación y recorrido de ${vehicleLabel} en la sección Mi vehículo.`,
        metadata: { reportId: row.id },
      });

      res.status(201).json({
        report: mapGpsReport(row),
        warnings,
      });
    } catch (err) {
      next(err);
    }
  });
});
