import {
  Controller,
  Post,
  BadRequestException,
  Req,
  RawBodyRequest,
  InternalServerErrorException,
  ConflictException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TrolleyService } from './trolley.service';
import { Public } from 'src/core/auth/decorators';

@Public()
@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
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
   * @throws {BadRequestException} If the signature is invalid or the webhook has already been processed.
   */
  @Post('trolley')
  async handleTrolleyWebhook(@Req() request: RawBodyRequest<Request>) {
    if (
      !this.trolleyService.validateSignature(
        request.headers,
        request.rawBody?.toString('utf-8') ?? '',
      )
    ) {
      throw new BadRequestException('Missing or invalid signature!');
    }

    if (!(await this.trolleyService.validateUnique(request.headers))) {
      throw new ConflictException('Webhook already processed!');
    }

    try {
      return this.trolleyService.handleEvent(request.headers, request.body);
    } catch (e) {
      console.log('Error processing the webhook!', e);
      throw new InternalServerErrorException('Error processing the webhook!');
    }
  }
}
