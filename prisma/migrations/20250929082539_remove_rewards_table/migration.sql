/*
  Warnings:

  - You are about to drop the `reward` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "reward" DROP CONSTRAINT "reward_winnings_id_fkey";

-- DropTable
DROP TABLE "reward";
