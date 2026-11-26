import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { WinningsRepository } from '../repository/winnings.repo';
import { TopcoderModule } from '../../shared/topcoder/topcoder.module';
import { PaymentsModule } from '../../shared/payments';
import { AccessControlModule } from '../../shared/access-control';

@Module({
  imports: [TopcoderModule, PaymentsModule, AccessControlModule],
  controllers: [AdminController],
  providers: [AdminService, WinningsRepository],
})
export class AdminModule {}
