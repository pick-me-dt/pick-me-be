import { PrismaClient } from '@prisma/client';
import { seed } from '../src/seed/seed';

const prisma = new PrismaClient();

seed(prisma)
  .then(() => console.log('seed done'))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
