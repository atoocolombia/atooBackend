import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import crypto from "node:crypto";

export const UPLOAD_ROOT = path.resolve(process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads"));

/** Rutas relativas permitidas dentro de UPLOAD_ROOT (evita path traversal). */
export function resolveStoredFile(storedPath: string): string {
  const normalized = path.normalize(storedPath).replace(/^(\.\.(\/|\\|$))+/, "");
  const rootResolved = path.resolve(UPLOAD_ROOT);
  const fullResolved = path.resolve(path.join(UPLOAD_ROOT, normalized));
  if (!fullResolved.startsWith(rootResolved + path.sep) && fullResolved !== rootResolved) {
    throw new Error("Ruta de archivo inválida");
  }
  return fullResolved;
}

export function ensureUploadRoot(): void {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
}

const MAX_BYTES = Number(process.env.UPLOAD_MAX_BYTES ?? 15 * 1024 * 1024);

const ALLOWED_MIMES = new Set(
  (process.env.UPLOAD_ALLOWED_MIMES ??
    [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/heic",
      "image/heif",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ].join(","))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

function userUploadDir(userId: string): string {
  if (!/^[A-Za-z0-9]+$/.test(userId)) {
    throw new Error("userId inválido");
  }
  const dir = path.join(UPLOAD_ROOT, userId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function createUserDocumentUploader() {
  const storage = multer.diskStorage({
    destination: (req, _file, cb) => {
      try {
        const userId = req.params.userId as string;
        cb(null, userUploadDir(userId));
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
      if (ALLOWED_MIMES.has(file.mimetype)) {
        cb(null, true);
        return;
      }
      cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}`));
    },
  });
}
