import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

/** Carpeta `backend/` (tanto si este archivo está en `src/` como en `dist/`). */
const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(backendRoot, ".env");

const result = dotenv.config({
  path: envPath,
  /** Si el IDE o el shell exportan GEMINI_API_KEY vacío, igualmente aplica el valor de `.env`. */
  override: true,
});

if (result.error) {
  console.warn(`[env] No se pudo leer ${envPath}:`, result.error.message);
}

if (!process.env.GEMINI_API_KEY?.trim() && process.env.DATA_TREATMENT_SKIP_AI_VERIFY !== "true") {
  console.warn(
    `[env] Falta GEMINI_API_KEY en ${envPath} (archivo guardado en disco). La verificación automática del PDF de autorización no funcionará hasta que añadas la clave y reinicies el servidor.`,
  );
}
