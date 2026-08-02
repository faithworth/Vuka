-- CreateTable
CREATE TABLE "AiJob" (
    "id" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "input" JSONB NOT NULL,
    "progress" JSONB NOT NULL DEFAULT '[]',
    "totalSteps" INTEGER NOT NULL DEFAULT 0,
    "resultUrl" TEXT,
    "error" TEXT,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiJob_createdByUserId_createdAt_idx" ON "AiJob"("createdByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AiJob_status_idx" ON "AiJob"("status");
