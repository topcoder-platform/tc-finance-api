import { ApiProperty } from '@nestjs/swagger';

export class WinningAuditDto {
  @ApiProperty({
    description: 'The ID of the audit',
    example: '2ccba36d-8db7-49da-94c9-b6c5b7bf47fb',
  })
  id: string;

  @ApiProperty({
    description: 'The ID of the winning',
    example: '2ccba36d-8db7-49da-94c9-b6c5b7bf47fc',
  })
  winningsId: string;

  @ApiProperty({
    description: 'The ID of the user',
    example: '123',
  })
  userId: string;

  @ApiProperty({
    description: 'The audit action',
    example: 'create payment',
  })
  action: string;

  @ApiProperty({
    description: 'The audit note',
    example: 'note 01',
  })
  note: string | null;

  @ApiProperty({
    description: 'The creation timestamp',
    example: '2023-10-01T00:00:00Z',
  })
  createdAt: Date;
}

export class AuditPayoutDto {
  externalTransactionId: string;
  status: string;
  totalNetAmount: number;
  createdAt: Date;
  metadata: string;
  paymentMethodUsed: string;
  externalTransactionDetails: object;
}
