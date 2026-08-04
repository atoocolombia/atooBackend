import type { UserType } from "@prisma/client";
import type { CookieOptions, Response } from "express";
import jwt from "jsonwebtoken";

export const AUTH_COOKIE_NAME = "atoo_token";
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

export type AuthTokenPayload = {
  sub: string;
  email: string;
  userType: UserType;
};

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (secret) return secret;
  console.warn(
    "[auth] JWT_SECRET no está configurado. Define una clave fuerte en Railway para producción.",
  );
  return "atoo-dev-jwt-secret-change-me";
}

export function signAuthToken(user: {
  id: string;
  email: string;
  userType: UserType;
}): string {
  const payload: AuthTokenPayload = {
    sub: user.id,
    email: user.email,
    userType: user.userType,
  };
  return jwt.sign(payload, jwtSecret(), { expiresIn: SESSION_TTL_SECONDS });
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  const decoded = jwt.verify(token, jwtSecret());
  if (!decoded || typeof decoded !== "object") {
    throw new Error("Token inválido");
  }
  const sub = typeof decoded.sub === "string" ? decoded.sub : "";
  const email = typeof (decoded as { email?: unknown }).email === "string"
    ? (decoded as { email: string }).email
    : "";
  const userType = (decoded as { userType?: unknown }).userType;
  if (!sub || !email || typeof userType !== "string") {
    throw new Error("Token incompleto");
  }
  return {
    sub,
    email,
    userType: userType as UserType,
  };
}

export function authCookieOptions(): CookieOptions {
  const crossSite = process.env.AUTH_COOKIE_SAMESITE?.toLowerCase() === "none"
    || process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    secure: crossSite || process.env.NODE_ENV === "production",
    sameSite: crossSite ? "none" : "lax",
    maxAge: SESSION_TTL_SECONDS * 1000,
    path: "/",
  };
}

export function setAuthCookie(
  res: Response,
  user: { id: string; email: string; userType: UserType },
): string {
  const token = signAuthToken(user);
  res.cookie(AUTH_COOKIE_NAME, token, authCookieOptions());
  return token;
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE_NAME, {
    ...authCookieOptions(),
    maxAge: 0,
  });
}

export function publicUserDto(user: {
  id: string;
  email: string;
  userType: UserType;
  createdAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    userType: user.userType,
    createdAt: user.createdAt,
  };
}
