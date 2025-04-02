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

@Module({
  imports: [GlobalProvidersModule, TopcoderModule],
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
  ],
})
export class ApiModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TokenValidatorMiddleware).forRoutes('*');
  }
}
