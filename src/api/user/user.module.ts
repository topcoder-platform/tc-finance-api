import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { WinningsRepository } from '../repository/winnings.repo';
import { PaymentsModule } from 'src/shared/payments';

@Module({
  imports: [PaymentsModule],
  controllers: [UserController],
  providers: [WinningsRepository],
})
export class UserModule {}
