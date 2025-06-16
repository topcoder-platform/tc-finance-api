import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { TaxFormRepository } from '../repository/taxForm.repo';
import { PaymentMethodRepository } from '../repository/paymentMethod.repo';
import { IdentityVerificationRepository } from '../repository/identiti-verification.repo';

@Module({
  imports: [],
  controllers: [WalletController],
  providers: [
    WalletService,
    TaxFormRepository,
    PaymentMethodRepository,
    IdentityVerificationRepository,
  ],
})
export class WalletModule {}
