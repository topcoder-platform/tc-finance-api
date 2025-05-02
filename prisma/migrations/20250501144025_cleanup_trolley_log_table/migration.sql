BEGIN;

-- Step 1: Drop unused metadata columns
ALTER TABLE "trolley_webhook_log"
  DROP COLUMN "created_by",
  DROP COLUMN "updated_at",
  DROP COLUMN "updated_by";

-- Step 2: Add new JSONB column
ALTER TABLE "trolley_webhook_log"
  ADD COLUMN "event_payload_json" JSONB;

-- Step 3: Migrate data from old stringified JSON column to new JSONB column
UPDATE "trolley_webhook_log"
  SET "event_payload_json" = "event_payload"::jsonb;

-- Step 4: Drop old column
ALTER TABLE "trolley_webhook_log"
  DROP COLUMN "event_payload";

-- Step 5: Rename new column to match original name
ALTER TABLE "trolley_webhook_log"
  RENAME COLUMN "event_payload_json" TO "event_payload";

-- Step 6: Apply NOT NULL constraint
ALTER TABLE "trolley_webhook_log"
  ALTER COLUMN "event_payload" SET NOT NULL;

COMMIT;