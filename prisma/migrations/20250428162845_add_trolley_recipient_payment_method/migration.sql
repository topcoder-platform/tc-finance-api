-- CreateTable
CREATE TABLE "trolley_recipient_payment_method" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "trolley_recipient_id" INTEGER NOT NULL,
    "recipient_account_id" VARCHAR(80) NOT NULL,

    CONSTRAINT "trolley_recipient_payment_method_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trolley_recipient_payment_method_recipient_account_id_key" ON "trolley_recipient_payment_method"("recipient_account_id");

-- AddForeignKey
ALTER TABLE "trolley_recipient_payment_method" ADD CONSTRAINT "fk_trolley_recipient_trolley_recipient_payment_method" FOREIGN KEY ("trolley_recipient_id") REFERENCES "trolley_recipient"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
