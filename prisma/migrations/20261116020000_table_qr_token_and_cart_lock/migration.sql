-- Add 128-bit per-table QR secret token (backfilling existing rows cleanly) and shared-cart CAS fields
ALTER TABLE "DiningTable" ADD COLUMN "qrToken" TEXT;
UPDATE "DiningTable"
SET "qrToken" = md5(random()::text || clock_timestamp()::text || "id")
WHERE "qrToken" IS NULL;
ALTER TABLE "DiningTable" ALTER COLUMN "qrToken" SET NOT NULL;

ALTER TABLE "TableSession"
ADD COLUMN "cartVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "lastCartOrderId" TEXT;
