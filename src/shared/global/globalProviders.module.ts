import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { TrolleyService } from './trolley.service';
import { OtpService } from './otp.service';
import { TopcoderModule } from '../topcoder/topcoder.module';

// Global module for providing global providers
// Add any provider you want to be global here
@Global()
@Module({
  imports: [TopcoderModule],
  providers: [PrismaService, TrolleyService, OtpService],
  exports: [PrismaService, TrolleyService, OtpService],
})
export class GlobalProvidersModule {}
