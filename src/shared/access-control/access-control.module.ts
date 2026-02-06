import { Module } from '@nestjs/common';
import { AccessControlService } from 'src/shared/access-control/access-control.service';
import { PaymentBaProvider } from 'src/shared/access-control/payment-ba.provider';
import { EngagementPaymentApproverProvider } from 'src/shared/access-control/engagement-pa.provider';
import { Injectable } from '@nestjs/common';
import { TopcoderModule } from '../topcoder/topcoder.module';

@Injectable()
class AccessControlRegistrar {
  constructor(
    accessControlService: AccessControlService,
    paymentBaProvider: PaymentBaProvider,
    engagementPaymentApproverProvider: EngagementPaymentApproverProvider,
  ) {
    accessControlService.register(paymentBaProvider);
    accessControlService.register(engagementPaymentApproverProvider);
  }
}

@Module({
  imports: [TopcoderModule],
  controllers: [],
  providers: [
    AccessControlService,
    PaymentBaProvider,
    EngagementPaymentApproverProvider,
    AccessControlRegistrar,
  ],
  exports: [AccessControlService],
})
export class AccessControlModule {}
