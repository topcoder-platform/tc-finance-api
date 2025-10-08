import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsNotEmpty,
  IsArray,
  ArrayNotEmpty,
  IsEnum,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { PaginationInfo, SortPagination } from './sort-pagination.dto';
import { DateFilterType } from './date-filter.type';
import { Type } from 'class-transformer';
import {
  PaymentStatus,
  PaymentCreateRequestDto,
  PaymentDetailDto,
} from './payment.dto';

export enum WinningsType {
  PAYMENT = 'PAYMENT',
  REWARD = 'REWARD',
}

export enum WinningsCategory {
  ALGORITHM_CONTEST_PAYMENT = 'ALGORITHM_CONTEST_PAYMENT',
  CONTRACT_PAYMENT = 'CONTRACT_PAYMENT',
  PROBLEM_PAYMENT = 'PROBLEM_PAYMENT',
  CODER_REFERRAL_PAYMENT = 'CODER_REFERRAL_PAYMENT',
  CHARITY_PAYMENT = 'CHARITY_PAYMENT',
  COMPONENT_PAYMENT = 'COMPONENT_PAYMENT',
  REVIEW_BOARD_PAYMENT = 'REVIEW_BOARD_PAYMENT',
  ONE_OFF_PAYMENT = 'ONE_OFF_PAYMENT',
  BUG_FIXES_PAYMENT = 'BUG_FIXES_PAYMENT',
  MARATHON_MATCH_PAYMENT = 'MARATHON_MATCH_PAYMENT',
  DIGITAL_RUN_PAYMENT = 'DIGITAL_RUN_PAYMENT',
  DIGITAL_RUN_ROOKIE_PAYMENT = 'DIGITAL_RUN_ROOKIE_PAYMENT',
  PROBLEM_TESTING_PAYMENT = 'PROBLEM_TESTING_PAYMENT',
  PROBLEM_WRITING_PAYMENT = 'PROBLEM_WRITING_PAYMENT',
  TOPCODER_STUDIO_CONTEST_PAYMENT = 'TOPCODER_STUDIO_CONTEST_PAYMENT',
  LOGO_CONTEST_PAYMENT = 'LOGO_CONTEST_PAYMENT',
  ARTICLE_PAYMENT = 'ARTICLE_PAYMENT',
  CCIP_PAYMENT = 'CCIP_PAYMENT',
  COMPONENT_TOURNAMENT_BONUS_PAYMENT = 'COMPONENT_TOURNAMENT_BONUS_PAYMENT',
  ROYALTY_PAYMENT = 'ROYALTY_PAYMENT',
  ALGORITHM_TOURNAMENT_PRIZE_PAYMENT = 'ALGORITHM_TOURNAMENT_PRIZE_PAYMENT',
  RELIABILITY_BONUS_PAYMENT = 'RELIABILITY_BONUS_PAYMENT',
  DIGITAL_RUN_TOP_PERFORMERS_PAYMENT = 'DIGITAL_RUN_TOP_PERFORMERS_PAYMENT',
  ARCHITECTURE_REVIEW_PAYMENT = 'ARCHITECTURE_REVIEW_PAYMENT',
  SPECIFICATION_REVIEW_PAYMENT = 'SPECIFICATION_REVIEW_PAYMENT',
  ASSEMBLY_COMPETITION_REVIEW = 'ASSEMBLY_COMPETITION_REVIEW',
  ARCHITECTURE_PAYMENT = 'ARCHITECTURE_PAYMENT',
  PREDICTIVE_CONTEST_PAYMENT = 'PREDICTIVE_CONTEST_PAYMENT',
  INTRODUCTORY_EVENT_COMPONENT_CONTEST_PAYMENT = 'INTRODUCTORY_EVENT_COMPONENT_CONTEST_PAYMENT',
  MARATHON_MATCH_TOURNAMENT_PRIZE_PAYMENT = 'MARATHON_MATCH_TOURNAMENT_PRIZE_PAYMENT',
  ASSEMBLY_PAYMENT = 'ASSEMBLY_PAYMENT',
  TESTING_PAYMENT = 'TESTING_PAYMENT',
  STUDIO_TOURNAMENT_PRIZE_PAYMENT = 'STUDIO_TOURNAMENT_PRIZE_PAYMENT',
  HIGH_SCHOOL_TOURNAMENT_PRIZE_PAYMENT = 'HIGH_SCHOOL_TOURNAMENT_PRIZE_PAYMENT',
  COLLEGE_TOUR_REPRESENTATIVE = 'COLLEGE_TOUR_REPRESENTATIVE',
  STUDIO_REVIEW_BOARD_PAYMENT = 'STUDIO_REVIEW_BOARD_PAYMENT',
  COMPONENT_ENHANCEMENTS_PAYMENT = 'COMPONENT_ENHANCEMENTS_PAYMENT',
  REVIEW_BOARD_BONUS_PAYMENT = 'REVIEW_BOARD_BONUS_PAYMENT',
  COMPONENT_BUILD_PAYMENT = 'COMPONENT_BUILD_PAYMENT',
  DIGITAL_RUN_V2_PAYMENT = 'DIGITAL_RUN_V2_PAYMENT',
  DIGITAL_RUN_V2_TOP_PERFORMERS_PAYMENT = 'DIGITAL_RUN_V2_TOP_PERFORMERS_PAYMENT',
  SPECIFICATION_CONTEST_PAYMENT = 'SPECIFICATION_CONTEST_PAYMENT',
  CONCEPTUALIZATION_CONTEST_PAYMENT = 'CONCEPTUALIZATION_CONTEST_PAYMENT',
  TEST_SUITES_PAYMENT = 'TEST_SUITES_PAYMENT',
  COPILOT_PAYMENT = 'COPILOT_PAYMENT',
  STUDIO_BUG_FIXES_PAYMENT = 'STUDIO_BUG_FIXES_PAYMENT',
  STUDIO_ENHANCEMENTS_PAYMENT = 'STUDIO_ENHANCEMENTS_PAYMENT',
  STUDIO_SPECIFICATION_REVIEW_PAYMENT = 'STUDIO_SPECIFICATION_REVIEW_PAYMENT',
  UI_PROTOTYPE_COMPETITION_PAYMENT = 'UI_PROTOTYPE_COMPETITION_PAYMENT',
  RIA_BUILD_COMPETITION_PAYMENT = 'RIA_BUILD_COMPETITION_PAYMENT',
  RIA_COMPONENT_COMPETITION_PAYMENT = 'RIA_COMPONENT_COMPETITION_PAYMENT',
  SPECIFICATION_WRITING_PAYMENT = 'SPECIFICATION_WRITING_PAYMENT',
  STUDIO_SPECIFICATION_WRITING_PAYMENT = 'STUDIO_SPECIFICATION_WRITING_PAYMENT',
  DEPLOYMENT_TASK_PAYMENT = 'DEPLOYMENT_TASK_PAYMENT',
  TEST_SCENARIOS_PAYMENT = 'TEST_SCENARIOS_PAYMENT',
  STUDIO_SUBMISSION_SCREENING_PAYMENT = 'STUDIO_SUBMISSION_SCREENING_PAYMENT',
  STUDIO_COPILOT_PAYMENT = 'STUDIO_COPILOT_PAYMENT',
  COPILOT_POSTING_PAYMENT = 'COPILOT_POSTING_PAYMENT',
  CONTENT_CREATION_PAYMENT = 'CONTENT_CREATION_PAYMENT',
  DIGITAL_RUN_V2_PAYMENT_TAXABLE = 'DIGITAL_RUN_V2_PAYMENT_TAXABLE',
  DIGITAL_RUN_V2_TOP_PERFORMERS_PAYMENT_TAXABLE = 'DIGITAL_RUN_V2_TOP_PERFORMERS_PAYMENT_TAXABLE',
  CONTEST_CHECKPOINT_PAYMENT = 'CONTEST_CHECKPOINT_PAYMENT',
  CONTEST_PAYMENT = 'CONTEST_PAYMENT',
  MARATHON_MATCH_NON_TAXABLE_PAYMENT = 'MARATHON_MATCH_NON_TAXABLE_PAYMENT',
  NEGATIVE_PAYMENT = 'NEGATIVE_PAYMENT',
  PROJECT_BUG_FIXES_PAYMENT = 'PROJECT_BUG_FIXES_PAYMENT',
  PROJECT_COPILOT_PAYMENT = 'PROJECT_COPILOT_PAYMENT',
  PROJECT_DEPLOYMENT_TASK_PAYMENT = 'PROJECT_DEPLOYMENT_TASK_PAYMENT',
  PROJECT_ENHANCEMENTS_PAYMENT = 'PROJECT_ENHANCEMENTS_PAYMENT',
  TASK_PAYMENT = 'TASK_PAYMENT',
  TASK_REVIEW_PAYMENT = 'TASK_REVIEW_PAYMENT',
  TASK_COPILOT_PAYMENT = 'TASK_COPILOT_PAYMENT',
}

export class PayoutStatus {
  payoutSetupComplete: boolean;
  taxFormSetupComplete: boolean;
}

export class WinningDto {
  id: string;
  type: string;
  winnerId: string;
  origin?: string;
  category: WinningsCategory;
  title: string;
  description: string;
  externalId: string;
  attributes: object;
  details: PaymentDetailDto[];
  paymentStatus: PayoutStatus;
  createdAt: Date;
  updatedAt: Date;
  releaseDate: Date;
}

export class WinningRequestDto extends SortPagination {
  @ApiProperty({
    description: 'The ID of the winner',
    example: 'admin_01',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  winnerId?: string;

  @ApiProperty({
    description: 'The array of the winner ids',
    example: ['admin_01'],
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  winnerIds?: string[];

  @ApiProperty({
    description: 'The array of the external ids',
    example: ['externalId_01'],
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  externalIds?: string[];

  @ApiProperty({
    description: 'The type of winnings category',
    enum: WinningsCategory,
    example: WinningsCategory.ALGORITHM_CONTEST_PAYMENT,
  })
  @IsOptional()
  @IsEnum(WinningsCategory)
  type?: WinningsCategory;

  @ApiProperty({
    description: 'The payment status',
    enum: PaymentStatus,
    example: PaymentStatus.OWED,
  })
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @ApiProperty({
    description: 'The filter date',
    enum: DateFilterType,
    example: DateFilterType.LAST7DAYS,
  })
  @IsOptional()
  @IsEnum(DateFilterType)
  date?: DateFilterType;
}

export class WinningCreateRequestDto {
  @ApiProperty({
    description: 'The ID of the winner',
    example: 'admin_01',
  })
  @IsString()
  @IsNotEmpty()
  winnerId: string;

  @ApiProperty({
    description: 'The type of winnings',
    example: WinningsType.PAYMENT,
    enum: WinningsType,
  })
  @IsEnum(WinningsType)
  type: WinningsType;

  @ApiProperty({
    description: 'The origin field',
    example: 'origin text',
  })
  @IsString()
  @IsNotEmpty()
  origin: string;

  @ApiProperty({
    description: 'The type of winnings category',
    enum: WinningsCategory,
    example: WinningsCategory.ALGORITHM_CONTEST_PAYMENT,
  })
  @IsOptional()
  @IsEnum(WinningsCategory)
  category: WinningsCategory;

  @ApiProperty({
    description: 'The title field',
    example: 'title text',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    description: 'The description field',
    example: 'origin text',
  })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({
    description: 'The externalId field',
    example: 'admin_02',
  })
  @IsString()
  @IsNotEmpty()
  externalId: string;

  @ApiProperty({
    description: 'The attributes field',
    example: { admin_02: 'value02' },
  })
  @IsOptional()
  @IsObject()
  attributes: object;

  @ApiProperty({
    description: 'The payment details',
    type: [PaymentCreateRequestDto],
    example: [
      {
        totalAmount: 12.3,
        grossAmount: 15.0,
        installmentNumber: 1,
        currency: 'string',
        billingAccount: '1234',
      },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentCreateRequestDto)
  details: PaymentCreateRequestDto[];
}

export class SearchWinningResult {
  winnings: WinningDto[];
  pagination: PaginationInfo;
}
