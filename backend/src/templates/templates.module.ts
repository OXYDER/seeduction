import { Module } from '@nestjs/common';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';
import { PrismaService } from '../common/prisma.service';

@Module({
  controllers: [TemplatesController],
  providers: [TemplatesService, PrismaService],
})
export class TemplatesModule {}
