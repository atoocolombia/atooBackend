import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

import { DEPRECATED_GEMINI_MODELS } from "./lib/geminiModels.js";

/** Carpeta `backend/` (tanto si este archivo está en `src/` como en `dist/`). */
const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(backendRoot, ".env");

const result = dotenv.config({
  path: envPath,
  /** Si el IDE o el shell exportan GEMINI_API_KEY vacío, igualmente aplica el valor de `.env`. */
  override: true,
});

if (result.error && process.env.NODE_ENV !== "production") {
  console.warn(`[env] No se pudo leer ${envPath}:`, result.error.message);
}

if (!process.env.GEMINI_API_KEY?.trim() && process.env.DATA_TREATMENT_SKIP_AI_VERIFY !== "true") {
  console.warn(
    "[env] Falta GEMINI_API_KEY. La verificación automática del PDF de autorización no funcionará hasta que añadas la clave (Variables en Railway o .env en local) y reinicies el servidor.",
  );
}

const configuredModel = process.env.GEMINI_MODEL?.trim();
if (configuredModel && DEPRECATED_GEMINI_MODELS.has(configuredModel)) {
  console.warn(
    `[env] GEMINI_MODEL="${configuredModel}" ya no está disponible en la API de Gemini. Elimínalo o cámbialo por gemini-2.5-flash en Railway.`,
  );
}
