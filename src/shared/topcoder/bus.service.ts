import { HttpStatus, Injectable } from '@nestjs/common';
import { ENV_CONFIG } from 'src/config';
import { TopcoderM2MService } from './topcoder-m2m.service';
import { Logger } from '../global';

const { TOPCODER_API_BASE_URL } = ENV_CONFIG;

@Injectable()
export class TopcoderBusService {
  private readonly logger = new Logger(TopcoderBusService.name);

  constructor(private readonly m2MService: TopcoderM2MService) {}

  /**
   * Get Http client headers for Bus API
   * @return {Promise<Headers>} Headers for Bus API
   */
  private async getHeaders(): Promise<Headers> {
    try {
      const token = await this.m2MService.getToken();
      const headers = new Headers();
      headers.append('Authorization', `Bearer ${token}`);
      headers.append('Content-Type', 'application/json');
      return headers;
    } catch (err) {
      this.logger.error(`Error generating M2M token: ${err.message}`);
      throw new Error(`Bus API - Error generating M2M token: ${err.message}`);
    }
  }

  /**
   * Creates a new event in Bus API
   * Any errors will be logged
   * @param {string} topic The event topic, should be a dot-separated fully qualified name
   * @param {object} payload The payload, should be a JSON object
   * @return {Promise<void>}
   */
  async createEvent(topic: string, payload: any): Promise<void> {
    this.logger.debug(`Sending message to bus topic ${topic}`, {
      ...payload,
      data: {},
    });

    try {
      const headers = await this.getHeaders();
      const response = await fetch(`${TOPCODER_API_BASE_URL}/bus/events`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          topic,
          originator: 'tc-finance-api',
          timestamp: new Date().toISOString(),
          'mime-type': 'application/json',
          payload,
        }),
      });

      if (!response.ok) {
        this.logger.error(`Error sending event to bus-api for topic ${topic}`);
        const errorData = await response.json();
        this.logger.error(`Response data: ${JSON.stringify(errorData)}`);
        this.logger.error(`Response status: ${response.status}`);
      } else {
        this.logger.debug(`Sent event to bus-api for bus topic ${topic}`);
        this.logger.debug(`Response status: ${response.status}`);

        if (response.status !== (HttpStatus.NO_CONTENT as number)) {
          const responseData = await response.json();
          this.logger.debug(`Response data: ${JSON.stringify(responseData)}`);
        }
      }
    } catch (error) {
      this.logger.error(
        `Error sending event to bus-api for topic ${topic}: ${error.message}`,
      );
      throw error;
    }
  }
}
