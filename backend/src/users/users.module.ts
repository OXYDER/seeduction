import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { PrismaService } from '../common/prisma.service';
import { FriendsModule } from '../friends/friends.module';
import { PresenceModule } from '../presence/presence.module';

@Module({
  imports: [FriendsModule, PresenceModule],
  controllers: [UsersController],
  providers: [UsersService, PrismaService],
  exports: [UsersService],
})
export class UsersModule {}
