import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { jwtSecret } from '../common/utils/secret';
import { StreamModule } from '../stream/stream.module';
import { TorrentsModule } from '../torrents/torrents.module';
import { VodController } from './vod.controller';
import { VodService } from './vod.service';

@Module({
  imports: [JwtModule.register({ secret: jwtSecret(), signOptions: { expiresIn: '7d' } }), StreamModule, TorrentsModule],
  controllers: [VodController],
  providers: [VodService],
})
export class VodModule {}
