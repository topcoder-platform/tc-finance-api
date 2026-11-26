import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
} from 'class-validator';

import { WinningsCategory } from 'src/dto/winning.dto';

export enum ActionLogType {
  STATUS_CHANGE = 'STATUS_CHANGE',
  AMOUNT_CHANGE = 'AMOUNT_CHANGE',
  RELEASE_DATE_CHANGE = 'RELEASE_DATE_CHANGE',
  DESCRIPTION_CHANGE = 'DESCRIPTION_CHANGE',
  OTHER = 'OTHER',
}

export const ACTION_LOG_MAX_DAYS = 90;

/**
 * Where a payment comes from, as split in Wallet Admin. TaaS and Topgear
 * payments have their own category; every other category is Topcoder.
 */
export enum ActionLogPaymentSource {
  TOPCODER = 'TOPCODER',
  TAAS = 'TAAS',
  TOPGEAR = 'TOPGEAR',
}

/** Accepts `a,b`, `a&a` or `a[]=..` style query arrays. */
function toStringArray({ value }: { value: unknown }): unknown {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const values = Array.isArray(value) ? value : [value];
  return values
    .flatMap((item) => String(item).split(','))
    .map((item) => item.trim())
    .filter(Boolean);
}

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

  @ApiPropertyOptional({
    description: `Only include actions made at or after this date-time. Takes precedence over \`days\`. The range from \`dateFrom\` to \`dateTo\` (or now) can span at most ${ACTION_LOG_MAX_DAYS} days.`,
    example: '2026-10-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({
    description:
      'Only include actions made at or before this date-time. Defaults to now.',
    example: '2026-10-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({
    enum: ActionLogPaymentSource,
    description:
      'Only include actions on Topcoder, TaaS or Topgear payments. Omit for all payments.',
  })
  @IsOptional()
  @IsEnum(ActionLogPaymentSource)
  paymentSource?: ActionLogPaymentSource;

  @ApiPropertyOptional({
    enum: WinningsCategory,
    isArray: true,
    description:
      'Only include actions on payments of these categories (payment types). Comma separated or repeated.',
    example: [WinningsCategory.TASK_PAYMENT, WinningsCategory.CONTEST_PAYMENT],
  })
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @IsEnum(WinningsCategory, { each: true })
  categories?: WinningsCategory[];

  @ApiPropertyOptional({
    description: 'Only include actions made by this admin user ID.',
    example: '88774634',
  })
  @IsOptional()
  @Matches(/^\d+$/, { message: 'adminUserId must be a numeric user ID' })
  adminUserId?: string;
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
