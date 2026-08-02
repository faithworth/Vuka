-- CreateTable
CREATE TABLE "AiGeneration" (
    "id" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "styleTag" TEXT,
    "model" TEXT NOT NULL,
    "resultUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiGeneration_createdByUserId_createdAt_idx" ON "AiGeneration"("createdByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AiGeneration_kind_createdAt_idx" ON "AiGeneration"("kind", "createdAt");
