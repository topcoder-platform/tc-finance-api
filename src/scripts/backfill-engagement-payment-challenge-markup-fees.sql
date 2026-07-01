-- Backfill finance engagement payment challenge markup and fee values from
-- billing account metadata.
--
-- Scope:
--   - Finance winnings with category = ENGAGEMENT_PAYMENT.
--   - Existing payment rows associated to those winnings.
--   - Payment rows whose billing_account maps to a billing-accounts-api-v6
--     BillingAccount.id.
--   - Rows where payment.challenge_markup or payment.challenge_fee differs
--     from the value derived from billing account markup and payment total_amount.
--   - Matching billing-accounts ConsumedAmount rows for engagement payments
--     whose amount does not include the derived challenge fee.
--
-- Calculation:
--   - payment.challenge_markup = billing account markup, rounded to the
--     challenge-markup column scale.
--   - payment.challenge_fee = payment.total_amount * payment.challenge_markup.
--   - "billing-accounts"."ConsumedAmount".amount = payment.total_amount +
--     payment.challenge_fee, rounded to the billing ledger scale.
--   - Finance payment rows are matched to billing ledger rows by assignment id,
--     billing account, and creation order because the billing API stores
--     engagement consumed rows without the finance payment id.
--
-- Run this against the PostgreSQL database that contains these schemas:
--   - "finance"
--   - "billing-accounts"
--
-- If your billing account schema name differs, update references to
-- "billing-accounts"."BillingAccount" before running.

BEGIN;

DO $$
BEGIN
  IF to_regclass('finance.winnings') IS NULL THEN
    RAISE EXCEPTION 'Required table finance.winnings was not found';
  END IF;

  IF to_regclass('finance.payment') IS NULL THEN
    RAISE EXCEPTION 'Required table finance.payment was not found';
  END IF;

  IF to_regclass('"billing-accounts"."BillingAccount"') IS NULL THEN
    RAISE EXCEPTION 'Required table "billing-accounts"."BillingAccount" was not found';
  END IF;
END;
$$;

WITH engagement_payments AS (
  SELECT
    p.payment_id,
    p.billing_account
  FROM "finance"."payment" p
  INNER JOIN "finance"."winnings" w
    ON w.winning_id = p.winnings_id
  WHERE w.category::text = 'ENGAGEMENT_PAYMENT'
)
SELECT
  COUNT(*) FILTER (
    WHERE billing_account IS NULL
      OR billing_account !~ '^\d+$'
  ) AS "rowsWithInvalidBillingAccount",
  COUNT(*) FILTER (
    WHERE billing_account ~ '^\d+$'
      AND ba.id IS NULL
  ) AS "rowsWithoutBillingAccountMetadata"
FROM engagement_payments ep
LEFT JOIN "billing-accounts"."BillingAccount" ba
  ON ep.billing_account ~ '^\d+$'
 AND ba.id::text = ep.billing_account;

WITH calculated AS (
  SELECT
    p.payment_id,
    p.winnings_id,
    w.external_id AS "assignmentId",
    p.billing_account AS "billingAccount",
    ROUND(ba.markup::numeric, 4) AS "challengeMarkup",
    CASE
      WHEN p.total_amount IS NULL THEN NULL
      ELSE ROUND(p.total_amount * ROUND(ba.markup::numeric, 4), 2)
    END AS "challengeFee",
    p.challenge_markup AS "currentChallengeMarkup",
    p.challenge_fee AS "currentChallengeFee"
  FROM "finance"."payment" p
  INNER JOIN "finance"."winnings" w
    ON w.winning_id = p.winnings_id
  INNER JOIN "billing-accounts"."BillingAccount" ba
    ON p.billing_account ~ '^\d+$'
   AND ba.id::text = p.billing_account
  WHERE w.category::text = 'ENGAGEMENT_PAYMENT'
),
candidates AS (
  SELECT *
  FROM calculated
  WHERE "currentChallengeMarkup" IS DISTINCT FROM "challengeMarkup"
    OR "currentChallengeFee" IS DISTINCT FROM "challengeFee"
)
SELECT
  COUNT(*) AS "rowsToUpdate",
  COUNT(DISTINCT winnings_id) AS "winningsAffected",
  COUNT(DISTINCT "assignmentId") AS "assignmentsAffected",
  COUNT(DISTINCT "billingAccount") AS "billingAccountsAffected"
FROM candidates;

WITH calculated AS (
  SELECT
    p.payment_id,
    ROUND(ba.markup::numeric, 4) AS "challengeMarkup",
    CASE
      WHEN p.total_amount IS NULL THEN NULL
      ELSE ROUND(p.total_amount * ROUND(ba.markup::numeric, 4), 2)
    END AS "challengeFee"
  FROM "finance"."payment" p
  INNER JOIN "finance"."winnings" w
    ON w.winning_id = p.winnings_id
  INNER JOIN "billing-accounts"."BillingAccount" ba
    ON p.billing_account ~ '^\d+$'
   AND ba.id::text = p.billing_account
  WHERE w.category::text = 'ENGAGEMENT_PAYMENT'
),
candidates AS (
  SELECT
    calculated.payment_id,
    calculated."challengeMarkup",
    calculated."challengeFee"
  FROM calculated
  INNER JOIN "finance"."payment" p
    ON p.payment_id = calculated.payment_id
  WHERE p.challenge_markup IS DISTINCT FROM calculated."challengeMarkup"
    OR p.challenge_fee IS DISTINCT FROM calculated."challengeFee"
),
updated AS (
  UPDATE "finance"."payment" p
  SET
    challenge_markup = candidates."challengeMarkup",
    challenge_fee = candidates."challengeFee",
    updated_at = CURRENT_TIMESTAMP,
    updated_by = 'engagement-markup-fee-backfill'
  FROM candidates
  WHERE p.payment_id = candidates.payment_id
  RETURNING
    p.payment_id,
    p.winnings_id,
    p.billing_account,
    p.total_amount,
    p.challenge_markup,
    p.challenge_fee
)
SELECT
  COUNT(*) AS "rowsUpdated",
  COUNT(DISTINCT winnings_id) AS "winningsAffected",
  COUNT(DISTINCT billing_account) AS "billingAccountsAffected"
FROM updated;

WITH finance_payment_rows AS (
  SELECT
    p.payment_id,
    w.external_id AS "assignmentId",
    p.billing_account AS "billingAccount",
    ROW_NUMBER() OVER (
      PARTITION BY w.external_id, p.billing_account
      ORDER BY
        COALESCE(p.created_at, w.created_at),
        p.payment_id
    ) AS "rowNumber",
    ROUND(
      (
        p.total_amount
        + ROUND(p.total_amount * ROUND(ba.markup::numeric, 4), 2)
      )::numeric,
      4
    ) AS "expectedConsumedAmount"
  FROM "finance"."payment" p
  INNER JOIN "finance"."winnings" w
    ON w.winning_id = p.winnings_id
  INNER JOIN "billing-accounts"."BillingAccount" ba
    ON p.billing_account ~ '^\d+$'
   AND ba.id::text = p.billing_account
  WHERE w.category::text = 'ENGAGEMENT_PAYMENT'
    AND w.external_id IS NOT NULL
    AND p.total_amount IS NOT NULL
),
billing_consumed_rows AS (
  SELECT
    consumed_amount.id,
    consumed_amount."externalId" AS "assignmentId",
    consumed_amount."billingAccountId"::text AS "billingAccount",
    ROW_NUMBER() OVER (
      PARTITION BY
        consumed_amount."externalId",
        consumed_amount."billingAccountId"
      ORDER BY
        consumed_amount."createdAt",
        consumed_amount.id
    ) AS "rowNumber",
    consumed_amount.amount AS "currentConsumedAmount"
  FROM "billing-accounts"."ConsumedAmount" consumed_amount
  WHERE consumed_amount."externalType"::text = 'ENGAGEMENT'
    AND EXISTS (
      SELECT 1
      FROM "finance"."payment" p
      INNER JOIN "finance"."winnings" w
        ON w.winning_id = p.winnings_id
      WHERE w.category::text = 'ENGAGEMENT_PAYMENT'
        AND w.external_id = consumed_amount."externalId"
        AND p.billing_account = consumed_amount."billingAccountId"::text
    )
)
SELECT
  COUNT(*) FILTER (
    WHERE finance_payment_rows.payment_id IS NOT NULL
      AND billing_consumed_rows.id IS NULL
  ) AS "financeRowsWithoutBillingConsumedRow",
  COUNT(*) FILTER (
    WHERE finance_payment_rows.payment_id IS NULL
      AND billing_consumed_rows.id IS NOT NULL
  ) AS "billingConsumedRowsWithoutFinancePayment",
  COUNT(*) FILTER (
    WHERE finance_payment_rows.payment_id IS NOT NULL
      AND billing_consumed_rows.id IS NOT NULL
      AND billing_consumed_rows."currentConsumedAmount" IS DISTINCT FROM
        finance_payment_rows."expectedConsumedAmount"
  ) AS "billingConsumedRowsToUpdate"
FROM finance_payment_rows
FULL OUTER JOIN billing_consumed_rows
  ON billing_consumed_rows."assignmentId" = finance_payment_rows."assignmentId"
 AND billing_consumed_rows."billingAccount" = finance_payment_rows."billingAccount"
 AND billing_consumed_rows."rowNumber" = finance_payment_rows."rowNumber";

WITH finance_payment_rows AS (
  SELECT
    p.payment_id,
    w.external_id AS "assignmentId",
    p.billing_account AS "billingAccount",
    ROW_NUMBER() OVER (
      PARTITION BY w.external_id, p.billing_account
      ORDER BY
        COALESCE(p.created_at, w.created_at),
        p.payment_id
    ) AS "rowNumber",
    ROUND(
      (
        p.total_amount
        + ROUND(p.total_amount * ROUND(ba.markup::numeric, 4), 2)
      )::numeric,
      4
    ) AS "expectedConsumedAmount"
  FROM "finance"."payment" p
  INNER JOIN "finance"."winnings" w
    ON w.winning_id = p.winnings_id
  INNER JOIN "billing-accounts"."BillingAccount" ba
    ON p.billing_account ~ '^\d+$'
   AND ba.id::text = p.billing_account
  WHERE w.category::text = 'ENGAGEMENT_PAYMENT'
    AND w.external_id IS NOT NULL
    AND p.total_amount IS NOT NULL
),
billing_consumed_rows AS (
  SELECT
    consumed_amount.id,
    consumed_amount."externalId" AS "assignmentId",
    consumed_amount."billingAccountId"::text AS "billingAccount",
    ROW_NUMBER() OVER (
      PARTITION BY
        consumed_amount."externalId",
        consumed_amount."billingAccountId"
      ORDER BY
        consumed_amount."createdAt",
        consumed_amount.id
    ) AS "rowNumber",
    consumed_amount.amount AS "currentConsumedAmount"
  FROM "billing-accounts"."ConsumedAmount" consumed_amount
  WHERE consumed_amount."externalType"::text = 'ENGAGEMENT'
),
matched_rows AS (
  SELECT
    billing_consumed_rows.id,
    finance_payment_rows."expectedConsumedAmount"
  FROM finance_payment_rows
  INNER JOIN billing_consumed_rows
    ON billing_consumed_rows."assignmentId" = finance_payment_rows."assignmentId"
   AND billing_consumed_rows."billingAccount" = finance_payment_rows."billingAccount"
   AND billing_consumed_rows."rowNumber" = finance_payment_rows."rowNumber"
  WHERE billing_consumed_rows."currentConsumedAmount" IS DISTINCT FROM
    finance_payment_rows."expectedConsumedAmount"
),
updated AS (
  UPDATE "billing-accounts"."ConsumedAmount" consumed_amount
  SET
    amount = matched_rows."expectedConsumedAmount",
    "updatedAt" = CURRENT_TIMESTAMP
  FROM matched_rows
  WHERE consumed_amount.id = matched_rows.id
  RETURNING
    consumed_amount.id,
    consumed_amount."billingAccountId",
    consumed_amount."externalId",
    consumed_amount.amount
)
SELECT
  COUNT(*) AS "billingConsumedRowsUpdated",
  COUNT(DISTINCT "externalId") AS "assignmentsAffected",
  COUNT(DISTINCT "billingAccountId") AS "billingAccountsAffected"
FROM updated;

-- Post-update sample for verification.
SELECT
  w.winning_id,
  w.external_id AS "assignmentId",
  p.payment_id,
  p.billing_account,
  p.total_amount,
  p.challenge_markup,
  p.challenge_fee,
  ba.markup AS "billingAccountMarkup",
  consumed_amount.amount AS "billingAccountConsumedAmount"
FROM "finance"."winnings" w
INNER JOIN "finance"."payment" p
  ON p.winnings_id = w.winning_id
INNER JOIN "billing-accounts"."BillingAccount" ba
  ON p.billing_account ~ '^\d+$'
 AND ba.id::text = p.billing_account
LEFT JOIN "billing-accounts"."ConsumedAmount" consumed_amount
  ON consumed_amount."externalType"::text = 'ENGAGEMENT'
 AND consumed_amount."externalId" = w.external_id
 AND consumed_amount."billingAccountId"::text = p.billing_account
WHERE w.category::text = 'ENGAGEMENT_PAYMENT'
ORDER BY p.updated_at DESC NULLS LAST, p.created_at DESC NULLS LAST
LIMIT 25;

COMMIT;
