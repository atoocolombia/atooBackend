import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import multer from "multer";
import { UPLOAD_ROOT } from "./uploadStorage.js";

const TRAINING_DIR = path.join(UPLOAD_ROOT, "training-videos");
const VIDEO_MAX_BYTES = Number(process.env.TRAINING_VIDEO_MAX_BYTES ?? 200 * 1024 * 1024);
const VIDEO_MIMES = new Set(["video/mp4", "video/webm"]);

function ensureTrainingDir(): string {
  fs.mkdirSync(TRAINING_DIR, { recursive: true });
  return TRAINING_DIR;
}

function trainingFilename(originalName: string): string {
  const ext = path.extname(originalName).slice(0, 32) || ".mp4";
  const base = crypto.randomBytes(12).toString("hex");
  return `${Date.now()}-${base}${ext}`;
}

export function trainingVideoRelativePath(filename: string): string {
  return path.join("training-videos", filename).replace(/\\/g, "/");
}

export function createTrainingVideoUploader() {
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      try {
        cb(null, ensureTrainingDir());
      } catch (e) {
        cb(e as Error, UPLOAD_ROOT);
      }
    },
    filename: (_req, file, cb) => {
      cb(null, trainingFilename(file.originalname));
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
