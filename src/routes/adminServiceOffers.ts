import { Router } from "express";
import { generateMixedId } from "../lib/generateMixedId.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

export const adminServiceOffersRouter = Router();

adminServiceOffersRouter.use(requireAuth, requireAdmin);

adminServiceOffersRouter.get("/", async (_req, res, next) => {
  try {
    const offers = await prisma.clientServiceOffer.findMany({ orderBy: { createdAt: "desc" } });
    res.json({ offers });
  } catch (err) {
    next(err);
  }
});

adminServiceOffersRouter.post("/", async (req, res, next) => {
  try {
    const { title, bannerTitle, bannerSubtitle, detailBody, extraItems, active, deferMonths } =
      req.body as {
      title?: string;
      bannerTitle?: string;
      bannerSubtitle?: string;
      detailBody?: string;
      extraItems?: unknown;
      active?: boolean;
      deferMonths?: number;
    };

    if (!title?.trim() || !bannerTitle?.trim() || !detailBody?.trim()) {
      res.status(400).json({ error: "title, bannerTitle y detailBody son obligatorios" });
      return;
    }
    if (!Array.isArray(extraItems) || extraItems.length === 0) {
      res.status(400).json({ error: "extraItems debe ser un arreglo con al menos un cargo" });
      return;
    }

    const offer = await prisma.clientServiceOffer.create({
      data: {
        id: generateMixedId(),
        title: title.trim(),
        bannerTitle: bannerTitle.trim(),
        bannerSubtitle: bannerSubtitle?.trim() || null,
        detailBody: detailBody.trim(),
        extraItems,
        deferMonths: Math.max(1, Math.min(60, Math.round(deferMonths ?? 1))),
        active: active ?? true,
      },
    });

    res.status(201).json({ offer });
  } catch (err) {
    next(err);
  }
});

adminServiceOffersRouter.patch("/:offerId", async (req, res, next) => {
  try {
    const { active } = req.body as { active?: boolean };
    const offer = await prisma.clientServiceOffer.update({
      where: { id: req.params.offerId },
      data: {
        ...(active !== undefined ? { active } : {}),
      },
    });
    res.json({ offer });
  } catch (err) {
    next(err);
  }
});
