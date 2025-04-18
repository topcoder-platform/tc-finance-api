import cors from 'cors';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ApiModule } from './api/api.module';
import { AppModule } from './app.module';
import { PaymentProvidersModule } from './api/payment-providers/payment-providers.module';
import { WebhooksModule } from './api/webhooks/webhooks.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  // Global prefix for all routes is configured as `/v5/finance`
  app.setGlobalPrefix(process.env.API_BASE ?? '/v5/finance');

  // CORS related settings
  const corsConfig: cors.CorsOptions = {
    allowedHeaders:
      'Origin, X-Requested-With, Content-Type, Accept, Authorization, Access-Control-Allow-Origin, Access-Control-Allow-Headers,currentOrg,overrideOrg,x-atlassian-cloud-id,x-api-key,x-orgid',
    credentials: true,
    // origin: process.env.CORS_ALLOWED_ORIGIN
    //   ? new RegExp(process.env.CORS_ALLOWED_ORIGIN)
    //   : ['http://localhost:3000', /\.localhost:3000$/],
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
    include: [ApiModule, PaymentProvidersModule, WebhooksModule],
  });
  SwaggerModule.setup('/v5/finance/api-docs', app, document);

  // Add an event handler to log uncaught promise rejections and prevent the server from crashing
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });

  // Add an event handler to log uncaught errors and prevent the server from crashing
  process.on('uncaughtException', (error: Error) => {
    console.error(
      `Unhandled Error at: ${error}\n` + `Exception origin: ${error.stack}`,
    );
  });

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
