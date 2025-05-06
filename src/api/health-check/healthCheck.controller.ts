import {
  Controller,
  Get,
  Logger,
  Version,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Public } from 'src/core/auth/decorators';
import { PrismaService } from 'src/shared/global/prisma.service';

export enum HealthCheckStatus {
  healthy = 'healthy',
  unhealthy = 'unhealthy',
}

export class GetHealthCheckResponseDto {
  @ApiProperty({
    description: 'The status of the health check',
    enum: HealthCheckStatus,
    example: HealthCheckStatus.healthy,
  })
  status: HealthCheckStatus;

  @ApiProperty({
    description: 'Database connection status',
    example: 'Connected',
  })
  database: string;
}

@ApiTags('Healthcheck')
@Controller()
export class HealthCheckController {
  private readonly logger = new Logger(HealthCheckController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Version([VERSION_NEUTRAL, '1'])
  @Get('/healthcheck')
  @ApiOperation({ summary: 'Execute a health check' })
  async healthCheck(): Promise<GetHealthCheckResponseDto> {
    const response = new GetHealthCheckResponseDto();

    try {
      await this.prisma.otp.findFirst({
        select: {
          id: true,
        },
      });

      response.status = HealthCheckStatus.healthy;
      response.database = 'connected';
    } catch (error) {
      this.logger.error('Health check failed', error);
      response.status = HealthCheckStatus.unhealthy;
    }

    return response;
  }
}
