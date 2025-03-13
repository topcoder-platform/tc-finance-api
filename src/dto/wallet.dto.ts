export class WalletDetailDto {
  account: {
    balances: {
      type: string;
      amount: number;
      unit: string;
    }[];
  };
  withdrawalMethod: {
    isSetupComplete: boolean;
  };
  taxForm: {
    isSetupComplete: boolean;
  };
}
