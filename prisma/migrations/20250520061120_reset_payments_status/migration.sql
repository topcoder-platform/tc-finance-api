-- Update all payments witha "owed" status to "on_hold" for users that don't have a trolley_id
-- and no trolley_recipient_payment_method set.

UPDATE payment
SET payment_status = 'ON_HOLD'
WHERE winnings_id IN (
  SELECT winnings.winning_id
  FROM winnings
  LEFT JOIN trolley_recipient ON winnings.winner_id = trolley_recipient.user_id
  LEFT JOIN trolley_recipient_payment_method ON trolley_recipient.id = trolley_recipient_payment_method.trolley_recipient_id
  WHERE payment.payment_status = 'OWED' AND (
	trolley_recipient.trolley_id IS NULL OR
	trolley_recipient_payment_method.id IS NULL
  )
);

-- To test & see the updated payments:
--
-- SELECT payment.payment_id,
--        payment.total_amount,
--        payment.installment_number,
--        payment.payment_method_id,
--        payment.version,
--        payment.payment_status,
--        winnings.winner_id,
--        trolley_recipient.trolley_id,
--        trolley_recipient_payment_method.recipient_account_id
-- FROM payment
-- LEFT JOIN winnings ON payment.winnings_id = winnings.winning_id
-- LEFT JOIN trolley_recipient ON winnings.winner_id = trolley_recipient.user_id
-- LEFT JOIN trolley_recipient_payment_method ON trolley_recipient.id = trolley_recipient_payment_method.trolley_recipient_id
-- WHERE payment.payment_status = 'OWED'
--   AND trolley_recipient.trolley_id IS NULL
--   AND trolley_recipient_payment_method.id IS NULL;
