import cors from "cors";
import express from "express";
import { errorHandler } from "./middleware/errorHandler.js";
import { landingAdminRouter, landingRouter } from "./routes/landing.js";
import { authRouter } from "./routes/auth.js";
import { adminWorkshopsRouter } from "./routes/adminWorkshops.js";
import { documentsRouter } from "./routes/documents.js";
import { inspectionsRouter } from "./routes/inspections.js";
import { usersRouter } from "./routes/users.js";
import { vehiclesRouter } from "./routes/vehicles.js";
import { workshopPortalRouter } from "./routes/workshopPortal.js";
import { DEPRECATED_GEMINI_MODELS, resolveGeminiModelChain } from "./lib/geminiModels.js";

const app = express();

const clientOrigins = (process.env.CLIENT_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const allowLocalhostDev =
  process.env.NODE_ENV !== "production" && process.env.CORS_ALLOW_LOCALHOST !== "false";

function isAllowedOrigin(origin: string): boolean {
  if (clientOrigins.includes(origin)) {
    return true;
  }
  if (/^https:\/\/(www\.)?atoo\.io$/i.test(origin)) {
    return true;
  }
  if (/^https:\/\/[a-z0-9-]+(-[a-z0-9-]+)*\.vercel\.app$/i.test(origin)) {
    return true;
  }
  if (
    allowLocalhostDev &&
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)
  ) {
    return true;
  }
  return false;
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }
      console.warn(`[cors] Origen rechazado: ${origin}`);
      callback(null, false);
    },
    allowedHeaders: ["Content-Type", "X-Actor-Email"],
  }),
);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "landing-backend",
  });
});

/** Diagnóstico de IA (no expone la API key). */
app.get("/health/ai", (_req, res) => {
  const hasKey = Boolean(process.env.GEMINI_API_KEY?.trim());
  const skipAi = process.env.DATA_TREATMENT_SKIP_AI_VERIFY === "true";
  const configuredModel = process.env.GEMINI_MODEL?.trim() || null;

  res.status(200).json({
    ok: hasKey && !skipAi,
    geminiApiKeyConfigured: hasKey,
    skipAiVerify: skipAi,
    configuredModel,
    modelDeprecated: configuredModel ? DEPRECATED_GEMINI_MODELS.has(configuredModel) : false,
    modelChain: resolveGeminiModelChain("[health/ai]"),
    hint: !hasKey
      ? "Falta GEMINI_API_KEY en Railway (https://aistudio.google.com/apikey)."
      : skipAi
        ? "DATA_TREATMENT_SKIP_AI_VERIFY=true desactiva la IA."
        : configuredModel && DEPRECATED_GEMINI_MODELS.has(configuredModel)
          ? `Cambia GEMINI_MODEL a gemini-2.5-flash (el valor "${configuredModel}" ya no existe).`
          : "Configuración básica OK. Si falla al subir, revisa cuota de Gemini en Google AI Studio.",
  });
});

app.get("/api/v1", (_req, res) => {
  res.status(200).json({
    message: "API backend funcionando",
  });
});

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/users", usersRouter);
app.use("/api/v1/users/:userId/documents", documentsRouter);
app.use("/api/v1/users/:userId/inspections", inspectionsRouter);
app.use("/api/v1/workshop/:userId", workshopPortalRouter);
app.use("/api/v1/vehicles", vehiclesRouter);
app.use("/api/v1/landing", landingRouter);
app.use("/api/v1/admin/landing", landingAdminRouter);
app.use("/api/v1/admin/workshops", adminWorkshopsRouter);

app.use(errorHandler);

export { app };
