/*
  Warnings:

  - You are about to drop the column `transaction_id` on the `otp` table. All the data in the column will be lost.
  - You are about to drop the `transaction` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "otp" DROP COLUMN "transaction_id";

-- DropTable
DROP TABLE "transaction";
