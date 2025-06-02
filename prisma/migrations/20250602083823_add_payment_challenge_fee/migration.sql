-- AlterTable
ALTER TABLE "payment" ADD COLUMN     "challenge_fee" DECIMAL(12,2),
ADD COLUMN     "challenge_markup" DECIMAL(12,2);
