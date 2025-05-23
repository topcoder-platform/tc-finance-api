import { Module } from '@nestjs/common';
import { PaymentsModule } from 'src/shared/payments';
import { WithdrawalController } from './withdrawal.controller';
import { WithdrawalService } from './withdrawal.service';
import { TaxFormRepository } from '../repository/taxForm.repo';
import { PaymentMethodRepository } from '../repository/paymentMethod.repo';
import { TopcoderModule } from 'src/shared/topcoder/topcoder.module';

@Module({
  imports: [PaymentsModule, TopcoderModule],
  controllers: [WithdrawalController],
  providers: [WithdrawalService, TaxFormRepository, PaymentMethodRepository],
})
export class WithdrawalModule {}
