-- Index the payment-reference lookup columns.
--
-- The Paystack webhook handler's atomic `updateMany` (keyed on
-- paystackReference to fix the confirm-race-condition) and the ticket
-- reconciliation path filter directly on these columns on every single
-- payment confirmation. Neither had an index — every webhook delivery was
-- doing a full table scan to find the one row it needed to update.

CREATE INDEX IF NOT EXISTS "Purchase_paystackReference_idx" ON "Purchase"("paystackReference");
CREATE INDEX IF NOT EXISTS "ticket_purchases_paystackReference_idx" ON "ticket_purchases"("paystackReference");
