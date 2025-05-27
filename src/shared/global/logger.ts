import { Logger as NestLogger } from '@nestjs/common';
import stringify from 'json-stringify-safe';

export class Logger extends NestLogger {
  log(...messages: any[]): void {
    super.log(this.formatMessages(messages));
  }

  debug(...messages: any[]): void {
    super.debug(this.formatMessages(messages));
  }

  info(...messages: any[]): void {
    super.log(this.formatMessages(messages)); // NestJS doesn't have a dedicated `info` method, so we use `log`.
  }

  error(...messages: any[]): void {
    super.error(this.formatMessages(messages));
  }

  private formatMessages(messages: any[]): string {
    return messages
      .map((msg) =>
        typeof msg === 'object' ? stringify(msg, null, 2) : String(msg),
      )
      .join(' ');
  }
}
