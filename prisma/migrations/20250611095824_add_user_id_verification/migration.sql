-- CreateEnum
CREATE TYPE "verification_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "user_identity_verification_associations" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" VARCHAR(80) NOT NULL,
    "verification_id" TEXT NOT NULL,
    "date_filed" TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL,
    "verification_status" "verification_status" NOT NULL,

    CONSTRAINT "user_identity_verification_associations_pkey" PRIMARY KEY ("id")
);
