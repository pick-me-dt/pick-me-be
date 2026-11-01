import { PrismaClient } from '@prisma/client';
import { seed } from './seed';

/** 컴파일된 시드 실행기. Docker 컨테이너는 ts-node 없이 node dist/seed/run.js로 실행한다 */
const prisma = new PrismaClient();

seed(prisma)
  .then(() => console.log('seed done'))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
