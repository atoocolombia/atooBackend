import { Router } from "express";
import { generateMixedId } from "../lib/generateMixedId.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

export const adminServiceOffersRouter = Router();

adminServiceOffersRouter.use(requireAuth, requireAdmin);

function mapOffer(row: {
  id: string;
  title: string;
  bannerTitle: string;
  bannerSubtitle: string | null;
  detailBody: string;
  extraItems: unknown;
  deferMonths: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count?: { decisions: number };
}) {
  return {
    id: row.id,
    title: row.title,
    bannerTitle: row.bannerTitle,
    bannerSubtitle: row.bannerSubtitle,
    detailBody: row.detailBody,
    extraItems: row.extraItems,
    deferMonths: row.deferMonths,
    active: row.active,
    decisionsCount: row._count?.decisions ?? 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function parseExtraItems(raw: unknown): Array<{ label: string; amountCop: number; description?: string }> {
  if (!Array.isArray(raw)) {
    throw new Error("extraItems inválido");
  }
  const items = raw.map((row) => {
    const item = row as Record<string, unknown>;
    const label = String(item.label ?? "").trim();
    const amountCop = Number(item.amountCop);
    if (!label || !Number.isFinite(amountCop) || amountCop < 0) {
      throw new Error("Cada cargo debe tener nombre y monto COP válido");
    }
    const description = item.description != null ? String(item.description).trim() : undefined;
    return { label, amountCop, ...(description ? { description } : {}) };
  });
  if (items.length === 0) {
    throw new Error("Agrega al menos un cargo");
  }
  return items;
}

adminServiceOffersRouter.get("/", async (_req, res, next) => {
  try {
    const offers = await prisma.clientServiceOffer.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { decisions: true } } },
    });
    res.json({ offers: offers.map(mapOffer) });
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
    let parsedItems;
    try {
      parsedItems = parseExtraItems(extraItems);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "extraItems inválido" });
      return;
    }

    const offer = await prisma.clientServiceOffer.create({
      data: {
        id: generateMixedId(),
        title: title.trim(),
        bannerTitle: bannerTitle.trim(),
        bannerSubtitle: bannerSubtitle?.trim() || null,
        detailBody: detailBody.trim(),
        extraItems: parsedItems,
        deferMonths: Math.max(1, Math.min(60, Math.round(deferMonths ?? 1))),
        active: active ?? true,
      },
      include: { _count: { select: { decisions: true } } },
    });

    res.status(201).json({ offer: mapOffer(offer) });
  } catch (err) {
    next(err);
  }
});

adminServiceOffersRouter.patch("/:offerId", async (req, res, next) => {
  try {
    const {
      active,
      title,
      bannerTitle,
      bannerSubtitle,
      detailBody,
      extraItems,
      deferMonths,
    } = req.body as {
      active?: boolean;
      title?: string;
      bannerTitle?: string;
      bannerSubtitle?: string | null;
      detailBody?: string;
      extraItems?: unknown;
      deferMonths?: number;
    };

    const data: Record<string, unknown> = {};
    if (active !== undefined) data.active = Boolean(active);
    if (title !== undefined) data.title = title.trim();
    if (bannerTitle !== undefined) data.bannerTitle = bannerTitle.trim();
    if (bannerSubtitle !== undefined) data.bannerSubtitle = bannerSubtitle?.trim() || null;
    if (detailBody !== undefined) data.detailBody = detailBody.trim();
    if (deferMonths !== undefined) {
      data.deferMonths = Math.max(1, Math.min(60, Math.round(deferMonths)));
    }
    if (extraItems !== undefined) {
      try {
        data.extraItems = parseExtraItems(extraItems);
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : "extraItems inválido" });
        return;
      }
    }

    const offer = await prisma.clientServiceOffer.update({
      where: { id: req.params.offerId },
      data,
      include: { _count: { select: { decisions: true } } },
    });
    res.json({ offer: mapOffer(offer) });
  } catch (err) {
    next(err);
  }
});
