-- DropForeignKey
ALTER TABLE "docusign_envelopes" DROP CONSTRAINT "docusign_envelopes_user_tax_form_association_id_fkey";

-- DropForeignKey
ALTER TABLE "user_tax_form_associations" DROP CONSTRAINT "user_tax_form_associations_tax_form_id_fkey";

-- AlterTable
DROP TABLE "user_tax_form_associations";
DROP TYPE "tax_form_status";

CREATE TYPE "tax_form_status" AS ENUM ('incomplete', 'submitted', 'reviewed', 'voided');

-- CreateTable
CREATE TABLE "user_tax_form_associations" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" VARCHAR(80) NOT NULL,
    "tax_form_id" TEXT NOT NULL,
    "date_filed" TIMESTAMP(6) NOT NULL,
    "tax_form_status" "tax_form_status",

    CONSTRAINT "user_tax_form_associations_pkey" PRIMARY KEY ("id")
);

-- DropTable
DROP TABLE "docusign_envelopes";

-- DropTable
DROP TABLE "tax_forms";

-- DropEnum
DROP TYPE "docusign_envelope_status";
