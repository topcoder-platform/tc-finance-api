import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { HealthCheckController } from './health-check/healthCheck.controller';
import { GlobalProvidersModule } from 'src/shared/global/globalProviders.module';
import { APP_GUARD } from '@nestjs/core';
import { TokenValidatorMiddleware } from 'src/core/auth/middleware/tokenValidator.middleware';
import { CreateRequestStoreMiddleware } from 'src/core/request/createRequestStore.middleware';
import { AuthGuard, RolesGuard } from 'src/core/auth/guards';
import { TopcoderModule } from 'src/shared/topcoder/topcoder.module';
import { OriginRepository } from './repository/origin.repo';
import { TaxFormRepository } from './repository/taxForm.repo';
import { PaymentMethodRepository } from './repository/paymentMethod.repo';
import { WinningsRepository } from './repository/winnings.repo';
import { WebhooksModule } from './webhooks/webhooks.module';
import { PaymentProvidersModule } from './payment-providers/payment-providers.module';
import { AdminModule } from './admin/admin.module';
import { WinningsModule } from './winnings/winnings.module';
import { UserModule } from './user/user.module';
import { WalletModule } from './wallet/wallet.module';
import { WithdrawalModule } from './withdrawal/withdrawal.module';
import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [
    GlobalProvidersModule,
    TopcoderModule,
    PaymentProvidersModule,
    WebhooksModule,
    AdminModule,
    WinningsModule,
    UserModule,
    WalletModule,
    WithdrawalModule,
    ReportsModule,
  ],
  controllers: [HealthCheckController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    OriginRepository,
    TaxFormRepository,
    PaymentMethodRepository,
    WinningsRepository,
  ],
})
export class ApiModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TokenValidatorMiddleware).forRoutes('*');
    consumer.apply(CreateRequestStoreMiddleware).forRoutes('*');
  }
}
