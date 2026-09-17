import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { PublicApiController } from './public-api.controller';
import { PublicApiService } from './public-api.service';
import { PrismaService } from '../common/prisma.service';
import { ApiKeysModule } from '../api-keys/api-keys.module';

@Module({
  // Import local (plutôt que de dépendre du ThrottlerModule global) pour que
  // ThrottlerGuard soit résoluble ici sans hypothèse sur la portée globale
  // du module racine — ce compteur est de toute façon indépendant.
  imports: [ApiKeysModule, ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }])],
  controllers: [PublicApiController],
  providers: [PublicApiService, PrismaService],
})
export class PublicApiModule {}
