import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import { UserType } from "@prisma/client";
import { errorHandler } from "./middleware/errorHandler.js";
import { landingAdminRouter, landingRouter } from "./routes/landing.js";
import { authRouter } from "./routes/auth.js";
import { adminWorkshopsRouter } from "./routes/adminWorkshops.js";
import { adminInspectionsRouter } from "./routes/adminInspections.js";
import { documentsRouter } from "./routes/documents.js";
import { inspectionsRouter } from "./routes/inspections.js";
import { usersRouter } from "./routes/users.js";
import { vehiclesRouter } from "./routes/vehicles.js";
import { workshopPortalRouter } from "./routes/workshopPortal.js";
import { pushRouter } from "./routes/push.js";
import { advisorDeliveriesRouter } from "./routes/advisorDeliveries.js";
import { analystApplicationsRouter, deliveryConfirmationRouter } from "./routes/analystApplications.js";
import { accountSetupRouter } from "./routes/accountSetup.js";
import { whatsappWebhookRouter } from "./routes/whatsappWebhook.js";
import { DEPRECATED_GEMINI_MODELS, resolveGeminiModelChain } from "./lib/geminiModels.js";
import { pingGemini } from "./lib/geminiChainedContent.js";
import { requireAuth, requireAdmin, requireSelfUserParam, requireRole } from "./middleware/auth.js";

const app = express();

const clientOrigins = (process.env.CLIENT_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const appEnv = (process.env.APP_ENV ?? "").trim().toLowerCase();
const allowLocalhostDev =
  appEnv !== "production" &&
  process.env.NODE_ENV !== "production" &&
  process.env.CORS_ALLOW_LOCALHOST !== "false";

function isAllowedOrigin(origin: string): boolean {
  if (clientOrigins.includes(origin)) {
    return true;
  }
  if (/^https:\/\/(www\.)?atoo\.io$/i.test(origin)) {
    return true;
  }
  if (/^https:\/\/(www\.)?staging\.atoo\.io$/i.test(origin)) {
    return appEnv !== "production";
  }
  if (/^https:\/\/[a-z0-9-]+(-[a-z0-9-]+)*\.vercel\.app$/i.test(origin)) {
    // El API de clientes no debe aceptar previews. Staging sí.
    if (appEnv === "production") return false;
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
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use(cookieParser());
app.use(express.json());

app.use("/webhooks/whatsapp", whatsappWebhookRouter);

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "landing-backend",
    env: appEnv || process.env.NODE_ENV || "unknown",
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
          : "Configuración básica OK. Usa GET /health/ai/ping para probar una llamada real a Gemini.",
  });
});

/** Llama a Gemini de verdad (texto corto) para diagnosticar cuota/clave/red. */
app.get("/health/ai/ping", async (_req, res) => {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const skipAi = process.env.DATA_TREATMENT_SKIP_AI_VERIFY === "true";

  if (!apiKey) {
    res.status(503).json({
      ok: false,
      kind: "auth",
      detail: "Falta GEMINI_API_KEY",
    });
    return;
  }
  if (skipAi) {
    res.status(200).json({
      ok: false,
      kind: "skipped",
      detail: "DATA_TREATMENT_SKIP_AI_VERIFY=true",
    });
    return;
  }

  try {
    const result = await pingGemini(apiKey);
    res.status(result.ok ? 200 : 503).json(result);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    res.status(503).json({ ok: false, kind: "unknown", detail: detail.slice(0, 280) });
  }
});

app.get("/api/v1", (_req, res) => {
  res.status(200).json({
    message: "API backend funcionando",
  });
});

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/push", pushRouter);
app.use("/api/v1/users", usersRouter);
app.use(
  "/api/v1/users/:userId/documents",
  requireAuth,
  requireSelfUserParam({ allowAdmin: true }),
  documentsRouter,
);
app.use(
  "/api/v1/users/:userId/inspections",
  requireAuth,
  requireSelfUserParam({ allowAdmin: true }),
  inspectionsRouter,
);
app.use(
  "/api/v1/workshop/:userId",
  requireAuth,
  requireRole(UserType.WORKSHOP, UserType.ADMIN),
  requireSelfUserParam({ allowAdmin: true }),
  workshopPortalRouter,
);
app.use("/api/v1/vehicles", vehiclesRouter);
app.use("/api/v1/landing", landingRouter);
app.use("/api/v1/admin/landing", requireAuth, requireAdmin, landingAdminRouter);
app.use("/api/v1/admin/workshops", requireAuth, requireAdmin, adminWorkshopsRouter);
app.use("/api/v1/admin/inspections", requireAuth, requireAdmin, adminInspectionsRouter);

app.use("/api/v1/advisor/deliveries", advisorDeliveriesRouter);
app.use("/api/v1/analyst", analystApplicationsRouter);
app.use("/api/v1/delivery-confirm", deliveryConfirmationRouter);
app.use("/api/v1/account-setup", accountSetupRouter);

app.use(errorHandler);

export { app };
