import { Module } from '@nestjs/common';
import { PaymentsModule } from 'src/shared/payments';
import { WithdrawalController } from './withdrawal.controller';
import { WithdrawalService } from './withdrawal.service';
import { TaxFormRepository } from '../repository/taxForm.repo';
import { PaymentMethodRepository } from '../repository/paymentMethod.repo';

@Module({
  imports: [PaymentsModule],
  controllers: [WithdrawalController],
  providers: [WithdrawalService, TaxFormRepository, PaymentMethodRepository],
})
export class WithdrawalModule {}
