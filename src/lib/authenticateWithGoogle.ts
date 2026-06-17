import { Prisma, UserType } from "@prisma/client";
import { generateMixedId } from "./generateMixedId.js";
import { prisma } from "./prisma.js";
import { verifyGoogleIdToken } from "./verifyGoogleIdToken.js";

const userSelect = {
  id: true,
  email: true,
  userType: true,
  createdAt: true,
} as const;

export async function authenticateWithGoogle(
  credential: string,
  userType: UserType = UserType.USER,
): Promise<Prisma.UserGetPayload<{ select: typeof userSelect }>> {
  const { googleId, email } = await verifyGoogleIdToken(credential);

  const byGoogle = await prisma.user.findUnique({
    where: { googleId },
    select: userSelect,
  });
  if (byGoogle) {
    return byGoogle;
  }

  const byEmail = await prisma.user.findUnique({
    where: { email },
    select: { ...userSelect, googleId: true },
  });

  if (byEmail) {
    if (byEmail.googleId && byEmail.googleId !== googleId) {
      throw new Error("Este correo ya está asociado a otra cuenta de Google");
    }
    return prisma.user.update({
      where: { email },
      data: { googleId },
      select: userSelect,
    });
  }

  for (let attempt = 0; attempt < 15; attempt++) {
    try {
      return await prisma.user.create({
        data: {
          id: generateMixedId(),
          email,
          googleId,
          userType,
        },
        select: userSelect,
      });
    } catch (err) {
      const isIdCollision =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        Array.isArray(err.meta?.target) &&
        (err.meta.target as string[]).includes("id");
      if (!isIdCollision || attempt === 14) {
        throw err;
      }
    }
  }

  throw new Error("No se pudo crear el usuario");
}
