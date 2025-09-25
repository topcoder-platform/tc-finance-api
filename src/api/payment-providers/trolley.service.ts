import { BadRequestException, Injectable } from '@nestjs/common';
import { UserInfo } from 'src/dto/user.type';
import { TrolleyService as Trolley } from 'src/shared/global/trolley.service';
import { PrismaService } from 'src/shared/global/prisma.service';
import { BASIC_MEMBER_FIELDS } from 'src/shared/topcoder';
import { TopcoderMembersService } from 'src/shared/topcoder/members.service';

@Injectable()
export class TrolleyService {
  constructor(
    private readonly trolley: Trolley,
    private readonly prisma: PrismaService,
    private readonly tcMembersService: TopcoderMembersService,
  ) {}

  /**
   * Retrieves the Trolley payment method record from the database.
   * Throws an error if the record does not exist.
   */
  private async getTrolleyPaymentMethod() {
    const method = await this.prisma.payment_method.findUnique({
      where: { payment_method_type: 'Trolley' },
    });

    if (!method) {
      throw new Error("DB record for payment method 'Trolley' not found!");
    }

    return method;
  }

  /**
   * Attempts to find an existing Trolley recipient by email.
   * If none exists, creates a new one using data fetched from member api
   *
   * @param user - Current user
   */
  private async findOrCreateTrolleyRecipient(user: UserInfo) {
    const foundRecipient = await this.trolley.client.recipient.search(
      1,
      1,
      user.email,
    );

    if (
      foundRecipient?.length === 1 &&
      // make sure it's same email address
      foundRecipient[0].email === user.email
    ) {
      if (foundRecipient[0].referenceId !== user.id) {
        await this.trolley.client.recipient.update(foundRecipient[0].id, {
          referenceId: user.id,
        });
      }

      return foundRecipient[0];
    }

    const userInfo = await this.tcMembersService.getMemberInfoByUserHandle(
      user.handle,
      { fields: BASIC_MEMBER_FIELDS },
    );
    const address = (userInfo.addresses?.[0] ?? {}) as unknown as {
      [key: string]: string;
    };

    const recipientPayload = {
      type: 'individual' as const,
      referenceId: user.id,
      firstName: userInfo.firstName,
      lastName: userInfo.lastName,
      email: user.email,
      address: {
        city: address.city,
        postalCode: address.zip,
        region: address.stateCode,
        street1: address.streetAddr1,
        street2: address.streetAddr2,
      },
    };

    return this.trolley.client.recipient.create(recipientPayload);
  }

  /**
   * Creates and links a Trolley recipient with the user in the local DB.
   * Uses a transaction to ensure consistency between user payment method creation
   * and Trolley recipient linkage.
   *
   * @param user - Basic user info (e.g., ID, handle, email).
   * @returns Trolley recipient DB model tied to the user.
   */
  private async createPayeeRecipient(user: UserInfo) {
    const recipient = await this.findOrCreateTrolleyRecipient(user);

    const paymentMethod = await this.getTrolleyPaymentMethod();

    return this.prisma.$transaction(async (tx) => {
      let userPaymentMethod = await tx.user_payment_methods.findFirst({
        where: {
          user_id: user.id,
          payment_method_id: paymentMethod.payment_method_id,
        },
      });

      if (!userPaymentMethod) {
        userPaymentMethod = await tx.user_payment_methods.create({
          data: {
            user_id: user.id,
            payment_method: { connect: paymentMethod },
          },
        });
      }

      const updatedUserPaymentMethod = await tx.user_payment_methods.update({
        where: { id: userPaymentMethod.id },
        data: {
          trolley_payment_method: {
            create: {
              user_id: user.id,
              trolley_id: recipient.id,
            },
          },
        },
        include: {
          trolley_payment_method: true,
        },
      });

      return updatedUserPaymentMethod.trolley_payment_method?.[0];
    });
  }

  /**
   * Fetches the Trolley recipient associated with the given user.
   * If none exists, creates and stores a new one.
   *
   * @param user - Basic user info
   * @returns Trolley recipient DB model
   */
  async getPayeeRecipient(user: UserInfo) {
    const dbRecipient = await this.prisma.trolley_recipient.findUnique({
      where: { user_id: user.id },
    });

    if (dbRecipient) {
      return dbRecipient;
    }

    return this.createPayeeRecipient(user);
  }

  /**
   * Generates a portal URL for the user to access their Trolley dashboard.
   *
   * @param user - User information used to fetch Trolley recipient.
   * @returns A URL string to the Trolley user portal.
   */
  async getPortalUrlForUser(user: UserInfo) {
    if (user.email.toLowerCase().indexOf('@wipro.com') > -1) {
      throw new BadRequestException(
        'Please contact Topgear support to withdrawal your payments',
      );
    }

    const recipient = await this.getPayeeRecipient(user);
    const link = this.trolley.getRecipientPortalUrl({
      email: user.email,
      userId: user.id,
    });

    return { link, recipientId: recipient.trolley_id };
  }
}
