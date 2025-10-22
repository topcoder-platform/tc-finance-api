import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import crypto from 'crypto';
import { otp, reference_type } from '@prisma/client';
import { ENV_CONFIG } from 'src/config';
import { TopcoderEmailService } from '../topcoder/tc-email.service';
import { BasicMemberInfo } from '../topcoder';

const generateRandomOtp = (length: number): string => {
  const digits = '0123456789';
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * digits.length)];
  }
  return otp;
};

const hashOtp = (otp: string): string => {
  const hasher = crypto.createHash('sha256');
  hasher.update(otp);
  return hasher.digest('hex');
};

@Injectable()
export class OtpService {
  private readonly logger = new Logger(`global/OtpService`);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tcEmailService: TopcoderEmailService,
  ) {}

  async generateOtpCode(userInfo: BasicMemberInfo, actionType: reference_type) {
    const email = userInfo.email;

    const existingOtp = await this.prisma.otp.findFirst({
      where: {
        email,
        action_type: actionType,
        verified_at: null,
        expiration_time: {
          gt: new Date(),
        },
      },
      orderBy: {
        expiration_time: 'desc',
      },
    });

    if (existingOtp) {
      this.logger.warn(
        `An OTP has already been sent for email ${email} and action ${actionType}.`,
      );
      return {
        code: 'otp_exists',
        message: 'An OTP has already been sent! Please check your email!',
      };
    }

    // Generate a new OTP code
    const otpCode = generateRandomOtp(6); // Generate a 6-digit OTP
    const otpHash = hashOtp(otpCode);

    const expirationTime = new Date();
    expirationTime.setMinutes(
      expirationTime.getMinutes() + ENV_CONFIG.OTP_CODE_VALIDITY_MINUTES,
    );

    // Save the new OTP code in the database
    await this.prisma.otp.create({
      data: {
        email,
        action_type: actionType,
        otp_hash: otpHash,
        expiration_time: expirationTime,
        created_at: new Date(),
      },
    });

    // Simulate sending an email (replace with actual email service logic)
    await this.tcEmailService.sendEmail(
      email,
      ENV_CONFIG.SENDGRID_TEMPLATE_ID_OTP_CODE,
      {
        data: {
          otp: otpCode,
          name: [userInfo.firstName, userInfo.lastName]
            .filter(Boolean)
            .join(' '),
        },
      },
    );
    this.logger.debug(
      `Generated and sent OTP code ${otpCode.replace(/./g, '*')} for email ${email} and action ${actionType}.`,
    );

    return {
      code: 'otp_required',
    };
  }

  async verifyOtpCode(
    otpCode: string,
    userInfo: BasicMemberInfo,
    actionType: reference_type,
  ) {
    return await this.prisma.$transaction(async (tx) => {
      const records = await tx.$queryRaw<otp>`
        SELECT id, email, otp_hash, expiration_time, action_type, created_at, updated_at, verified_at
        FROM otp
        WHERE otp_hash=${hashOtp(otpCode)}
        ORDER BY expiration_time DESC
        LIMIT 1
        FOR UPDATE NOWAIT;
      `;
      const record = records[0];

      if (!record) {
        this.logger.warn(`No OTP record found for the provided code.`);
        return { code: 'otp_invalid', message: `Invalid OTP code.` };
      }

      if (record.email !== userInfo.email) {
        this.logger.warn(`Email mismatch for OTP verification.`);
        return {
          code: 'otp_email_mismatch',
          message: `Email mismatch for OTP verification.`,
        };
      }

      if (record.action_type !== actionType) {
        this.logger.warn(`Action type mismatch for OTP verification.`);
        return {
          code: 'otp_action_type_mismatch',
          message: `Action type mismatch for OTP verification.`,
        };
      }

      if (record.expiration_time && record.expiration_time < new Date()) {
        this.logger.warn(`OTP code has expired.`);
        return { code: 'otp_expired', message: `OTP code has expired.` };
      }

      if (record.verified_at !== null) {
        this.logger.warn(`OTP code has already been verified.`);
        return {
          code: 'otp_already_verified',
          message: `OTP code has already been verified.`,
        };
      }

      this.logger.log(
        `OTP code ${otpCode} verified successfully for action ${actionType}`,
      );

      await tx.otp.update({
        where: {
          id: record.id,
        },
        data: {
          verified_at: new Date(),
        },
      });

      return { code: 'success' };
    });
  }
}
