import { Injectable } from '@nestjs/common';
import { TopcoderM2MService } from './topcoder-m2m.service';
import { Logger } from 'src/shared/global';

export interface WithdrawUpdateData {
  userId: number;
  status: string;
  datePaid: string;
}

export interface AdminPaymentUpdateData {
  userId: number;
  status: string;
  amount: number;
  releaseDate: string;
}
@Injectable()
export class TopcoderChallengesService {
  private readonly logger = new Logger(TopcoderChallengesService.name);

  constructor(private readonly m2MService: TopcoderM2MService) {}
}
