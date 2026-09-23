import { Module } from '@nestjs/common';
import { MetadataController } from './metadata.controller';
import { MetadataService } from './metadata.service';
import { TranslateService } from './translate.service';
import { CoversModule } from '../covers/covers.module';
import { PrismaService } from '../common/prisma.service';

@Module({
  imports: [CoversModule],
  controllers: [MetadataController],
  providers: [MetadataService, TranslateService, PrismaService],
  exports: [MetadataService],
})
export class MetadataModule {}
