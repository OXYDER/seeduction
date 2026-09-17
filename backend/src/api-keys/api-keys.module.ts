import { Module } from '@nestjs/common';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';
import { ApiKeyGuard } from './api-key.guard';
import { PrismaService } from '../common/prisma.service';

@Module({
  controllers: [ApiKeysController],
  providers: [ApiKeysService, ApiKeyGuard, PrismaService],
  exports: [ApiKeysService, ApiKeyGuard],
})
export class ApiKeysModule {}
