-- AlterTable
ALTER TABLE "AiUsageLog" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'COMPLETED',
ADD COLUMN "callerKey" TEXT,
ADD COLUMN "clientIp" TEXT;

-- CreateIndex
CREATE INDEX "AiUsageLog_createdAt_idx" ON "AiUsageLog"("createdAt");

-- CreateIndex
CREATE INDEX "AiUsageLog_callerKey_createdAt_idx" ON "AiUsageLog"("callerKey", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsageLog_clientIp_createdAt_idx" ON "AiUsageLog"("clientIp", "createdAt");
