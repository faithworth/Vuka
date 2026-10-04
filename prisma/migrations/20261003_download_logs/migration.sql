-- Download logging: one row per file/zip actually served.
-- Lets us answer "how many downloads, by how many people, from where".
-- Raw IPs are NOT stored; ipHash is a salted SHA-256 (unique-visitor counting only).

CREATE TABLE IF NOT EXISTS "download_logs" (
  "id"         TEXT         NOT NULL,
  "purchaseId" TEXT         NOT NULL,
  "itemType"   TEXT         NOT NULL DEFAULT '',
  "itemId"     TEXT         NOT NULL DEFAULT '',
  "kind"       TEXT         NOT NULL DEFAULT 'file', -- file | zip
  "fileIndex"  INTEGER,
  "country"    TEXT         NOT NULL DEFAULT '',
  "ipHash"     TEXT         NOT NULL DEFAULT '',
  "userAgent"  TEXT         NOT NULL DEFAULT '',
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "download_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "download_logs_purchaseId_idx" ON "download_logs" ("purchaseId");
CREATE INDEX IF NOT EXISTS "download_logs_itemType_itemId_createdAt_idx" ON "download_logs" ("itemType", "itemId", "createdAt");
CREATE INDEX IF NOT EXISTS "download_logs_createdAt_idx" ON "download_logs" ("createdAt");
