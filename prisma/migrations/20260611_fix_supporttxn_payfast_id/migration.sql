-- Add payfastPaymentId to SupportTxn
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'SupportTxn' AND column_name = 'payfastPaymentId'
  ) THEN
    ALTER TABLE "SupportTxn" ADD COLUMN "payfastPaymentId" TEXT;
  END IF;
END $$;
