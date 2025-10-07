import cors from 'cors';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ApiModule } from './api/api.module';
import { AppModule } from './app.module';
import { PaymentProvidersModule } from './api/payment-providers/payment-providers.module';
import { WebhooksModule } from './api/webhooks/webhooks.module';
import { ENV_CONFIG } from './config';
import { AdminModule } from './api/admin/admin.module';
import { UserModule } from './api/user/user.module';
import { WalletModule } from './api/wallet/wallet.module';
import { WinningsModule } from './api/winnings/winnings.module';
import { WithdrawalModule } from './api/withdrawal/withdrawal.module';
import { Logger } from 'src/shared/global';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  const logger = new Logger('bootstrap()');

  // Global prefix for all routes
  app.setGlobalPrefix(ENV_CONFIG.API_BASE);

  // CORS related settings
  const allowedOrigins: Array<string | RegExp> = [
    'http://localhost:3000',
    /\.localhost:3000$/,
    ENV_CONFIG.TOPCODER_WALLET_URL,
    /^https:\/\/[\w-]+\.topcoder-dev\.com$/, // allow wallet-v6 and other subdomains
  ];

  const corsConfig: cors.CorsOptions = {
    allowedHeaders:
      'Origin, X-Requested-With, Content-Type, Accept, Authorization, Access-Control-Allow-Origin, Access-Control-Allow-Headers,currentOrg,overrideOrg,x-atlassian-cloud-id,x-api-key,x-orgid',
    credentials: true,
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      const isAllowed = allowedOrigins.some((allowedOrigin) =>
        allowedOrigin instanceof RegExp
          ? allowedOrigin.test(origin)
          : allowedOrigin === origin,
      );

      if (isAllowed) {
        callback(null, true);
        return;
      }

      logger.warn(`Blocked CORS origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    },
    methods: 'GET, POST, OPTIONS, PUT, DELETE, PATCH',
  };
  app.use(cors(corsConfig));

  // Add body parsers
  app.useBodyParser('json', { limit: '15mb' });
  app.useBodyParser('urlencoded', { limit: '15mb', extended: true });
  // Add the global validation pipe to auto-map and validate DTOs
  // Note that the whitelist option sanitizes input DTOs so only properties defined on the class are set
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Setup swagger
  // TODO: finish this and make it so this block only runs in non-prod
  const config = new DocumentBuilder()
    .setTitle('API')
    .setDescription('TC Payments API documentation')
    .setVersion('1.0')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      name: 'JWT',
      description: 'Enter JWT access token',
      in: 'header',
    })
    .build();
  const document = SwaggerModule.createDocument(app, config, {
    include: [
      ApiModule,
      AdminModule,
      UserModule,
      WinningsModule,
      WithdrawalModule,
      WalletModule,
      PaymentProvidersModule,
      WebhooksModule,
    ],
  });
  SwaggerModule.setup('/v6/finance/api-docs', app, document);

  // Add an event handler to log uncaught promise rejections and prevent the server from crashing
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });

  // Add an event handler to log uncaught errors and prevent the server from crashing
  process.on('uncaughtException', (error: Error) => {
    logger.error(
      `Unhandled Error at: ${error}\n` + `Exception origin: ${error.stack}`,
    );
  });

  await app.listen(ENV_CONFIG.PORT ?? 3000);
}

void bootstrap();
