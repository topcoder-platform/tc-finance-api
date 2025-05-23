import { Module } from '@nestjs/common';
import { WinningsController } from './winnings.controller';
import { WinningsService } from './winnings.service';
import { OriginRepository } from '../repository/origin.repo';
import { WinningsRepository } from '../repository/winnings.repo';
import { TaxFormRepository } from '../repository/taxForm.repo';
import { PaymentMethodRepository } from '../repository/paymentMethod.repo';

@Module({
  imports: [],
  controllers: [WinningsController],
  providers: [
    WinningsService,
    OriginRepository,
    TaxFormRepository,
    WinningsRepository,
    PaymentMethodRepository,
  ],
})
export class WinningsModule {}
