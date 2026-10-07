import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { TorrentsModule } from '../torrents/torrents.module';
import { ImporterController } from './importer.controller';
import { ImporterService } from './importer.service';

@Module({
  imports: [TorrentsModule, AdminModule],
  controllers: [ImporterController],
  providers: [ImporterService],
})
export class ImporterModule {}
