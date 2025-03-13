import { PrismaClient, Prisma } from '@prisma/client'

const prisma = new PrismaClient()

const winningData: Prisma.winningsCreateInput[] = [
  {
    winning_id: '2ccba36d-8db7-49da-94c9-b6c5b7bf47fb',
    winner_id: '305384',
    type: 'PAYMENT',
    category: 'ALGORITHM_CONTEST_PAYMENT',
    title: 'title 01',
    description: 'description 01',
    external_id: 'externalId 01',
    attributes: {
      name: 'attr name 01',
      value: 'attr value 01',
    },
    created_by: 'admin_01',
    audit: {
      create : [
        {
          user_id: 'user_01',
          action: 'create payment',
          note: 'note_01',
        },
        {
          user_id: 'user_02',
          action: 'create payment 02',
          note: 'note_02',
        }
      ]
    },
    origin: {
      create: {
        origin_name: 'origin 01'
      }
    }
  },
  {
    winning_id: 'd417e29e-8b7e-42f8-a431-73159609acc3',
    winner_id: '100000028',
    type: 'REWARD',
    category: 'ASSEMBLY_PAYMENT',
    title: 'title 02',
    description: 'description 02',
    external_id: 'externalId 02',
    attributes: {
      name: 'attr name 02',
      value: 'attr value 02',
    },
    created_by: 'admin_02',
    created_at: '2025-02-20T16:00:00.000Z',
    audit: {
      create : [{
        user_id: 'user_03',
        action: 'create reward',
        note: 'note_03',
      }]
    },
    origin: {
      create: {
        origin_name: 'origin 02'
      }
    }
  },
  {
    winning_id: '7dccce38-e0f6-41ce-897c-d02123ba68ca',
    winner_id: '100000028',
    type: 'REWARD',
    category: 'ASSEMBLY_PAYMENT',
    title: 'title 02',
    description: 'description 02',
    external_id: 'externalId 02',
    attributes: {
      name: 'attr name 03',
      value: 'attr value 03',
    },
    created_by: 'admin_02',
    audit: {
      create : [{
        user_id: 'user_02',
        action: 'create reward',
        note: 'note_04',
      }]
    },
    origin: {
      create: {
        origin_name: 'origin 03'
      }
    }
  },
  {
    winning_id: 'f30f1984-0915-41bd-a299-d571c9072a8b',
    winner_id: '305384',
    type: 'PAYMENT',
    category: 'ALGORITHM_CONTEST_PAYMENT',
    title: 'title 04',
    description: 'description 04',
    external_id: 'externalId 01',
    attributes: {
      name: 'attr name 04',
      value: 'attr value 04',
    },
    created_by: 'admin_01',
    created_at: '2025-01-02T16:00:00.000Z',
    audit: {
      create : [
        {
          user_id: 'user_01',
          action: 'update payment',
          note: 'note_05',
        },
        {
          user_id: 'user_02',
          action: 'update payment 02',
          note: 'note_06',
        }
      ]
    },
    origin: {
      create: {
        origin_name: 'origin 04'
      }
    }
  },
]

const paymentMethodData: Prisma.payment_methodCreateInput[] = [
  {
    payment_method_type: 'OTP_PENDING',
    name: 'Paypal',
    description: 'Paypal description',
  },
  {
    payment_method_type: 'OTP_VERIFIED',
    name: 'Weixin',
    description: 'Weixin description',
  },
  {
    payment_method_type: 'CONNECTED',
    name: 'Alipay',
    description: 'Alipay description',
  },
  {
    payment_method_type: 'INACTIVE',
    name: 'Bank',
    description: 'Bank description',
  }
]

const paymentData: Prisma.paymentCreateInput[] = [
  {
    payment_id: '4c885122-ad42-435b-a98e-a46963af3582',
    net_amount: new Prisma.Decimal(200.50),
    gross_amount: new Prisma.Decimal(123.12),
    total_amount: new Prisma.Decimal(323.62),
    installment_number: 1,
    date_paid: new Date(),
    currency: 'USD',
    created_by: 'admin_01',
    payment_status: 'OWED',
    winnings: {
      connect: {winning_id: winningData[0].winning_id},
    }
  },
  {
    payment_id: '873ff3f6-2420-436b-98ec-d0f3172c6c8b',
    net_amount: new Prisma.Decimal(500.0),
    gross_amount: new Prisma.Decimal(200.0),
    total_amount: new Prisma.Decimal(700.0),
    installment_number: 1,
    date_paid: new Date(),
    currency: 'USD',
    created_by: 'admin_01',
    payment_status: 'PAID',
    winnings: {
      connect: {winning_id: winningData[1].winning_id},
    }
  },
  {
    payment_id: '52a98c78-242e-4867-a741-6759083cb8c8',
    net_amount: new Prisma.Decimal(400.0),
    gross_amount: new Prisma.Decimal(210.0),
    total_amount: new Prisma.Decimal(610.0),
    installment_number: 1,
    date_paid: new Date(new Date().getTime() - 20000),
    currency: 'USD',
    created_by: 'admin_01',
    payment_status: 'ON_HOLD',
    winnings: {
      connect: {winning_id: winningData[2].winning_id},
    }
  },
  {
    payment_id: 'ecdaf46f-e9a0-455f-bfdb-660c97c89ab8',
    net_amount: new Prisma.Decimal(200.0),
    gross_amount: new Prisma.Decimal(450.0),
    total_amount: new Prisma.Decimal(650.0),
    installment_number: 1,
    date_paid: new Date(),
    currency: 'USD',
    created_by: 'admin_02',
    payment_status: 'OWED',
    winnings: {
      connect: {winning_id: winningData[2].winning_id},
    }
  },
  {
    payment_id: '830c2033-5021-4d52-b744-907192212184',
    net_amount: new Prisma.Decimal(120.0),
    gross_amount: new Prisma.Decimal(550.0),
    total_amount: new Prisma.Decimal(1750.0),
    installment_number: 1,
    date_paid: new Date(),
    currency: 'USD',
    created_by: 'admin_02',
    payment_status: 'PROCESSING',
    winnings: {
      connect: {winning_id: winningData[3].winning_id},
    }
  }
]

async function main() {
  console.log(`Start seeding ...`);

  const winning01 = await prisma.winnings.create({
    data: winningData[0]
  });
  console.log(`Created winning data with id: ${winning01.winning_id}`);

  const winning02 = await prisma.winnings.create({
    data: winningData[1]
  });
  console.log(`Created winning data with id: ${winning02.winning_id}`);

  const winning03 = await prisma.winnings.create({
    data: winningData[2]
  });
  console.log(`Created winning data with id: ${winning03.winning_id}`);

  const winning04 = await prisma.winnings.create({
    data: winningData[3]
  });
  console.log(`Created winning data with id: ${winning04.winning_id}`);

  const paymentMethod01 = await prisma.payment_method.create({
    data: paymentMethodData[0]
  })
  console.log(`Created payment method data with id: ${paymentMethod01.payment_method_id}`)

  const paymentMethod02 = await prisma.payment_method.create({
    data: paymentMethodData[1]
  })
  console.log(`Created payment method data with id: ${paymentMethod02.payment_method_id}`)

  const paymentMethod03 = await prisma.payment_method.create({
    data: paymentMethodData[2]
  })
  console.log(`Created payment method data with id: ${paymentMethod03.payment_method_id}`)

  const paymentMethod04 = await prisma.payment_method.create({
    data: paymentMethodData[3]
  })
  console.log(`Created payment method data with id: ${paymentMethod04.payment_method_id}`)

  paymentData[0].payment_method = {
    connect: {payment_method_id: paymentMethod01.payment_method_id},
  };
  paymentData[1].payment_method = {
    connect: {payment_method_id: paymentMethod02.payment_method_id},
  };
  paymentData[3].payment_method = {
    connect: {payment_method_id: paymentMethod04.payment_method_id},
  };

  const payment01 = await prisma.payment.create({
    data: paymentData[0]
  });
  console.log(`Created payment data with id: ${payment01.payment_id}`);

  const payment02 = await prisma.payment.create({
    data: paymentData[1]
  });
  console.log(`Created payment data with id: ${payment02.payment_id}`);

  const payment03 = await prisma.payment.create({
    data: paymentData[2]
  });
  console.log(`Created payment data with id: ${payment03.payment_id}`);

  const payment04 = await prisma.payment.create({
    data: paymentData[3]
  });
  console.log(`Created payment data with id: ${payment04.payment_id}`);

  const payment05 = await prisma.payment.create({
    data: paymentData[4]
  });
  console.log(`Created payment data with id: ${payment05.payment_id}`);

  const paymentReleasesData: Prisma.payment_releasesCreateInput[] = [{
    payment_release_id: 'b85cef73-5efd-42b9-8096-c171229c5800',
    user_id: 'admin_01',
    total_net_amount: new Prisma.Decimal(700.0),
    status: 'Pending',
    metadata: {
      message: 'release message',
      sum: 7
    },
    release_date: new Date(new Date().getTime() + 20000000),
    payment_method: {
      connect: {payment_method_id: paymentMethod02.payment_method_id},
    },
    payment_release_associations: {
      create: [
        {payment_id: payment02.payment_id}
      ],
    }
  }, {
    payment_release_id: 'af833fbf-edc3-42f3-bd59-482778bd2438',
    user_id: 'admin_01',
    total_net_amount: new Prisma.Decimal(650.0),
    status: 'Pending',
    metadata: {
      message: 'release message 02',
      sum: 8
    },
    release_date: new Date(new Date().getTime() + 200000000),
    payment_method: {
      connect: {payment_method_id: paymentMethod02.payment_method_id},
    },
    payment_release_associations: {
      create: [
        {payment_id: payment03.payment_id},
        {payment_id: payment04.payment_id}
      ],
    }
  }]

  const paymentReleases01 = await prisma.payment_releases.create({
    data: paymentReleasesData[0]
  });

  console.log(`Created payment release data with id: ${paymentReleases01.payment_release_id}`);

  const paymentReleases02 = await prisma.payment_releases.create({
    data: paymentReleasesData[1]
  });

  console.log(`Created payment release data with id: ${paymentReleases02.payment_release_id}`);

  console.log(`Seeding finished.`);
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
