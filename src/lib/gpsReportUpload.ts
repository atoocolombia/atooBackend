import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import multer from "multer";
import { UPLOAD_ROOT } from "./uploadStorage.js";

const MAX_BYTES = Number(process.env.GPS_REPORT_MAX_BYTES ?? 10 * 1024 * 1024);

const ALLOWED = new Set([
  "text/csv",
  "text/plain",
  "application/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

function gpsUploadDir(): string {
  const dir = path.join(UPLOAD_ROOT, "_gps-reports");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export const gpsReportUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, gpsUploadDir());
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).slice(0, 16) || ".csv";
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
    },
  }),
  limits: { fileSize: MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED.has(file.mimetype) || [".csv", ".txt", ".xls", ".xlsx"].includes(ext)) {
      cb(null, true);
      return;
    }
    cb(new Error("Formato no soportado. Usa CSV o TXT exportado desde la plataforma GPS."));
  },
});
