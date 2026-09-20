import { Module } from '@nestjs/common';
import { MetadataController } from './metadata.controller';
import { MetadataService } from './metadata.service';
import { CoversModule } from '../covers/covers.module';

@Module({
  imports: [CoversModule],
  controllers: [MetadataController],
  providers: [MetadataService],
})
export class MetadataModule {}
