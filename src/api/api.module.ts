import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { HealthCheckController } from './health-check/healthCheck.controller';
import { AdminWinningController } from './admin-winning/adminWinning.controller';
import { AdminWinningService } from './admin-winning/adminWinning.service';
import { UserWinningController } from './user-winning/userWinning.controller';
import { WinningController } from './winning/winning.controller';
import { WinningService } from './winning/winning.service';
import { WalletController } from './wallet/wallet.controller';
import { WalletService } from './wallet/wallet.service';
import { GlobalProvidersModule } from 'src/shared/global/globalProviders.module';
import { APP_GUARD } from '@nestjs/core';
import { TokenValidatorMiddleware } from 'src/core/auth/middleware/tokenValidator.middleware';
import { AuthGuard, RolesGuard } from 'src/core/auth/guards';
import { TopcoderModule } from 'src/shared/topcoder/topcoder.module';
import { OriginRepository } from './repository/origin.repo';
import { TaxFormRepository } from './repository/taxForm.repo';
import { PaymentMethodRepository } from './repository/paymentMethod.repo';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [WebhooksModule, GlobalProvidersModule, TopcoderModule],
  controllers: [
    HealthCheckController,
    AdminWinningController,
    UserWinningController,
    WinningController,
    WalletController,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    AdminWinningService,
    WinningService,
    WalletService,
    OriginRepository,
    TaxFormRepository,
    PaymentMethodRepository,
  ],
})
export class ApiModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TokenValidatorMiddleware).forRoutes('*');
  }
}
