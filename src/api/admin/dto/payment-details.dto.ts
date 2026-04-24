import { ApiPropertyOptional } from '@nestjs/swagger';

export class PaymentEngagementDetailsDto {
  @ApiPropertyOptional({
    description: 'The assignment ID associated with the payment',
    example: 'assignment-123',
  })
  assignmentId?: string;

  @ApiPropertyOptional({
    description: 'The engagement ID associated with the assignment',
    example: 'engagement-123',
  })
  engagementId?: string;

  @ApiPropertyOptional({
    description: 'The project ID that owns the engagement',
    example: 'project-123',
  })
  projectId?: string;

  @ApiPropertyOptional({
    description: 'The project name that owns the engagement',
    example: 'Platform Modernization',
  })
  projectName?: string;

  @ApiPropertyOptional({
    description: 'The engagement title shown in Work Manager',
    example: 'Senior Frontend Engineer',
  })
  engagementTitle?: string;

  @ApiPropertyOptional({
    description: 'The billing start date from the assignment',
    example: '2026-02-12T00:00:00.000Z',
  })
  billingStartDate?: Date;

  @ApiPropertyOptional({
    description: 'Assignment duration in months',
    example: 3,
  })
  durationMonths?: number;

  @ApiPropertyOptional({
    description: 'Assignment hourly rate in USD',
    example: '75.50',
  })
  ratePerHour?: string;

  @ApiPropertyOptional({
    description: 'Assignment standard hours per week',
    example: 40,
  })
  standardHoursPerWeek?: number;

  @ApiPropertyOptional({
    description: 'Assignment remarks entered in Work Manager',
    example: 'Complete onboarding within the first week.',
  })
  otherRemarks?: string;
}

export class PaymentWorkLogDto {
  @ApiPropertyOptional({
    description: 'Hours worked captured during payment creation',
    example: 12.5,
  })
  hoursWorked?: number;

  @ApiPropertyOptional({
    description: 'Manager remarks captured during payment creation',
    example: 'Completed sprint support and bug triage.',
  })
  remarks?: string;
}

export class PaymentTaskDetailsDto {
  @ApiPropertyOptional({
    description: 'The Connect project ID associated with the task challenge',
    example: '12345',
  })
  projectId?: string;

  @ApiPropertyOptional({
    description: 'The name of the project associated with the task challenge',
    example: 'Platform Modernization',
  })
  projectName?: string;

  @ApiPropertyOptional({
    description: 'The Topcoder handle of the user who approved this payment',
    example: 'approver_handle',
  })
  paymentApproverHandle?: string;
}

export class WinningPaymentDetailsDto {
  @ApiPropertyOptional({
    description:
      'The Topcoder handle of the user who created the payment record',
    example: 'pm_admin',
  })
  paymentCreatorHandle?: string;

  @ApiPropertyOptional({
    description:
      'Engagement and assignment details when the winning is an engagement payment',
    type: PaymentEngagementDetailsDto,
  })
  engagementDetails?: PaymentEngagementDetailsDto;

  @ApiPropertyOptional({
    description: 'Work-log inputs captured when the payment was created',
    type: PaymentWorkLogDto,
  })
  workLog?: PaymentWorkLogDto;

  @ApiPropertyOptional({
    description: 'Task-specific details when the winning is a task payment',
    type: PaymentTaskDetailsDto,
  })
  taskDetails?: PaymentTaskDetailsDto;
}
