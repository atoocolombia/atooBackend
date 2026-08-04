import type { UserType } from "@prisma/client";

export type AuthUser = {
  id: string;
  email: string;
  userType: UserType;
};

declare global {
  namespace Express {
    interface Request {
      auth?: AuthUser;
    }
  }
}

export {};
