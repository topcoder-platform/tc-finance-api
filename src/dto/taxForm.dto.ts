import { TaxFormStatus } from './adminWinning.dto';

export class TaxFormQueryResult {
  id: string;
  user_id: string;
  tax_form_id: string;
  date_filed: Date;
  tax_form_status: TaxFormStatus;
}
