import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LockdownController } from './lockdown.controller';
import { LockdownService } from './lockdown.service';

@Module({
  imports: [AuthModule],
  controllers: [LockdownController],
  providers: [LockdownService],
})
export class LockdownModule {}
