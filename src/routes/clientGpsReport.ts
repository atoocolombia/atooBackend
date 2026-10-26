import { Router } from "express";
import { mapGpsReport } from "../lib/gpsReportDto.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const clientGpsReportRouter = Router();

clientGpsReportRouter.use(requireAuth, requireRole("USER", "ADMIN"));

clientGpsReportRouter.get("/latest", async (req, res, next) => {
  try {
    const userId = req.auth!.id;
    const row = await prisma.clientGpsReport.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            email: true,
            identityExtraction: { select: { firstName: true, lastName: true } },
            vehiclePlan: { select: { vehicleName: true, vin: true } },
          },
        },
      },
    });
    res.json({ report: row ? mapGpsReport(row) : null });
  } catch (err) {
    next(err);
  }
});

clientGpsReportRouter.get("/history", async (req, res, next) => {
  try {
    const userId = req.auth!.id;
    const rows = await prisma.clientGpsReport.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 12,
      include: {
        user: {
          select: {
            email: true,
            identityExtraction: { select: { firstName: true, lastName: true } },
            vehiclePlan: { select: { vehicleName: true, vin: true } },
          },
        },
      },
    });
    res.json({ reports: rows.map(mapGpsReport) });
  } catch (err) {
    next(err);
  }
});
