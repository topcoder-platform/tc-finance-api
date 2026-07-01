-- Backfill finance payment challenge markup and fee values from challenge billing.
--
-- Scope:
--   - Finance winnings whose external_id matches a challenge id.
--   - Existing payment rows associated to those winnings.
--   - Existing challenge billing records with a markup value.
--   - Rows where payment.challenge_markup or payment.challenge_fee differs
--     from the value derived from challenge billing and payment total_amount.
--
-- Calculation:
--   - payment.challenge_markup = challenges.ChallengeBilling.markup,
--     rounded to the challenge-markup column scale.
--   - payment.challenge_fee = payment.challenge_markup * payment.total_amount
--
-- Run this against the PostgreSQL database that contains these schemas:
--   - "finance"
--   - "challenges"

BEGIN;

DO $$
BEGIN
  IF to_regclass('finance.winnings') IS NULL THEN
    RAISE EXCEPTION 'Required table finance.winnings was not found';
  END IF;

  IF to_regclass('finance.payment') IS NULL THEN
    RAISE EXCEPTION 'Required table finance.payment was not found';
  END IF;

  IF to_regclass('challenges."ChallengeBilling"') IS NULL THEN
    RAISE EXCEPTION 'Required table challenges."ChallengeBilling" was not found';
  END IF;
END;
$$;

WITH calculated AS (
  SELECT
    p.payment_id,
    p.winnings_id,
    w.external_id AS "challengeId",
    ROUND(cb."markup"::numeric, 4) AS "challengeMarkup",
    CASE
      WHEN p.total_amount IS NULL THEN NULL
      ELSE ROUND(p.total_amount * ROUND(cb."markup"::numeric, 4), 2)
    END AS "challengeFee",
    p.challenge_markup AS "currentChallengeMarkup",
    p.challenge_fee AS "currentChallengeFee"
  FROM "finance"."payment" p
  INNER JOIN "finance"."winnings" w
    ON w.winning_id = p.winnings_id
  INNER JOIN "challenges"."ChallengeBilling" cb
    ON cb."challengeId" = w.external_id
  WHERE w.external_id IS NOT NULL
    AND cb."markup" IS NOT NULL
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
  COUNT(DISTINCT "challengeId") AS "challengesAffected"
FROM candidates;

WITH calculated AS (
  SELECT
    p.payment_id,
    ROUND(cb."markup"::numeric, 4) AS "challengeMarkup",
    CASE
      WHEN p.total_amount IS NULL THEN NULL
      ELSE ROUND(p.total_amount * ROUND(cb."markup"::numeric, 4), 2)
    END AS "challengeFee"
  FROM "finance"."payment" p
  INNER JOIN "finance"."winnings" w
    ON w.winning_id = p.winnings_id
  INNER JOIN "challenges"."ChallengeBilling" cb
    ON cb."challengeId" = w.external_id
  WHERE w.external_id IS NOT NULL
    AND cb."markup" IS NOT NULL
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
    updated_by = 'challenge-markup-fee-backfill'
  FROM candidates
  WHERE p.payment_id = candidates.payment_id
  RETURNING
    p.payment_id,
    p.winnings_id,
    p.challenge_markup,
    p.challenge_fee
)
SELECT
  COUNT(*) AS "rowsUpdated",
  COUNT(DISTINCT winnings_id) AS "winningsAffected"
FROM updated;

-- Spot-check for the challenge from the incident:
SELECT
  w.winning_id,
  w.external_id AS "challengeId",
  p.payment_id,
  p.total_amount,
  p.challenge_markup,
  p.challenge_fee,
  cb."markup" AS "challengeBillingMarkup"
FROM "finance"."winnings" w
INNER JOIN "finance"."payment" p
  ON p.winnings_id = w.winning_id
INNER JOIN "challenges"."ChallengeBilling" cb
  ON cb."challengeId" = w.external_id
WHERE w.external_id = '57a1d424-1931-49a8-a180-d0b0f6cdf293'
ORDER BY p.created_at, p.payment_id;

COMMIT;
