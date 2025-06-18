export const walletDetailResponseExample = {
  account: {
    balances: [
      {
        type: 'PAYMENT',
        amount: 1000,
        unit: 'currency',
      },
    ],
  },
  withdrawalMethod: {
    isSetupComplete: true,
  },
  taxForm: {
    isSetupComplete: true,
  },
  estimatedFees: '0',
  primaryCurrency: 'USD',
  taxWithholdingPercentage: '0',
};

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
    type: 'paypal' | 'bank';
  };
  taxForm: {
    isSetupComplete: boolean;
  };
  identityVerification: {
    isSetupComplete: boolean;
  };
  primaryCurrency?: string | null;
  estimatedFees?: string | null;
  taxWithholdingPercentage?: string | null;
  minWithdrawAmount: number;
}
