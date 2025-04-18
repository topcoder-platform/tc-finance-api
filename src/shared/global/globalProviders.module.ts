import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { TrolleyService } from './trolley.service';

// Global module for providing global providers
// Add any provider you want to be global here
@Global()
@Module({
  providers: [PrismaService, TrolleyService],
  exports: [PrismaService, TrolleyService],
})
export class GlobalProvidersModule {}
