import { CatalogVehicleType, Prisma } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import fs from "node:fs/promises";
import { mapCatalogVehicleToDto } from "../lib/catalogVehicleMapper.js";
import { createCatalogVehicleImageUploader, relativeStoredPath } from "../lib/catalogVehicleUpload.js";
import { mapLandingContentToDto } from "../lib/landingContentMapper.js";
import {
  defaultLandingContent,
  mergeLandingContent,
  validateLandingContent,
  type LandingContent,
} from "../lib/landingContentDefaults.js";
import { createHeroPosterUploader, createHeroVideoUploader } from "../lib/landingHeroUpload.js";
import { readActorEmail, recordLandingAudit } from "../lib/landingAuditLog.js";
import { generateMixedId } from "../lib/generateMixedId.js";
import { prisma } from "../lib/prisma.js";
import { resolveStoredFile } from "../lib/uploadStorage.js";

export const landingRouter = Router();
export const landingAdminRouter = Router();

const vehicleInclude = {
  images: { orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }] },
};

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function paramId(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

async function getOrCreateSettings() {
  return prisma.landingSettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", maxVisibleVehicles: 10, content: defaultLandingContent() as object },
  });
}

async function saveLandingContent(content: LandingContent) {
  await prisma.landingSettings.upsert({
    where: { id: "default" },
    update: { content: content as object },
    create: { id: "default", maxVisibleVehicles: 10, content: content as object },
  });
}

async function deleteStoredPathIfExists(storedPath: string | null) {
  if (!storedPath) return;
  try {
    await fs.unlink(resolveStoredFile(storedPath));
  } catch {
    /* ignore */
  }
}

async function findVehicleOr404(id: string) {
  return prisma.catalogVehicle.findUnique({
    where: { id },
    include: vehicleInclude,
  });
}

landingRouter.get("/settings", async (_req, res, next) => {
  try {
    const settings = await getOrCreateSettings();
    res.json({ maxVisibleVehicles: settings.maxVisibleVehicles });
  } catch (err) {
    next(err);
  }
});

landingRouter.get("/content", async (req, res, next) => {
  try {
    const settings = await getOrCreateSettings();
    res.json(mapLandingContentToDto(mergeLandingContent(settings.content), req));
  } catch (err) {
    next(err);
  }
});

landingRouter.get("/hero/video/file", async (_req, res, next) => {
  try {
    const settings = await getOrCreateSettings();
    const content = mergeLandingContent(settings.content);
    if (!content.hero.videoStoredPath) {
      res.status(404).json({ error: "Video no encontrado" });
      return;
    }
    const filePath = resolveStoredFile(content.hero.videoStoredPath);
    res.setHeader("Content-Type", content.hero.videoMimeType ?? "video/mp4");
    res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
});

landingRouter.get("/hero/poster/file", async (_req, res, next) => {
  try {
    const settings = await getOrCreateSettings();
    const content = mergeLandingContent(settings.content);
    if (!content.hero.posterStoredPath) {
      res.status(404).json({ error: "Poster no encontrado" });
      return;
    }
    const filePath = resolveStoredFile(content.hero.posterStoredPath);
    res.setHeader("Content-Type", content.hero.posterMimeType ?? "image/jpeg");
    res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
});

landingRouter.get("/vehicles", async (req, res, next) => {
  try {
    const settings = await getOrCreateSettings();
    const vehicles = await prisma.catalogVehicle.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      take: settings.maxVisibleVehicles,
      include: vehicleInclude,
    });
    res.json(vehicles.map((v) => mapCatalogVehicleToDto(v, req)));
  } catch (err) {
    next(err);
  }
});

landingRouter.get("/images/:imageId/file", async (req, res, next) => {
  try {
    const image = await prisma.catalogVehicleImage.findUnique({
      where: { id: paramId(req.params.imageId) },
    });
    if (!image?.storedPath) {
      res.status(404).json({ error: "Imagen no encontrada" });
      return;
    }
    const filePath = resolveStoredFile(image.storedPath);
    res.setHeader("Content-Type", image.mimeType);
    res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
});

landingAdminRouter.get("/settings", async (_req, res, next) => {
  try {
    const settings = await getOrCreateSettings();
    res.json({ maxVisibleVehicles: settings.maxVisibleVehicles });
  } catch (err) {
    next(err);
  }
});

landingAdminRouter.put("/settings", async (req, res, next) => {
  try {
    const { maxVisibleVehicles } = req.body as { maxVisibleVehicles?: number };
    if (typeof maxVisibleVehicles !== "number" || maxVisibleVehicles < 1 || maxVisibleVehicles > 50) {
      res.status(400).json({ error: "maxVisibleVehicles debe ser un número entre 1 y 50" });
      return;
    }
    const settings = await prisma.landingSettings.upsert({
      where: { id: "default" },
      update: { maxVisibleVehicles },
      create: { id: "default", maxVisibleVehicles },
    });
    await recordLandingAudit(
      readActorEmail(req),
      "settings.update",
      `Límite de vehículos visibles: ${settings.maxVisibleVehicles}`,
      { maxVisibleVehicles: settings.maxVisibleVehicles },
    );
    res.json({ maxVisibleVehicles: settings.maxVisibleVehicles });
  } catch (err) {
    next(err);
  }
});

landingAdminRouter.get("/content", async (req, res, next) => {
  try {
    const settings = await getOrCreateSettings();
    res.json(mapLandingContentToDto(mergeLandingContent(settings.content), req));
  } catch (err) {
    next(err);
  }
});

landingAdminRouter.put("/content", async (req, res, next) => {
  try {
    const content = validateLandingContent(req.body);
    if (!content) {
      res.status(400).json({ error: "Contenido de landing inválido" });
      return;
    }
    await saveLandingContent(content);
    await recordLandingAudit(
      readActorEmail(req),
      "content.update",
      "Actualizó contenido de la landing (textos/secciones)",
    );
    res.json(mapLandingContentToDto(content, req));
  } catch (err) {
    next(err);
  }
});

landingAdminRouter.get("/audit-logs", async (req, res, next) => {
  try {
    const limitRaw = Number(req.query.limit ?? 50);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
    const logs = await prisma.landingAuditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    res.json(logs);
  } catch (err) {
    next(err);
  }
});

landingAdminRouter.get("/vehicles", async (req, res, next) => {
  try {
    const vehicles = await prisma.catalogVehicle.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: vehicleInclude,
    });
    res.json(vehicles.map((v) => mapCatalogVehicleToDto(v, req)));
  } catch (err) {
    next(err);
  }
});

landingAdminRouter.post("/vehicles", async (req, res, next) => {
  try {
    const body = req.body as Record<string, unknown>;
    const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!slug || !SLUG_REGEX.test(slug)) {
      res.status(400).json({ error: "slug inválido (usa minúsculas, números y guiones)" });
      return;
    }
    if (!name) {
      res.status(400).json({ error: "name es obligatorio" });
      return;
    }

    const typeRaw = typeof body.type === "string" ? body.type.toUpperCase() : "CARRO";
    const type = typeRaw === "CAMIONETA" ? CatalogVehicleType.CAMIONETA : CatalogVehicleType.CARRO;

    let created = null;
    for (let attempt = 0; attempt < 15; attempt++) {
      try {
        created = await prisma.catalogVehicle.create({
          data: {
            id: generateMixedId(),
            slug,
            name,
            subtitle: typeof body.subtitle === "string" ? body.subtitle : "",
            type,
            highlights: Array.isArray(body.highlights) ? body.highlights : [],
            features: Array.isArray(body.features) ? body.features : [],
            specs: Array.isArray(body.specs) ? body.specs : [],
            badge: typeof body.badge === "string" ? body.badge : null,
            popular: Boolean(body.popular),
            weeklyPriceCop: typeof body.weeklyPriceCop === "number" ? body.weeklyPriceCop : 0,
            active: body.active !== false,
            sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : 0,
            specSheetPath: typeof body.specSheetPath === "string" ? body.specSheetPath : null,
          },
          include: vehicleInclude,
        });
        break;
      } catch (err) {
        const isCollision =
          err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
        if (!isCollision || attempt === 14) throw err;
      }
    }

    if (!created) {
      res.status(500).json({ error: "No se pudo crear el vehículo" });
      return;
    }
    await recordLandingAudit(
      readActorEmail(req),
      "vehicle.create",
      `Creó vehículo "${created.name}"`,
      { vehicleId: created.id, slug: created.slug },
    );
    res.status(201).json(mapCatalogVehicleToDto(created, req));
  } catch (err) {
    next(err);
  }
});

landingAdminRouter.put("/vehicles/:id", async (req, res, next) => {
  try {
    const vehicleId = paramId(req.params.id);
    const existing = await findVehicleOr404(vehicleId);
    if (!existing) {
      res.status(404).json({ error: "Vehículo no encontrado" });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const data: Prisma.CatalogVehicleUpdateInput = {};

    if (typeof body.slug === "string") {
      const slug = body.slug.trim().toLowerCase();
      if (!SLUG_REGEX.test(slug)) {
        res.status(400).json({ error: "slug inválido" });
        return;
      }
      data.slug = slug;
    }
    if (typeof body.name === "string") data.name = body.name.trim();
    if (typeof body.subtitle === "string") data.subtitle = body.subtitle;
    if (typeof body.type === "string") {
      data.type = body.type.toUpperCase() === "CAMIONETA" ? CatalogVehicleType.CAMIONETA : CatalogVehicleType.CARRO;
    }
    if (Array.isArray(body.highlights)) data.highlights = body.highlights;
    if (Array.isArray(body.features)) data.features = body.features;
    if (Array.isArray(body.specs)) data.specs = body.specs;
    if (body.badge === null || typeof body.badge === "string") data.badge = body.badge;
    if (typeof body.popular === "boolean") data.popular = body.popular;
    if (typeof body.weeklyPriceCop === "number") data.weeklyPriceCop = body.weeklyPriceCop;
    if (typeof body.active === "boolean") data.active = body.active;
    if (typeof body.sortOrder === "number") data.sortOrder = body.sortOrder;
    if (body.specSheetPath === null || typeof body.specSheetPath === "string") {
      data.specSheetPath = body.specSheetPath;
    }

    const updated = await prisma.catalogVehicle.update({
      where: { id: vehicleId },
      data,
      include: vehicleInclude,
    });
    await recordLandingAudit(
      readActorEmail(req),
      "vehicle.update",
      `Actualizó vehículo "${updated.name}"`,
      { vehicleId: updated.id, slug: updated.slug },
    );
    res.json(mapCatalogVehicleToDto(updated, req));
  } catch (err) {
    next(err);
  }
});

landingAdminRouter.delete("/vehicles/:id", async (req, res, next) => {
  try {
    const vehicleId = paramId(req.params.id);
    const vehicle = await findVehicleOr404(vehicleId);
    if (!vehicle) {
      res.status(404).json({ error: "Vehículo no encontrado" });
      return;
    }

    for (const image of vehicle.images) {
      if (image.storedPath) {
        try {
          await fs.unlink(resolveStoredFile(image.storedPath));
        } catch {
          /* ignore */
        }
      }
    }

    await prisma.catalogVehicle.delete({ where: { id: vehicleId } });
    await recordLandingAudit(
      readActorEmail(req),
      "vehicle.delete",
      `Eliminó vehículo "${vehicle.name}"`,
      { vehicleId, slug: vehicle.slug },
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

const catalogUpload = createCatalogVehicleImageUploader();

landingAdminRouter.post("/vehicles/:id/images", (req, res, next) => {
  catalogUpload.single("file")(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : "Error al subir imagen";
      res.status(400).json({ error: message });
      return;
    }
    void saveCatalogImage(req, res, next);
  });
});

async function saveCatalogImage(req: Request, res: Response, next: NextFunction) {
  try {
    const vehicleId = paramId(req.params.id);
    const vehicle = await findVehicleOr404(vehicleId);
    if (!vehicle) {
      res.status(404).json({ error: "Vehículo no encontrado" });
      return;
    }
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "Falta el archivo (campo file)" });
      return;
    }

    const isPrimary = req.body?.isPrimary === "true" || vehicle.images.length === 0;
    const sortOrder = vehicle.images.length;

    let image = null;
    for (let attempt = 0; attempt < 15; attempt++) {
      try {
        image = await prisma.catalogVehicleImage.create({
          data: {
            id: generateMixedId(),
            vehicleId: vehicle.id,
            storedPath: relativeStoredPath(file.path),
            originalName: file.originalname,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            sortOrder,
            isPrimary,
          },
        });
        break;
      } catch (err) {
        const isCollision =
          err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
        if (!isCollision || attempt === 14) throw err;
      }
    }

    if (!image) {
      res.status(500).json({ error: "No se pudo guardar la imagen" });
      return;
    }

    if (isPrimary) {
      await prisma.catalogVehicleImage.updateMany({
        where: { vehicleId: vehicle.id, id: { not: image.id } },
        data: { isPrimary: false },
      });
    }

    const refreshed = await findVehicleOr404(vehicle.id);
    await recordLandingAudit(
      readActorEmail(req),
      "vehicle.image.upload",
      `Subió imagen a "${vehicle.name}"`,
      { vehicleId: vehicle.id, imageId: image.id, originalName: file.originalname },
    );
    res.status(201).json(mapCatalogVehicleToDto(refreshed!, req));
  } catch (err) {
    next(err);
  }
}

landingAdminRouter.patch("/vehicles/:id/images/:imageId", async (req, res, next) => {
  try {
    const id = paramId(req.params.id);
    const imageId = paramId(req.params.imageId);
    const body = req.body as { isPrimary?: boolean; sortOrder?: number };

    const image = await prisma.catalogVehicleImage.findFirst({
      where: { id: imageId, vehicleId: id },
    });
    if (!image) {
      res.status(404).json({ error: "Imagen no encontrada" });
      return;
    }

    if (typeof body.sortOrder === "number") {
      await prisma.catalogVehicleImage.update({
        where: { id: imageId },
        data: { sortOrder: body.sortOrder },
      });
    }

    if (body.isPrimary === true) {
      await prisma.catalogVehicleImage.updateMany({
        where: { vehicleId: id },
        data: { isPrimary: false },
      });
      await prisma.catalogVehicleImage.update({
        where: { id: imageId },
        data: { isPrimary: true },
      });
    }

    const refreshed = await findVehicleOr404(id);
    const summary = body.isPrimary
      ? "Marcó imagen principal de vehículo"
      : "Actualizó imagen de vehículo";
    await recordLandingAudit(readActorEmail(req), "vehicle.image.update", summary, {
      vehicleId: id,
      imageId,
    });
    res.json(mapCatalogVehicleToDto(refreshed!, req));
  } catch (err) {
    next(err);
  }
});

landingAdminRouter.delete("/vehicles/:id/images/:imageId", async (req, res, next) => {
  try {
    const id = paramId(req.params.id);
    const imageId = paramId(req.params.imageId);
    const image = await prisma.catalogVehicleImage.findFirst({
      where: { id: imageId, vehicleId: id },
    });
    if (!image) {
      res.status(404).json({ error: "Imagen no encontrada" });
      return;
    }

    if (image.storedPath) {
      try {
        await fs.unlink(resolveStoredFile(image.storedPath));
      } catch {
        /* ignore */
      }
    }

    await prisma.catalogVehicleImage.delete({ where: { id: imageId } });

    const remaining = await prisma.catalogVehicleImage.findMany({
      where: { vehicleId: id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });

    if (remaining.length > 0 && (image.isPrimary || !remaining.some((r) => r.isPrimary))) {
      await prisma.catalogVehicleImage.update({
        where: { id: remaining[0].id },
        data: { isPrimary: true },
      });
    }

    const refreshed = await findVehicleOr404(id);
    await recordLandingAudit(readActorEmail(req), "vehicle.image.delete", "Eliminó imagen de vehículo", {
      vehicleId: id,
      imageId,
    });
    res.json(mapCatalogVehicleToDto(refreshed!, req));
  } catch (err) {
    next(err);
  }
});

const heroVideoUpload = createHeroVideoUploader();
const heroPosterUpload = createHeroPosterUploader();

landingAdminRouter.post("/hero/video", (req, res, next) => {
  heroVideoUpload.single("file")(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : "Error al subir video";
      res.status(400).json({ error: message });
      return;
    }
    void saveHeroVideo(req, res, next);
  });
});

async function saveHeroVideo(req: Request, res: Response, next: NextFunction) {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "Falta el archivo (campo file)" });
      return;
    }
    const settings = await getOrCreateSettings();
    const content = mergeLandingContent(settings.content);
    await deleteStoredPathIfExists(content.hero.videoStoredPath);
    content.hero = {
      ...content.hero,
      videoStoredPath: relativeStoredPath(file.path),
      videoMimeType: file.mimetype,
    };
    await saveLandingContent(content);
    await recordLandingAudit(readActorEmail(req), "hero.video.upload", "Subió video del hero");
    res.json(mapLandingContentToDto(content, req));
  } catch (err) {
    next(err);
  }
}

landingAdminRouter.delete("/hero/video", async (req, res, next) => {
  try {
    const settings = await getOrCreateSettings();
    const content = mergeLandingContent(settings.content);
    await deleteStoredPathIfExists(content.hero.videoStoredPath);
    content.hero = {
      ...content.hero,
      videoStoredPath: null,
      videoMimeType: null,
    };
    await saveLandingContent(content);
    await recordLandingAudit(readActorEmail(req), "hero.video.delete", "Restauró video por defecto del hero");
    res.json(mapLandingContentToDto(content, req));
  } catch (err) {
    next(err);
  }
});

landingAdminRouter.post("/hero/poster", (req, res, next) => {
  heroPosterUpload.single("file")(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : "Error al subir poster";
      res.status(400).json({ error: message });
      return;
    }
    void saveHeroPoster(req, res, next);
  });
});

async function saveHeroPoster(req: Request, res: Response, next: NextFunction) {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "Falta el archivo (campo file)" });
      return;
    }
    const settings = await getOrCreateSettings();
    const content = mergeLandingContent(settings.content);
    await deleteStoredPathIfExists(content.hero.posterStoredPath);
    content.hero = {
      ...content.hero,
      posterStoredPath: relativeStoredPath(file.path),
      posterMimeType: file.mimetype,
    };
    await saveLandingContent(content);
    await recordLandingAudit(readActorEmail(req), "hero.poster.upload", "Subió poster del hero");
    res.json(mapLandingContentToDto(content, req));
  } catch (err) {
    next(err);
  }
}

landingAdminRouter.delete("/hero/poster", async (req, res, next) => {
  try {
    const settings = await getOrCreateSettings();
    const content = mergeLandingContent(settings.content);
    await deleteStoredPathIfExists(content.hero.posterStoredPath);
    content.hero = {
      ...content.hero,
      posterStoredPath: null,
      posterMimeType: null,
    };
    await saveLandingContent(content);
    await recordLandingAudit(readActorEmail(req), "hero.poster.delete", "Restauró poster por defecto del hero");
    res.json(mapLandingContentToDto(content, req));
  } catch (err) {
    next(err);
  }
});
