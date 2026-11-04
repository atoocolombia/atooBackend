import { Router } from "express";
import { buildVehicleHistoryTimeline } from "../lib/vehicleHistoryTimeline.js";

export const clientVehicleHistoryRouter = Router({ mergeParams: true });

function paramUserId(req: { params: Record<string, string | string[] | undefined> }): string {
  const v = req.params.userId;
  return Array.isArray(v) ? v[0] ?? "" : v ?? "";
}

clientVehicleHistoryRouter.get("/", async (req, res, next) => {
  try {
    const timeline = await buildVehicleHistoryTimeline(paramUserId(req));
    res.json({ items: timeline });
  } catch (err) {
    next(err);
  }
});
