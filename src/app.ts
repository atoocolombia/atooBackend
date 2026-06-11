import cors from "cors";
import express from "express";
import { errorHandler } from "./middleware/errorHandler.js";
import { authRouter } from "./routes/auth.js";
import { documentsRouter } from "./routes/documents.js";
import { usersRouter } from "./routes/users.js";
import { vehiclesRouter } from "./routes/vehicles.js";

const app = express();

const clientOrigins = (process.env.CLIENT_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const allowLocalhostDev =
  process.env.NODE_ENV !== "production" && process.env.CORS_ALLOW_LOCALHOST !== "false";

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (clientOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      if (
        allowLocalhostDev &&
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)
      ) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
  }),
);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "landing-backend",
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
app.use("/api/v1/vehicles", vehiclesRouter);

app.use(errorHandler);

export { app };
