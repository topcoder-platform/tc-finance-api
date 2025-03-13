CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CreateEnum
CREATE TYPE "action_type" AS ENUM ('INITIATE_WITHDRAWAL', 'ADD_WITHDRAWAL_METHOD', 'REMOVE_WITHDRAWAL_METHOD', 'SETUP_TAX_FORMS', 'REMOVE_TAX_FORMS');

-- CreateEnum
CREATE TYPE "docusign_envelope_status" AS ENUM ('CREATED', 'OTP_VERIFIED', 'COMPLETED', 'DECLINED');

-- CreateEnum
CREATE TYPE "payment_method_status" AS ENUM ('OTP_PENDING', 'OTP_VERIFIED', 'CONNECTED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('PAID', 'ON_HOLD', 'ON_HOLD_ADMIN', 'OWED', 'PROCESSING', 'CANCELLED');

-- CreateEnum
CREATE TYPE "reference_type" AS ENUM ('ADD_PAYMENT_METHOD', 'REMOVE_PAYMENT_METHOD', 'GET_PAYMENT_METHOD_REGISTRATION_LINK', 'VIEW_TAX_FORM', 'SUBMIT_TAX_FORM', 'REMOVE_TAX_FORM', 'WITHDRAW_PAYMENT');

-- CreateEnum
CREATE TYPE "tax_form_status" AS ENUM ('OTP_PENDING', 'OTP_VERIFIED', 'ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "transaction_status" AS ENUM ('INITIATED', 'COMPLETED', 'EXPIRED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "winnings_category" AS ENUM ('ALGORITHM_CONTEST_PAYMENT', 'CONTRACT_PAYMENT', 'PROBLEM_PAYMENT', 'CODER_REFERRAL_PAYMENT', 'CHARITY_PAYMENT', 'COMPONENT_PAYMENT', 'REVIEW_BOARD_PAYMENT', 'ONE_OFF_PAYMENT', 'BUG_FIXES_PAYMENT', 'MARATHON_MATCH_PAYMENT', 'DIGITAL_RUN_PAYMENT', 'DIGITAL_RUN_ROOKIE_PAYMENT', 'PROBLEM_TESTING_PAYMENT', 'PROBLEM_WRITING_PAYMENT', 'TOPCODER_STUDIO_CONTEST_PAYMENT', 'LOGO_CONTEST_PAYMENT', 'ARTICLE_PAYMENT', 'CCIP_PAYMENT', 'COMPONENT_TOURNAMENT_BONUS_PAYMENT', 'ROYALTY_PAYMENT', 'ALGORITHM_TOURNAMENT_PRIZE_PAYMENT', 'RELIABILITY_BONUS_PAYMENT', 'DIGITAL_RUN_TOP_PERFORMERS_PAYMENT', 'ARCHITECTURE_REVIEW_PAYMENT', 'SPECIFICATION_REVIEW_PAYMENT', 'ASSEMBLY_COMPETITION_REVIEW', 'ARCHITECTURE_PAYMENT', 'PREDICTIVE_CONTEST_PAYMENT', 'INTRODUCTORY_EVENT_COMPONENT_CONTEST_PAYMENT', 'MARATHON_MATCH_TOURNAMENT_PRIZE_PAYMENT', 'ASSEMBLY_PAYMENT', 'TESTING_PAYMENT', 'STUDIO_TOURNAMENT_PRIZE_PAYMENT', 'HIGH_SCHOOL_TOURNAMENT_PRIZE_PAYMENT', 'COLLEGE_TOUR_REPRESENTATIVE', 'STUDIO_REVIEW_BOARD_PAYMENT', 'COMPONENT_ENHANCEMENTS_PAYMENT', 'REVIEW_BOARD_BONUS_PAYMENT', 'COMPONENT_BUILD_PAYMENT', 'DIGITAL_RUN_V2_PAYMENT', 'DIGITAL_RUN_V2_TOP_PERFORMERS_PAYMENT', 'SPECIFICATION_CONTEST_PAYMENT', 'CONCEPTUALIZATION_CONTEST_PAYMENT', 'TEST_SUITES_PAYMENT', 'COPILOT_PAYMENT', 'STUDIO_BUG_FIXES_PAYMENT', 'STUDIO_ENHANCEMENTS_PAYMENT', 'STUDIO_SPECIFICATION_REVIEW_PAYMENT', 'UI_PROTOTYPE_COMPETITION_PAYMENT', 'RIA_BUILD_COMPETITION_PAYMENT', 'RIA_COMPONENT_COMPETITION_PAYMENT', 'SPECIFICATION_WRITING_PAYMENT', 'STUDIO_SPECIFICATION_WRITING_PAYMENT', 'DEPLOYMENT_TASK_PAYMENT', 'TEST_SCENARIOS_PAYMENT', 'STUDIO_SUBMISSION_SCREENING_PAYMENT', 'STUDIO_COPILOT_PAYMENT', 'COPILOT_POSTING_PAYMENT', 'CONTENT_CREATION_PAYMENT', 'DIGITAL_RUN_V2_PAYMENT_TAXABLE', 'DIGITAL_RUN_V2_TOP_PERFORMERS_PAYMENT_TAXABLE', 'CONTEST_CHECKPOINT_PAYMENT', 'CONTEST_PAYMENT', 'MARATHON_MATCH_NON_TAXABLE_PAYMENT', 'NEGATIVE_PAYMENT', 'PROJECT_BUG_FIXES_PAYMENT', 'PROJECT_COPILOT_PAYMENT', 'PROJECT_DEPLOYMENT_TASK_PAYMENT', 'PROJECT_ENHANCEMENTS_PAYMENT', 'TASK_PAYMENT', 'TASK_REVIEW_PAYMENT', 'TASK_COPILOT_PAYMENT');

-- CreateEnum
CREATE TYPE "winnings_type" AS ENUM ('PAYMENT', 'REWARD');

-- CreateTable
CREATE TABLE "audit" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "winnings_id" UUID NOT NULL,
    "user_id" VARCHAR(80) NOT NULL,
    "action" VARCHAR(512) NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "docusign_envelopes" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_tax_form_association_id" UUID NOT NULL,
    "envelope_id" VARCHAR(80) NOT NULL,
    "template_id" VARCHAR(80) NOT NULL,
    "status_id" "docusign_envelope_status",

    CONSTRAINT "docusign_envelopes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "origin" (
    "origin_id" SERIAL NOT NULL,
    "origin_name" VARCHAR(255) NOT NULL,

    CONSTRAINT "origin_pkey" PRIMARY KEY ("origin_id")
);

-- CreateTable
CREATE TABLE "otp" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "email" VARCHAR(255) NOT NULL,
    "otp_hash" VARCHAR(255) NOT NULL,
    "expiration_time" TIMESTAMP(6) NOT NULL DEFAULT (CURRENT_TIMESTAMP + '00:05:00'::interval),
    "transaction_id" VARCHAR(255) NOT NULL,
    "action_type" "reference_type" NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "verified_at" TIMESTAMP(6),

    CONSTRAINT "otp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "payment_id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "winnings_id" UUID NOT NULL,
    "net_amount" DECIMAL(12,2),
    "gross_amount" DECIMAL(12,2),
    "total_amount" DECIMAL(12,2),
    "installment_number" INTEGER DEFAULT 1,
    "date_paid" TIMESTAMP(6),
    "payment_method_id" INTEGER,
    "currency" VARCHAR(5) DEFAULT 'USD',
    "created_by" VARCHAR(80) NOT NULL,
    "updated_by" VARCHAR(80),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER DEFAULT 1,
    "release_date" TIMESTAMP(6) DEFAULT (CURRENT_TIMESTAMP + '15 days'::interval),
    "payment_status" "payment_status",

    CONSTRAINT "payment_pkey" PRIMARY KEY ("payment_id")
);

-- CreateTable
CREATE TABLE "payment_method" (
    "payment_method_id" SERIAL NOT NULL,
    "payment_method_type" VARCHAR(50) NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "description" TEXT,

    CONSTRAINT "payment_method_pkey" PRIMARY KEY ("payment_method_id")
);

-- CreateTable
CREATE TABLE "payment_release_associations" (
    "payment_release_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,

    CONSTRAINT "payment_release_associations_pkey" PRIMARY KEY ("payment_release_id","payment_id")
);

-- CreateTable
CREATE TABLE "payment_releases" (
    "payment_release_id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" VARCHAR(80) NOT NULL,
    "total_net_amount" DECIMAL(12,2) NOT NULL,
    "payment_method_id" INTEGER NOT NULL,
    "status" VARCHAR(20) DEFAULT 'Pending',
    "external_transaction_id" VARCHAR(255),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "payee_id" VARCHAR(80),
    "release_date" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "batch_id" UUID,

    CONSTRAINT "payment_releases_pkey" PRIMARY KEY ("payment_release_id")
);

-- CreateTable
CREATE TABLE "payoneer_payment_method" (
    "id" SERIAL NOT NULL,
    "user_payment_method_id" UUID NOT NULL,
    "user_id" VARCHAR(80) NOT NULL,
    "payee_id" VARCHAR(50) NOT NULL,
    "payoneer_id" VARCHAR(50),

    CONSTRAINT "payoneer_payment_method_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paypal_payment_method" (
    "id" SERIAL NOT NULL,
    "user_payment_method_id" UUID NOT NULL,
    "user_id" VARCHAR(80) NOT NULL,
    "email" VARCHAR(150),
    "payer_id" VARCHAR(50),
    "country_code" VARCHAR(2),

    CONSTRAINT "paypal_payment_method_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward" (
    "reward_id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "winnings_id" UUID NOT NULL,
    "points" INTEGER,
    "title" VARCHAR(255),
    "description" TEXT,
    "reference" JSONB,
    "attributes" JSONB,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reward_pkey" PRIMARY KEY ("reward_id")
);

-- CreateTable
CREATE TABLE "tax_forms" (
    "tax_form_id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "name" VARCHAR(30),
    "text" TEXT,
    "description" VARCHAR(255),
    "default_withholding_amount" DECIMAL(12,2),
    "default_withholding_percentage" DECIMAL(5,5),
    "use_percentage" BOOLEAN,
    "e_sign_template_id" VARCHAR(80) NOT NULL,

    CONSTRAINT "tax_forms_pkey" PRIMARY KEY ("tax_form_id")
);

-- CreateTable
CREATE TABLE "transaction" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" VARCHAR(255) NOT NULL,
    "reference_id" UUID NOT NULL,
    "reference_type" "reference_type" NOT NULL,
    "status" "transaction_status" NOT NULL DEFAULT 'INITIATED',
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_default_payment_method" (
    "user_id" VARCHAR(80) NOT NULL,
    "payment_method_id" INTEGER NOT NULL,

    CONSTRAINT "user_default_payment_method_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "user_payment_methods" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" VARCHAR(80) NOT NULL,
    "payment_method_id" INTEGER NOT NULL,
    "status" "payment_method_status" DEFAULT 'OTP_PENDING',

    CONSTRAINT "user_payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_tax_form_associations" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" VARCHAR(80) NOT NULL,
    "tax_form_id" UUID NOT NULL,
    "date_filed" TIMESTAMP(6),
    "withholding_amount" DECIMAL,
    "withholding_percentage" DECIMAL(5,5),
    "status_id" "tax_form_status",
    "use_percentage" BOOLEAN,

    CONSTRAINT "user_tax_form_associations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "winnings" (
    "winning_id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "winner_id" VARCHAR(80) NOT NULL,
    "type" "winnings_type" NOT NULL,
    "origin_id" INTEGER,
    "category" "winnings_category",
    "title" VARCHAR(255),
    "description" TEXT,
    "external_id" VARCHAR(255),
    "attributes" JSONB,
    "created_by" VARCHAR(80) NOT NULL,
    "updated_by" VARCHAR(80),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "winnings_pkey" PRIMARY KEY ("winning_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_method_payment_method_type_key" ON "payment_method"("payment_method_type");

-- CreateIndex
CREATE UNIQUE INDEX "payoneer_payment_method_user_id_key" ON "payoneer_payment_method"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "paypal_payment_method_user_id_key" ON "paypal_payment_method"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_payment_methods_user_id_payment_method_id_key" ON "user_payment_methods"("user_id", "payment_method_id");

-- AddForeignKey
ALTER TABLE "audit" ADD CONSTRAINT "audit_winnings_id_fkey" FOREIGN KEY ("winnings_id") REFERENCES "winnings"("winning_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "docusign_envelopes" ADD CONSTRAINT "docusign_envelopes_user_tax_form_association_id_fkey" FOREIGN KEY ("user_tax_form_association_id") REFERENCES "user_tax_form_associations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "payment_method"("payment_method_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_winnings_id_fkey" FOREIGN KEY ("winnings_id") REFERENCES "winnings"("winning_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payment_release_associations" ADD CONSTRAINT "payment_release_associations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payment"("payment_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payment_release_associations" ADD CONSTRAINT "payment_release_associations_payment_release_id_fkey" FOREIGN KEY ("payment_release_id") REFERENCES "payment_releases"("payment_release_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payment_releases" ADD CONSTRAINT "payment_releases_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "payment_method"("payment_method_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payoneer_payment_method" ADD CONSTRAINT "fk_payoneer_user_payment_method" FOREIGN KEY ("user_payment_method_id") REFERENCES "user_payment_methods"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "paypal_payment_method" ADD CONSTRAINT "fk_paypal_user_payment_method" FOREIGN KEY ("user_payment_method_id") REFERENCES "user_payment_methods"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "reward" ADD CONSTRAINT "reward_winnings_id_fkey" FOREIGN KEY ("winnings_id") REFERENCES "winnings"("winning_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_default_payment_method" ADD CONSTRAINT "fk_default_payment_method" FOREIGN KEY ("payment_method_id") REFERENCES "payment_method"("payment_method_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_payment_methods" ADD CONSTRAINT "fk_user_payment_method" FOREIGN KEY ("payment_method_id") REFERENCES "payment_method"("payment_method_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_tax_form_associations" ADD CONSTRAINT "user_tax_form_associations_tax_form_id_fkey" FOREIGN KEY ("tax_form_id") REFERENCES "tax_forms"("tax_form_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "winnings" ADD CONSTRAINT "winnings_origin_id_fkey" FOREIGN KEY ("origin_id") REFERENCES "origin"("origin_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
