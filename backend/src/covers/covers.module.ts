import { Module } from '@nestjs/common';
import { CoversController } from './covers.controller';
import { CoversService } from './covers.service';

@Module({
  controllers: [CoversController],
  providers: [CoversService],
  exports: [CoversService],
})
export class CoversModule {}
