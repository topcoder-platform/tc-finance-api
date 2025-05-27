-- AlterTable
ALTER TABLE "payoneer_payment_method" ALTER COLUMN "user_payment_method_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "paypal_payment_method" ALTER COLUMN "user_payment_method_id" DROP NOT NULL;

UPDATE payoneer_payment_method SET user_payment_method_id = NULL;
UPDATE paypal_payment_method   SET user_payment_method_id = NULL;

DROP TABLE user_default_payment_method;

DELETE FROM user_payment_methods
WHERE payment_method_id NOT IN (
  SELECT payment_method_id
  FROM payment_method
  WHERE payment_method_type IN ('Wipro Payroll', 'Trolley')
);
