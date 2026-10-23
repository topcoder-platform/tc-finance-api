jest.mock('src/shared/global', () => ({
  Logger: class {
    debug = jest.fn();

    error = jest.fn();

    info = jest.fn();

    log = jest.fn();

    warn = jest.fn();
  },
}));

import { PaymentsService } from './payments.service';

describe('PaymentsService', () => {
  let prisma: any;
  let service: PaymentsService;

  beforeEach(() => {
    prisma = {
      payment: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    service = new PaymentsService(prisma);
  });

  describe('claimOwedPayments', () => {
    it('only moves OWED, unpaid payments to PROCESSING', async () => {
      const tx = {
        $queryRaw: jest
          .fn()
          .mockResolvedValue([{ winningsId: 'w-1' }, { winningsId: 'w-2' }]),
      };

      await service.claimOwedPayments(['w-1', 'w-2'], tx as any);

      const [strings, ...values] = tx.$queryRaw.mock.calls[0];
      const query = strings.join('?');
      expect(query).toContain('UPDATE payment');
      expect(query).toContain('AND payment_status = ?::payment_status');
      expect(query).toContain('AND date_paid IS NULL');
      expect(values).toEqual(['PROCESSING', ['w-1', 'w-2'], 'OWED']);
    });

    it('throws when some winnings could not be claimed', async () => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{ winningsId: 'w-1' }]),
      };

      await expect(
        service.claimOwedPayments(['w-1', 'w-2'], tx as any),
      ).rejects.toThrow("Failed to claim payments for winnings 'w-2'");
    });
  });

  describe('revertClaimedPayments', () => {
    it('only moves PROCESSING payments to the given status', async () => {
      await service.revertClaimedPayments(['w-1'], 'FAILED');

      expect(prisma.payment.updateMany).toHaveBeenCalledWith({
        where: {
          winnings_id: { in: ['w-1'] },
          payment_status: 'PROCESSING',
        },
        data: expect.objectContaining({
          payment_status: 'FAILED',
          version: { increment: 1 },
        }),
      });
    });
  });

  describe('updatePaymentProcessingState', () => {
    it('runs on the given transaction client', async () => {
      const tx = {
        payment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      };

      await service.updatePaymentProcessingState(
        ['w-1'],
        'PAID' as any,
        tx as any,
      );

      expect(tx.payment.updateMany).toHaveBeenCalled();
      expect(prisma.payment.updateMany).not.toHaveBeenCalled();
    });
  });
});
