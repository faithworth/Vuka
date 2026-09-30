-- Permanently retain approved artist verification evidence.
ALTER TABLE "VerificationRequest"
  ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approvedBy" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "documentRetainedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "documentMimeType" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "retentionLocked" BOOLEAN NOT NULL DEFAULT false;

-- Repair the legacy alias if an older row only populated idDocUrl.
UPDATE "VerificationRequest"
SET "idDocumentUrl" = "idDocUrl"
WHERE COALESCE("idDocumentUrl", '') = ''
  AND COALESCE("idDocUrl", '') <> '';

-- Mark any already-approved rows as retained without changing their evidence.
UPDATE "VerificationRequest"
SET
  "approvedAt" = COALESCE("approvedAt", "reviewedAt", "updatedAt"),
  "approvedBy" = COALESCE(NULLIF("approvedBy", ''), "reviewedBy"),
  "documentRetainedAt" = COALESCE("documentRetainedAt", "reviewedAt", "updatedAt"),
  "retentionLocked" = true
WHERE "status" = 'approved';

CREATE OR REPLACE FUNCTION protect_approved_verification_request()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."status" = 'approved' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Approved verification records are permanently retained';
    END IF;

    IF NEW."status" <> 'approved'
       OR NEW."artistId" <> OLD."artistId"
       OR NEW."legalName" <> OLD."legalName"
       OR NEW."idDocumentUrl" <> OLD."idDocumentUrl"
       OR NEW."idDocUrl" <> OLD."idDocUrl"
       OR NEW."createdAt" <> OLD."createdAt"
       OR NEW."approvedAt" IS DISTINCT FROM OLD."approvedAt"
       OR NEW."approvedBy" <> OLD."approvedBy"
       OR NEW."documentRetainedAt" IS DISTINCT FROM OLD."documentRetainedAt"
       OR NEW."retentionLocked" <> OLD."retentionLocked"
    THEN
      RAISE EXCEPTION 'Approved verification evidence is immutable';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS protect_approved_verification_request ON "VerificationRequest";

CREATE TRIGGER protect_approved_verification_request
BEFORE UPDATE OR DELETE ON "VerificationRequest"
FOR EACH ROW
EXECUTE FUNCTION protect_approved_verification_request();
