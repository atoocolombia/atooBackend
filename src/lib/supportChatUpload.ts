import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { UPLOAD_ROOT } from "./uploadStorage.js";

const MAX_IMAGE_BYTES = Number(process.env.SUPPORT_CHAT_MAX_IMAGE_BYTES ?? 12 * 1024 * 1024);
const MAX_VIDEO_BYTES = Number(process.env.SUPPORT_CHAT_MAX_VIDEO_BYTES ?? 40 * 1024 * 1024);

const IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const VIDEO_MIMES = new Set(["video/mp4", "video/webm", "video/quicktime", "video/3gpp"]);

export function isSupportChatImageMime(mime: string): boolean {
  return IMAGE_MIMES.has(mime) || mime.startsWith("image/");
}

export function isSupportChatVideoMime(mime: string): boolean {
  return VIDEO_MIMES.has(mime) || mime.startsWith("video/");
}

export function supportChatAttachmentKind(mime: string): "image" | "video" | null {
  if (isSupportChatImageMime(mime)) return "image";
  if (isSupportChatVideoMime(mime)) return "video";
  return null;
}

function supportChatDir(userId: string): string {
  if (!/^[A-Za-z0-9]+$/.test(userId)) {
    throw new Error("userId inválido");
  }
  const dir = path.join(UPLOAD_ROOT, "support-chat", userId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function supportChatRelativePath(userId: string, filename: string): string {
  return path.posix.join("support-chat", userId, filename);
}

export function createSupportChatMediaUploader() {
  const storage = multer.diskStorage({
    destination: (req, _file, cb) => {
      try {
        const userId = req.auth!.id;
        cb(null, supportChatDir(userId));
      } catch (e) {
        cb(e as Error, UPLOAD_ROOT);
      }
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).slice(0, 32) || "";
      const base = crypto.randomBytes(10).toString("hex");
      cb(null, `${Date.now()}-${base}${ext}`);
    },
  });

  return multer({
    storage,
    limits: { fileSize: MAX_VIDEO_BYTES },
    fileFilter: (_req, file, cb) => {
      const kind = supportChatAttachmentKind(file.mimetype);
      if (!kind) {
        cb(new Error("Solo puedes subir fotos o videos (JPG, PNG, MP4, etc.)."));
        return;
      }
      cb(null, true);
    },
  });
}

export function assertSupportChatFileSize(mime: string, size: number): void {
  const kind = supportChatAttachmentKind(mime);
  if (!kind) {
    throw new Error("Tipo de archivo no permitido");
  }
  if (kind === "image" && size > MAX_IMAGE_BYTES) {
    throw new Error("La foto es demasiado pesada. Usa una imagen de hasta 12 MB.");
  }
  if (kind === "video" && size > MAX_VIDEO_BYTES) {
    throw new Error("El video es demasiado pesado. Usa un clip de hasta 40 MB.");
  }
}

/** Tamaño máximo para enviar video a Gemini inline (bytes). */
export const SUPPORT_CHAT_GEMINI_VIDEO_MAX_BYTES = Number(
  process.env.SUPPORT_CHAT_GEMINI_VIDEO_MAX_BYTES ?? 18 * 1024 * 1024,
);

export const SUPPORT_CHAT_GEMINI_IMAGE_MAX_BYTES = Number(
  process.env.SUPPORT_CHAT_GEMINI_IMAGE_MAX_BYTES ?? 8 * 1024 * 1024,
);
