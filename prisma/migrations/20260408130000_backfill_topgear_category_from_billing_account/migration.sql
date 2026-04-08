-- Backfill payment winnings to TOPGEAR_PAYMENT based on linked payment billing accounts.
UPDATE winnings w
SET category = 'TOPGEAR_PAYMENT'
WHERE w.type = 'PAYMENT'
	AND w.created_at >= TIMESTAMP '2026-04-01 00:00:00'
	AND w.category IS DISTINCT FROM 'TOPGEAR_PAYMENT'
	AND EXISTS (
		SELECT 1
		FROM payment p
		WHERE p.winnings_id = w.winning_id
			AND p.billing_account IN ('80000062', '80002800')
	);