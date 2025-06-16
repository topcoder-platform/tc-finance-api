import { Module } from '@nestjs/common';
import { WinningsController } from './winnings.controller';
import { WinningsService } from './winnings.service';
import { OriginRepository } from '../repository/origin.repo';
import { WinningsRepository } from '../repository/winnings.repo';
import { TaxFormRepository } from '../repository/taxForm.repo';
import { PaymentMethodRepository } from '../repository/paymentMethod.repo';
import { TopcoderModule } from 'src/shared/topcoder/topcoder.module';
import { IdentityVerificationRepository } from '../repository/identiti-verification.repo';

@Module({
  imports: [TopcoderModule],
  controllers: [WinningsController],
  providers: [
    WinningsService,
    OriginRepository,
    TaxFormRepository,
    WinningsRepository,
    PaymentMethodRepository,
    IdentityVerificationRepository,
  ],
})
export class WinningsModule {}
