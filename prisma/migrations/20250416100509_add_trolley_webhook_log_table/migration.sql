-- CreateEnum
CREATE TYPE "webhook_status" AS ENUM ('error', 'processed', 'logged');

-- CreateTable
CREATE TABLE "trolley_webhook_log" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "event_id" TEXT NOT NULL,
    "event_time" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "event_payload" TEXT NOT NULL,
    "event_model" TEXT,
    "event_action" TEXT,
    "status" "webhook_status" NOT NULL,
    "error_message" TEXT,
    "created_by" VARCHAR(80),
    "updated_by" VARCHAR(80),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trolley_webhook_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trolley_webhook_log_event_id_key" ON "trolley_webhook_log"("event_id");
