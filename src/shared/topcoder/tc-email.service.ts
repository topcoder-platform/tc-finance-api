import { Injectable, Logger } from '@nestjs/common';
import { ENV_CONFIG } from 'src/config';
import { TopcoderBusService } from './bus.service';

export interface EmailEventPayload {
  data: any;
  from?: {
    name: string;
    email?: string;
  };
}

@Injectable()
export class TopcoderEmailService {
  private readonly logger = new Logger(TopcoderEmailService.name);

  constructor(private readonly tcBusService: TopcoderBusService) {}

  /**
   * Sends an email using the specified SendGrid template and payload data.
   *
   * @param to - The recipient(s) of the email. Can be a single email address or an array of email addresses.
   * @param sendgridTemplateId - The ID of the SendGrid email template to use.
   * @param data - The payload data for the email, including dynamic template data and sender information.
   * @returns A promise that resolves when the email is successfully sent, or rejects with an error if the operation fails.
   *
   * @throws Will throw an error if the email sending process fails.
   */
  async sendEmail(
    to: string[] | string,
    sendgridTemplateId: string,
    data: EmailEventPayload,
  ): Promise<void> {
    const recipients = ([] as string[]).concat(to).flat();

    try {
      await this.tcBusService.createEvent(
        ENV_CONFIG.TC_EMAIL_NOTIFICATIONS_TOPIC,
        {
          ...data,
          recipients,
          sendgrid_template_id: sendgridTemplateId,
          version: 'v3',
          from: {
            name: data.from?.name ?? ENV_CONFIG.TC_EMAIL_FROM_NAME,
            email: data.from?.email ?? ENV_CONFIG.TC_EMAIL_FROM_EMAIL,
          },
        },
      );
      this.logger.debug(`Email sent to ${recipients.join(', ')} successfully!`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${recipients.join()}:`, error);
      throw error;
    }
  }
}
