import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * UNE seule connexion Prisma pour toute l'application. Avant, chaque module déclarait son propre PrismaService : une
 * quarantaine de clients, chacun avec son propre pool de connexions, ce qui saturait PostgreSQL (« too many clients already »).
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
