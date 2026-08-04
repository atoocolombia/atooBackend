import { UserType } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import {
  AUTH_COOKIE_NAME,
  verifyAuthToken,
  type AuthTokenPayload,
} from "../lib/authTokens.js";

function readBearerToken(req: Request): string | null {
  const header = req.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

function readToken(req: Request): string | null {
  const cookieToken = (req as Request & { cookies?: Record<string, string> }).cookies?.[AUTH_COOKIE_NAME];
  if (typeof cookieToken === "string" && cookieToken.trim()) {
    return cookieToken.trim();
  }
  return readBearerToken(req);
}

function attachAuth(req: Request, payload: AuthTokenPayload): void {
  req.auth = {
    id: payload.sub,
    email: payload.email,
    userType: payload.userType,
  };
}

/** Adjunta usuario si hay cookie/Bearer válido; no falla si no hay sesión. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  try {
    const token = readToken(req);
    if (token) {
      attachAuth(req, verifyAuthToken(token));
    }
  } catch {
    // Token inválido: continuar sin sesión.
  }
  next();
}

/** Exige sesión JWT válida (cookie HttpOnly o Authorization Bearer). */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  try {
    const token = readToken(req);
    if (!token) {
      res.status(401).json({ error: "Debes iniciar sesión para continuar" });
      return;
    }
    attachAuth(req, verifyAuthToken(token));
    next();
  } catch {
    res.status(401).json({ error: "Sesión inválida o expirada. Vuelve a iniciar sesión." });
  }
}

export function requireRole(...roles: UserType[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: "Debes iniciar sesión para continuar" });
      return;
    }
    if (!roles.includes(req.auth.userType)) {
      res.status(403).json({ error: "No tienes permisos para esta acción" });
      return;
    }
    next();
  };
}

/**
 * Exige que el :userId de la ruta coincida con el usuario autenticado.
 * ADMIN puede consultar/actuar en nombre de otro usuario solo si se pasa allowAdmin.
 */
export function requireSelfUserParam(options: { allowAdmin?: boolean } = {}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: "Debes iniciar sesión para continuar" });
      return;
    }
    const raw = req.params.userId;
    const userId = Array.isArray(raw) ? raw[0] ?? "" : raw ?? "";
    if (!userId) {
      res.status(400).json({ error: "Falta el identificador de usuario" });
      return;
    }
    if (req.auth.id === userId) {
      next();
      return;
    }
    if (options.allowAdmin && req.auth.userType === UserType.ADMIN) {
      next();
      return;
    }
    res.status(403).json({ error: "No puedes acceder a datos de otro usuario" });
  };
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth) {
    res.status(401).json({ error: "Inicia sesión como administrador para continuar" });
    return;
  }
  if (req.auth.userType !== UserType.ADMIN) {
    res.status(403).json({ error: "Solo administradores pueden realizar esta acción" });
    return;
  }
  next();
}
