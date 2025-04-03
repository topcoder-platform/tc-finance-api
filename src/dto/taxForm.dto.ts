export class TaxFormQueryResult {
  id: string;
  user_id: string;
  tax_form_id: string;
  name: string;
  text: string;
  description: string;
  date_filed: Date;
  withholding_amount: number;
  withholding_percentage: number;
  status_id: string;
  use_percentage: number;
}
