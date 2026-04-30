import { Injectable, Module } from '@nestjs/common';
import { AccessControlService } from 'src/shared/access-control/access-control.service';
import { PaymentBaProvider } from 'src/shared/access-control/payment-ba.provider';
import { PaymentApproverProvider } from 'src/shared/access-control/payment-approver.provider';
import { WiproTaasAdminProvider } from 'src/shared/access-control/wipro-taas-admin.provider';
import { TopcoderModule } from '../topcoder/topcoder.module';

@Injectable()
class AccessControlRegistrar {
  constructor(
    accessControlService: AccessControlService,
    paymentBaProvider: PaymentBaProvider,
    paymentApproverProvider: PaymentApproverProvider,
    wiproTaasAdminProvider: WiproTaasAdminProvider,
  ) {
    accessControlService.register(paymentBaProvider);
    accessControlService.register(paymentApproverProvider);
    accessControlService.register(wiproTaasAdminProvider);
  }
}

@Module({
  imports: [TopcoderModule],
  controllers: [],
  providers: [
    AccessControlService,
    PaymentBaProvider,
    PaymentApproverProvider,
    WiproTaasAdminProvider,
    AccessControlRegistrar,
  ],
  exports: [AccessControlService],
})
export class AccessControlModule {}
