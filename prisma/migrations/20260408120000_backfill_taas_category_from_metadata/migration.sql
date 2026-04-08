-- Backfill existing winnings rows where the linked challenge metadata marks payment_type=taas.
DO $$
BEGIN
	IF to_regclass('challenges."ChallengeMetadata"') IS NOT NULL THEN
		UPDATE winnings w
		SET category = 'TAAS_PAYMENT'
		FROM challenges."ChallengeMetadata" cm
		WHERE cm."challengeId" = w.external_id
			AND lower(cm.name) = 'payment_type'
			AND lower(cm.value) = 'taas'
			AND w.type = 'PAYMENT'
			AND w.created_at >= TIMESTAMP '2026-04-01 00:00:00'
			AND w.category IS DISTINCT FROM 'TAAS_PAYMENT';
	END IF;
END;
$$;
