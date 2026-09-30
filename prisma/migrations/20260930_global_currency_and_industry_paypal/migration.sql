-- Global user display/default currency + industry PayPal payout destination
ALTER TABLE public."User"
  ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'ZAR';

ALTER TABLE public."IndustryUser"
  ADD COLUMN IF NOT EXISTS "paypalEmail" TEXT;

UPDATE public."User"
SET "currency" = COALESCE(NULLIF("currency", ''), 'ZAR')
WHERE "currency" IS NULL OR "currency" = '';

CREATE INDEX IF NOT EXISTS "User_currency_idx" ON public."User" ("currency");