import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { PublicApiController } from './public-api.controller';
import { PublicApiService } from './public-api.service';
import { ApiKeysModule } from '../api-keys/api-keys.module';

@Module({
  // Import local (plutôt que de dépendre du ThrottlerModule global) pour que
  // ThrottlerGuard soit résoluble ici sans hypothèse sur la portée globale
  // du module racine — la limite de 60 par minute de cette API est fixée sur le contrôleur (@Throttle). Les options du module sont globales : elles doivent rester identiques à celles de app.module.ts.
  imports: [ApiKeysModule, ThrottlerModule.forRoot([{ ttl: 60_000, limit: Number(process.env.API_RATE_LIMIT) || 1500 }])],
  controllers: [PublicApiController],
  providers: [PublicApiService],
})
export class PublicApiModule {}
