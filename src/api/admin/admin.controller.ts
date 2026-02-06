import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Header,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiTags,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { stringify } from 'csv-stringify/sync';

import { TopcoderMembersService } from 'src/shared/topcoder/members.service';
import { Role } from 'src/core/auth/auth.constants';
import { Roles, User } from 'src/core/auth/decorators';

import { AdminService } from './admin.service';
import { ResponseDto, ResponseStatusType } from 'src/dto/api-response.dto';
import { WinningAuditDto, AuditPayoutDto } from './dto/audit.dto';

import { WinningRequestDto, SearchWinningResult } from 'src/dto/winning.dto';
import { WinningsRepository } from '../repository/winnings.repo';
import { WinningUpdateRequestDto } from './dto/winnings.dto';
import { AccessControlService } from 'src/shared/access-control';

@ApiTags('AdminWinnings')
@Controller('/admin')
@ApiBearerAuth()
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly winningsRepo: WinningsRepository,
    private readonly tcMembersService: TopcoderMembersService,
    private readonly accessControlService: AccessControlService,
  ) {}

  @Post('/winnings/search')
  @Roles(
    Role.PaymentAdmin,
    Role.PaymentBaAdmin,
    Role.EngagementPaymentApprover,
    Role.PaymentEditor,
    Role.PaymentViewer,
  )
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
    @User() user: any,
  ): Promise<ResponseDto<SearchWinningResult>> {
    const filters =
      await this.accessControlService.applyFilters<WinningRequestDto>(
        user.id,
        user.roles,
        body,
      );

    const result = await this.winningsRepo.searchWinnings(filters);

    if (result.error) {
      result.status = ResponseStatusType.ERROR;
    }

    result.status = ResponseStatusType.SUCCESS;

    return result;
  }

  @Post('/winnings/export')
  @Roles(
    Role.PaymentAdmin,
    Role.PaymentBaAdmin,
    Role.EngagementPaymentApprover,
    Role.PaymentEditor,
    Role.PaymentViewer,
  )
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
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="winnings.csv"')
  async exportWinnings(@Body() body: WinningRequestDto, @User() user: any) {
    const filters =
      await this.accessControlService.applyFilters<WinningRequestDto>(
        user.id,
        user.roles,
        {
          ...body,
          limit: 999,
        },
      );
    const result = await this.winningsRepo.searchWinnings(filters);

    const handles = await this.tcMembersService.getHandlesByUserIds(
      result.data.winnings.map((d) => d.winnerId),
    );

    const csvRes = result.data.winnings.map((item) => {
      const payment =
        item.details && item.details.length > 0 ? item.details[0] : null;

      return {
        id: item.id,
        winnerId: item.winnerId,
        handle: handles[`${item.winnerId}`] ?? item.winnerId,
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
        billingAccount: payment?.billingAccount,
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
        { key: 'title', header: 'Title' },
        { key: 'description', header: 'Description' },
        { key: 'externalId', header: 'External ID' },
        { key: 'status', header: 'Status' },
        { key: 'totalAmount', header: 'Total Amount' },
        { key: 'datePaid', header: 'Date Paid' },
        { key: 'createdAt', header: 'Created At' },
        { key: 'updatedAt', header: 'Updated At' },
        { key: 'releaseDate', header: 'Release Date' },
        { key: 'billingAccount', header: 'Billing Account' },
      ],
    });

    return output;
  }

  @Patch('/winnings')
  @Roles(
    Role.PaymentAdmin,
    Role.PaymentBaAdmin,
    Role.EngagementPaymentApprover,
    Role.PaymentEditor,
  )
  @ApiOperation({
    summary: 'Update winnings with given parameter',
    description:
      'User with role "Payment Admin" or "Payment Editor" can access. \n paymentStatus, releaseDate and paymentAmount cannot be null at the same time.r',
  })
  @ApiResponse({
    status: 200,
    description: 'Update winning data successfully.',
    type: ResponseDto<string>,
  })
  async updateWinning(
    @Body() body: WinningUpdateRequestDto,
    @User() user: any,
  ): Promise<ResponseDto<string>> {
    if (
      !body.paymentAmount &&
      !body.releaseDate &&
      !body.paymentStatus &&
      !body.description
    ) {
      throw new BadRequestException(
        'description, paymentStatus, releaseDate and paymentAmount cannot be null at the same time.',
      );
    }

    const result = await this.adminService.updateWinnings(
      body,
      user.id,
      user.roles,
    );

    result.status = ResponseStatusType.SUCCESS;
    if (result.error) {
      result.status = ResponseStatusType.ERROR;
    }

    return result;
  }

  @Get('/winnings/:winningID/audit')
  @Roles(
    Role.PaymentAdmin,
    Role.PaymentBaAdmin,
    Role.EngagementPaymentApprover,
    Role.PaymentEditor,
    Role.PaymentViewer,
  )
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
    @User() user: any,
  ): Promise<ResponseDto<WinningAuditDto[]>> {
    await this.adminService.verifyUserAccessToWinning(
      winningId,
      user.id,
      user.roles,
    );

    const result = await this.adminService.getWinningAudit(winningId);

    result.status = ResponseStatusType.SUCCESS;
    if (result.error) {
      result.status = ResponseStatusType.ERROR;
    }

    return result;
  }

  @Get('/winnings/:winningID/audit-payout')
  @Roles(
    Role.PaymentAdmin,
    Role.PaymentBaAdmin,
    Role.EngagementPaymentApprover,
    Role.PaymentEditor,
    Role.PaymentViewer,
  )
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
    @User() user: any,
  ): Promise<ResponseDto<AuditPayoutDto[]>> {
    await this.adminService.verifyUserAccessToWinning(
      winningId,
      user.id,
      user.roles,
    );

    const result = await this.adminService.getWinningAuditPayout(winningId);

    result.status = ResponseStatusType.SUCCESS;
    if (result.error) {
      result.status = ResponseStatusType.ERROR;
    }

    return result;
  }
}
