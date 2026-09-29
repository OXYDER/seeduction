import { Module } from '@nestjs/common';
import { WikiController } from './wiki.controller';
import { WikiService } from './wiki.service';
import { PrismaService } from '../common/prisma.service';

@Module({
  controllers: [WikiController],
  providers: [WikiService, PrismaService],
})
export class WikiModule {}
