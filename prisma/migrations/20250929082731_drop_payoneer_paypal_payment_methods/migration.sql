/*
  Warnings:

  - You are about to drop the `payoneer_payment_method` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `paypal_payment_method` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "payoneer_payment_method" DROP CONSTRAINT "fk_payoneer_user_payment_method";

-- DropForeignKey
ALTER TABLE "paypal_payment_method" DROP CONSTRAINT "fk_paypal_user_payment_method";

-- DropTable
DROP TABLE "payoneer_payment_method";

-- DropTable
DROP TABLE "paypal_payment_method";
