-- AlterTable: PlatformFee post-invoice void credit tracking
ALTER TABLE "PlatformFee" ADD COLUMN "voidCreditInvoiceId" TEXT;

-- AlterTable: Invoice sequential numbering, Dubai period bounds, frozen snapshot & adjustments
ALTER TABLE "Invoice" ADD COLUMN "sequenceNumber" SERIAL NOT NULL,
ADD COLUMN "periodStartUtc" TIMESTAMP(3),
ADD COLUMN "periodEndUtc" TIMESTAMP(3),
ADD COLUMN "periodFeesAed" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN "adjustmentsAed" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN "lineItemsSnapshot" JSONB NOT NULL DEFAULT '[]';

-- CreateTable: AdminAuditLog
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_sequenceNumber_key" ON "Invoice"("sequenceNumber");

-- CreateIndex
CREATE INDEX "PlatformFee_restaurantId_isVoided_voidCreditInvoiceId_idx" ON "PlatformFee"("restaurantId", "isVoided", "voidCreditInvoiceId");

-- CreateIndex
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_targetType_targetId_idx" ON "AdminAuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AdminAuditLog_actorUserId_createdAt_idx" ON "AdminAuditLog"("actorUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "PlatformFee" ADD CONSTRAINT "PlatformFee_voidCreditInvoiceId_fkey" FOREIGN KEY ("voidCreditInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
