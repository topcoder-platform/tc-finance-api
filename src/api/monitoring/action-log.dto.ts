import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export enum ActionLogType {
  STATUS_CHANGE = 'STATUS_CHANGE',
  AMOUNT_CHANGE = 'AMOUNT_CHANGE',
  RELEASE_DATE_CHANGE = 'RELEASE_DATE_CHANGE',
  DESCRIPTION_CHANGE = 'DESCRIPTION_CHANGE',
  OTHER = 'OTHER',
}

export const ACTION_LOG_MAX_DAYS = 90;

export class ActionLogQueryDto {
  @ApiPropertyOptional({
    description: `Only include actions made in the last N days. Defaults to ${ACTION_LOG_MAX_DAYS} (about three months), which is also the maximum.`,
    example: 30,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ACTION_LOG_MAX_DAYS)
  days?: number;
}

export class ActionLogEntryDto {
  @ApiProperty()
  auditId: string;

  @ApiProperty()
  actionedAt: Date;

  @ApiProperty({ description: 'User ID of the admin who made the change' })
  adminUserId: string;

  @ApiProperty({ enum: ActionLogType })
  actionType: ActionLogType;

  @ApiProperty({
    example: 'Modified payment status from ON_HOLD_ADMIN to OWED',
  })
  action: string;

  @ApiProperty({ nullable: true, description: 'Note entered by the admin' })
  note: string | null;

  @ApiProperty()
  winningId: string;

  @ApiProperty({ description: 'User ID of the member being paid' })
  winnerId: string;

  @ApiProperty()
  winningsType: string;

  @ApiProperty({ nullable: true })
  category: string | null;

  @ApiProperty({ nullable: true })
  title: string | null;

  @ApiProperty({ nullable: true, description: 'Challenge or engagement ID' })
  externalId: string | null;

  @ApiProperty({ nullable: true })
  paymentId: string | null;

  @ApiProperty({
    nullable: true,
    example: '250.00',
    description: 'Current total amount of the payment',
  })
  totalAmount: string | null;

  @ApiProperty({
    nullable: true,
    description: 'Current status of the payment',
  })
  paymentStatus: string | null;

  @ApiProperty({ nullable: true })
  releaseDate: Date | null;

  @ApiProperty({ nullable: true })
  datePaid: Date | null;
}
