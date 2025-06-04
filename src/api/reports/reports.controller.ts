import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { ResponseDto } from 'src/dto/api-response.dto';
import {
  PaymentsReportQueryDto,
  PaymentsReportResponse,
} from 'src/dto/reports.dto';

@ApiTags('Reports')
@Controller('/reports')
@ApiBearerAuth()
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('/payments')
  @ApiOperation({
    summary: 'Export search winnings result in csv file format',
    description: 'Roles: Payment Admin, Payment Editor, Payment Viewer',
  })
  @ApiQuery({
    type: PaymentsReportQueryDto,
  })
  @ApiResponse({
    status: 200,
    description: 'Export winnings successfully.',
    type: ResponseDto<PaymentsReportResponse>,
  })
  async getPaymentsReport(@Query() query: PaymentsReportQueryDto) {
    const report = await this.reportsService.getPaymentsReport(query);
    return report;
  }
}
