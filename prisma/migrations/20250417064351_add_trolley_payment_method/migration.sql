-- CreateTable
CREATE TABLE "trolley_recipient" (
    "id" SERIAL NOT NULL,
    "user_payment_method_id" UUID NOT NULL,
    "user_id" VARCHAR(80) NOT NULL,
    "trolley_id" VARCHAR(80) NOT NULL,

    CONSTRAINT "trolley_recipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trolley_recipient_user_id_key" ON "trolley_recipient"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "trolley_recipient_trolley_id_key" ON "trolley_recipient"("trolley_id");

-- AddForeignKey
ALTER TABLE "trolley_recipient" ADD CONSTRAINT "fk_trolley_user_payment_method" FOREIGN KEY ("user_payment_method_id") REFERENCES "user_payment_methods"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- Insert Trolley payment method
INSERT INTO payment_method (payment_method_id, payment_method_type, name, description)
VALUES (50, 'Trolley', 'Trolley', 'Trolley is a modern payouts platform designed for the internet economy.');