import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient<
    Prisma.PrismaClientOptions,
    'query' | 'info' | 'warn' | 'error'
  >
  implements OnModuleInit
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { level: 'query', emit: 'event' },
        { level: 'info', emit: 'event' },
        { level: 'warn', emit: 'event' },
        { level: 'error', emit: 'event' },
      ],
    });

    // Setup logging for Prisma queries and errors
    this.$on('query' as never, (e: Prisma.QueryEvent) => {
      const queryTime = e.duration;

      // log slow queries (> 500ms)
      if (queryTime > 500) {
        this.logger.warn(
          `Slow query detected! Duration: ${queryTime}ms | Query: ${e.query}`,
        );
      }
    });

    this.$on('info' as never, (e: Prisma.LogEvent) => {
      this.logger.log(`Prisma Info: ${e.message}`);
    });

    this.$on('warn' as never, (e: Prisma.LogEvent) => {
      this.logger.warn(`Prisma Warning: ${e.message}`);
    });

    this.$on('error' as never, (e: Prisma.LogEvent) => {
      this.logger.error(`Prisma Error: ${e.message}`, e.target);
    });
  }

  async onModuleInit() {
    this.logger.log('Initializing Prisma connection');
    try {
      await this.$connect();
      this.logger.log('Prisma connected successfully');
    } catch (error) {
      this.logger.error(
        `Failed to connect to the database: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
