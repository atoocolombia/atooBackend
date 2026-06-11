import { Prisma } from "@prisma/client";
import type { ErrorRequestHandler } from "express";
import { platformMessage } from "../lib/userFacingMessage.js";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2025") {
      res.status(404).json({ error: "Registro no encontrado" });
      return;
    }
    if (err.code === "P2002") {
      const field = (err.meta?.target as string[] | undefined)?.join(", ") ?? "campo único";
      res.status(409).json({ error: "Ya existe un registro con ese valor", field });
      return;
    }
    /** Tabla o columna ausente: suele ser migración de BD no aplicada. */
    if (err.code === "P2021" || err.code === "P2022") {
      res.status(503).json({
        error: platformMessage(
          "La base de datos no está al día. En la carpeta backend ejecuta: npm run db:migrate (o npm run db:migrate:deploy en producción) y reinicia el servidor.",
        ),
      });
      return;
    }
  }

  res.status(500).json({
    error: platformMessage("Tuvimos un problema en el sistema. Inténtalo de nuevo más tarde."),
  });
};
