import {
  Controller,
  Post,
  Req,
  RawBodyRequest,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TrolleyHeaders, TrolleyService } from './trolley/trolley.service';
import { Public } from 'src/core/auth/decorators';

@Public()
@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private readonly trolleyService: TrolleyService) {}

  /**
   * Handles incoming trolley webhooks.
   *
   * This method validates the webhook request by checking its signature and ensuring
   * it has not been processed before. If validation passes, it processes the webhook
   * payload and marks it as processed.
   *
   * @param request - The incoming webhook request containing headers, raw body, and parsed body.
   * @returns A success message if the webhook is processed successfully.
   * @throws {ForbiddenException} If the signature is invalid or the webhook has already been processed.
   */
  @Post('trolley')
  async handleTrolleyWebhook(@Req() request: RawBodyRequest<Request>) {
    if (
      !this.trolleyService.validateSignature(
        request.headers,
        request.rawBody?.toString('utf-8') ?? '',
      )
    ) {
      this.logger.warn(
        'Received request with missing or invalid signature!',
        request.headers,
      );
      throw new ForbiddenException('Missing or invalid signature!');
    }

    // do not proceed any further if event has already been processed
    if (!(await this.trolleyService.validateUnique(request.headers))) {
      this.logger.warn(
        `Webhook event '${request.headers[TrolleyHeaders.id]}' has already been processed!`,
      );
      return;
    }

    return this.trolleyService.handleEvent(request.headers, request.body);
  }
}
