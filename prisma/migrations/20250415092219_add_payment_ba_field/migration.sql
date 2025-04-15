-- Add the "billing_account" field to the "payment" table
ALTER TABLE "payment"
ADD COLUMN "billing_account" VARCHAR(80);

-- Set a value of "0" for the existing records in the "billing_account" column
UPDATE "payment"
SET billing_account = '0';

-- Alter the "billing_account" column to make it NOT NULL
ALTER TABLE "payment"
ALTER COLUMN "billing_account" SET NOT NULL;