import { Injectable } from '@nestjs/common';
import { createBusApiClient, type BusApiClient } from 'tc-core-library-js';
import { ENV_CONFIG } from 'src/config';
import { TopcoderM2MService } from './topcoder-m2m.service';

/** Publishes finance events through the shared bus client using the service M2M identity. */
@Injectable()
export class TopcoderBusService {
  private readonly client: BusApiClient;

  /** Accepts the token provider and constructs a publisher; throws for an invalid configured endpoint. */
  constructor(m2MService: TopcoderM2MService) {
    this.client = createBusApiClient({
      BUSAPI_URL: ENV_CONFIG.TOPCODER_API_V6_BASE_URL,
      getToken: () => m2MService.getToken(),
    });
  }

  /** Publishes topic/payload and resolves on acceptance; throws on token or publication failures. */
  async createEvent(topic: string, payload: unknown): Promise<void> {
    await this.client.postEvent({
      topic,
      payload,
      originator: 'tc-finance-api',
      timestamp: new Date().toISOString(),
      'mime-type': 'application/json',
    });
  }
}
