import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import multer from "multer";
import { UPLOAD_ROOT } from "./uploadStorage.js";

const MAX_BYTES = Number(process.env.UPLOAD_MAX_BYTES ?? 15 * 1024 * 1024);

const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

function catalogVehicleUploadDir(vehicleId: string): string {
  if (!/^[A-Za-z0-9-]+$/.test(vehicleId)) {
    throw new Error("vehicleId inválido");
  }
  const dir = path.join(UPLOAD_ROOT, "landing-vehicles", vehicleId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function createCatalogVehicleImageUploader() {
  const storage = multer.diskStorage({
    destination: (req, _file, cb) => {
      try {
        const vehicleId = req.params.id as string;
        cb(null, catalogVehicleUploadDir(vehicleId));
      } catch (e) {
        cb(e as Error, UPLOAD_ROOT);
      }
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).slice(0, 32) || "";
      const base = crypto.randomBytes(12).toString("hex");
      cb(null, `${Date.now()}-${base}${ext}`);
    },
  });

  return multer({
    storage,
    limits: { fileSize: MAX_BYTES },
    fileFilter: (_req, file, cb) => {
      if (IMAGE_MIMES.has(file.mimetype)) {
        cb(null, true);
        return;
      }
      cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}`));
    },
  });
}

export function relativeStoredPath(absolutePath: string): string {
  return path.relative(UPLOAD_ROOT, absolutePath).split(path.sep).join("/");
}
