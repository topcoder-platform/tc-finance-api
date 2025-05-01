import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { TaxFormRepository } from '../repository/taxForm.repo';
import { PaymentMethodRepository } from '../repository/paymentMethod.repo';
import { WinningsRepository } from '../repository/winnings.repo';
import { TopcoderModule } from 'src/shared/topcoder/topcoder.module';
import { PaymentsService } from 'src/shared/payments';

@Module({
  imports: [TopcoderModule, PaymentsService],
  controllers: [AdminController],
  providers: [
    AdminService,
    TaxFormRepository,
    PaymentMethodRepository,
    WinningsRepository,
  ],
})
export class AdminModule {}
