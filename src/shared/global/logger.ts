import { Logger as NestLogger } from '@nestjs/common';
import stringify from 'json-stringify-safe';
import { getStore } from 'src/core/request/requestStore';

export class Logger extends NestLogger {
  private get store() {
    return getStore();
  }

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
    const requestIdPrefix = this.store.requestId
      ? [`{${this.store.requestId}}`]
      : [];
    return [...requestIdPrefix, ...messages]
      .map((msg) =>
        typeof msg === 'object' ? stringify(msg, null, 2) : String(msg),
      )
      .join(' ');
  }
}
