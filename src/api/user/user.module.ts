import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { WinningsRepository } from '../repository/winnings.repo';

@Module({
  imports: [],
  controllers: [UserController],
  providers: [WinningsRepository],
})
export class UserModule {}
