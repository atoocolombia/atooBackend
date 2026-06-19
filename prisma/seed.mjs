import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 12);

/** Usuarios iniciales para entornos de demo / admin. Idempotente (upsert por email). */
const DEFAULT_USERS = [
  {
    id: '1234ADM',
    email: 'admin@gmail.com',
    password: '12345',
    userType: 'ADMIN',
  },
];

async function main() {
  for (const user of DEFAULT_USERS) {
    const passwordHash = await bcrypt.hash(user.password, BCRYPT_ROUNDS);
    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        passwordHash,
        userType: user.userType,
      },
      create: {
        id: user.id,
        email: user.email,
        passwordHash,
        userType: user.userType,
      },
    });
    console.log(`Usuario listo: ${user.email} (${user.userType})`);
  }
}

main()
  .catch((err) => {
    console.error('Error en seed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
