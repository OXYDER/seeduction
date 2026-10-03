import { Module } from '@nestjs/common';
import { EntitiesController } from './entities.controller';
import { EntitiesService } from './entities.service';

@Module({
  controllers: [EntitiesController],
  providers: [EntitiesService],
})
export class EntitiesModule {}
