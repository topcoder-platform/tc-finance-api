import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiOperation,
  ApiTags,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { Role } from 'src/core/auth/auth.constants';
import { Roles, User } from 'src/core/auth/decorators';

import { AdminWinningService } from './adminWinning.service';
import { UserInfo } from 'src/dto/user.dto';

import {
  ResponseStatusType,
  ResponseDto,
  WinningAuditDto,
  WinningRequestDto,
  SearchWinningResult,
  WinningUpdateRequestDto,
  AuditPayoutDto,
} from 'src/dto/adminWinning.dto';

import { stringify } from 'csv-stringify/sync';

@ApiTags('AdminWinning')
@Controller('/admin')
@ApiBearerAuth()
export class AdminWinningController {
  constructor(private readonly adminWinningService: AdminWinningService) {}

  @Post('/winnings/search')
  @Roles(Role.PaymentAdmin, Role.PaymentEditor, Role.PaymentViewer)
  @ApiOperation({
    summary: 'Search winnings with parameters',
    description: 'Roles: Payment Admin, Payment Editor, Payment Viewer',
  })
  @ApiBody({
    description: 'Winning request body',
    type: WinningRequestDto,
  })
  @ApiResponse({
    status: 200,
    description: 'Search winnings successfully.',
    type: ResponseDto<SearchWinningResult>,
  })
  @HttpCode(HttpStatus.OK)
  async searchWinnings(
    @Body() body: WinningRequestDto,
  ): Promise<ResponseDto<SearchWinningResult>> {
    const result = await this.adminWinningService.searchWinnings(body);
    if (result.error) {
      result.status = ResponseStatusType.ERROR;
    }

    result.status = ResponseStatusType.SUCCESS;

    return result;
  }

  @Post('/winnings/export')
  @Roles(Role.PaymentAdmin, Role.PaymentEditor, Role.PaymentViewer)
  @ApiOperation({
    summary: 'Export search winnings result in csv file format',
    description: 'Roles: Payment Admin, Payment Editor, Payment Viewer',
  })
  @ApiBody({
    description: 'Winning request body',
    type: WinningRequestDto,
  })
  @ApiResponse({
    status: 200,
    description: 'Export winnings successfully.',
    type: ResponseDto<SearchWinningResult>,
  })
  @HttpCode(HttpStatus.OK)
  async exportWinnings(@Body() body: WinningRequestDto, @Res() res: Response) {
    const result = await this.adminWinningService.searchWinnings(body);
    const csvRes = result.data.winnings.map((item) => {
      const payment =
        item.details && item.details.length > 0 ? item.details[0] : null;

      return {
        id: item.id,
        winnerId: item.winnerId,
        handle: 'admin mess', //current service does not have member service, we can not get member handle now
        origin: item.origin,
        category: item.category,
        title: item.title,
        description: item.description,
        externalId: item.externalId,
        status: payment?.status,
        totalAmount: payment?.totalAmount,
        datePaid: payment?.datePaid?.toISOString() ?? '',
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt?.toISOString() ?? '',
        releaseDate: item.releaseDate?.toISOString() ?? '',
      };
    });

    const output = stringify(csvRes, {
      header: true,
      columns: [
        { key: 'id', header: 'Winnings ID' },
        { key: 'winnerId', header: 'Winner ID' },
        { key: 'handle', header: 'Handle' },
        { key: 'origin', header: 'Origin' },
        { key: 'category', header: 'Category' },
        { key: 'title', header: 'Winnings ID' },
        { key: 'description', header: 'Winnings ID' },
        { key: 'externalId', header: 'External ID' },
        { key: 'status', header: 'Status' },
        { key: 'totalAmount', header: 'Total Amount' },
        { key: 'datePaid', header: 'Date Paid' },
        { key: 'createdAt', header: 'Created At' },
        { key: 'updatedAt', header: 'Updated At' },
        { key: 'releaseDate', header: 'Release Date' },
      ],
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="winnings.csv"');
    res.send(output);
  }

  @Patch('/winnings')
  @Roles(Role.PaymentAdmin, Role.PaymentEditor, Role.PaymentViewer)
  @ApiOperation({
    summary: 'Update winnings with given parameter',
    description:
      'User with role "Payment Admin", "Payment Editor" or "Payment Viewer" can access. \n paymentStatus, releaseDate and paymentAmount cannot be null at the same time.r',
  })
  @ApiResponse({
    status: 200,
    description: 'Update winning data successfully.',
    type: ResponseDto<string>,
  })
  async updateWinning(
    @Body() body: WinningUpdateRequestDto,
    @User() user: UserInfo,
  ): Promise<ResponseDto<string>> {
    if (!body.paymentAmount && !body.releaseDate && !body.paymentStatus) {
      throw new BadRequestException(
        'paymentStatus, releaseDate and paymentAmount cannot be null at the same time.',
      );
    }

    const result = await this.adminWinningService.updateWinnings(body, user.id);
    if (result.error) {
      result.status = ResponseStatusType.ERROR;
    }

    result.status = ResponseStatusType.SUCCESS;

    return result;
  }

  @Get('/winnings/:winningID/audit')
  @Roles(Role.PaymentAdmin, Role.PaymentEditor, Role.PaymentViewer)
  @ApiOperation({
    summary: 'List winning audit logs with given winning id',
    description: 'Roles: Payment Admin, Payment Editor, Payment Viewer',
  })
  @ApiParam({
    name: 'winningID',
    description: 'The ID of the winning',
    example: '2ccba36d-8db7-49da-94c9-b6c5b7bf47fb',
  })
  @ApiResponse({
    status: 200,
    description: 'List winning audit logs successfully.',
    type: ResponseDto<WinningAuditDto[]>,
  })
  async getWinningAudit(
    @Param('winningID') winningId: string,
  ): Promise<ResponseDto<WinningAuditDto[]>> {
    const result = await this.adminWinningService.getWinningAudit(winningId);
    if (result.error) {
      result.status = ResponseStatusType.ERROR;
    }

    result.status = ResponseStatusType.SUCCESS;

    return result;
  }

  @Get('/winnings/:winningID/audit-payout')
  @Roles(Role.PaymentAdmin, Role.PaymentEditor, Role.PaymentViewer)
  @ApiOperation({
    summary: 'Fetch winnings payout audit logs with given winning id.',
    description:
      'User with role "Payment Admin", "Payment Editor" or "Payment Viewer" can access.',
  })
  @ApiParam({
    name: 'winningID',
    description: 'The ID of the winning',
    example: '2ccba36d-8db7-49da-94c9-b6c5b7bf47fb',
  })
  @ApiResponse({
    status: 200,
    description: 'List winning payout audit logs successfully.',
    type: ResponseDto<AuditPayoutDto[]>,
  })
  async getWinningAuditPayout(
    @Param('winningID') winningId: string,
  ): Promise<ResponseDto<AuditPayoutDto[]>> {
    const result =
      await this.adminWinningService.getWinningAuditPayout(winningId);
    if (result.error) {
      result.status = ResponseStatusType.ERROR;
    }

    result.status = ResponseStatusType.SUCCESS;

    return result;
  }
}
