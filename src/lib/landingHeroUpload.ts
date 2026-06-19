import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import multer from "multer";
import { UPLOAD_ROOT } from "./uploadStorage.js";

const HERO_DIR = path.join(UPLOAD_ROOT, "landing-hero");
const VIDEO_MAX_BYTES = Number(process.env.LANDING_HERO_VIDEO_MAX_BYTES ?? 50 * 1024 * 1024);
const POSTER_MAX_BYTES = Number(process.env.UPLOAD_MAX_BYTES ?? 15 * 1024 * 1024);

const VIDEO_MIMES = new Set(["video/mp4", "video/webm"]);
const POSTER_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

function ensureHeroDir(): string {
  fs.mkdirSync(HERO_DIR, { recursive: true });
  return HERO_DIR;
}

function heroFilename(originalName: string): string {
  const ext = path.extname(originalName).slice(0, 32) || "";
  const base = crypto.randomBytes(12).toString("hex");
  return `${Date.now()}-${base}${ext}`;
}

export function createHeroVideoUploader() {
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      try {
        cb(null, ensureHeroDir());
      } catch (e) {
        cb(e as Error, UPLOAD_ROOT);
      }
    },
    filename: (_req, file, cb) => {
      cb(null, heroFilename(file.originalname));
    },
  });

  return multer({
    storage,
    limits: { fileSize: VIDEO_MAX_BYTES },
    fileFilter: (_req, file, cb) => {
      if (VIDEO_MIMES.has(file.mimetype)) {
        cb(null, true);
        return;
      }
      cb(new Error(`Tipo de video no permitido: ${file.mimetype}. Usa MP4 o WebM.`));
    },
  });
}

export function createHeroPosterUploader() {
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      try {
        cb(null, ensureHeroDir());
      } catch (e) {
        cb(e as Error, UPLOAD_ROOT);
      }
    },
    filename: (_req, file, cb) => {
      cb(null, heroFilename(file.originalname));
    },
  });

  return multer({
    storage,
    limits: { fileSize: POSTER_MAX_BYTES },
    fileFilter: (_req, file, cb) => {
      if (POSTER_MIMES.has(file.mimetype)) {
        cb(null, true);
        return;
      }
      cb(new Error(`Tipo de imagen no permitido: ${file.mimetype}`));
    },
  });
}
