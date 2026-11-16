-- AlterTable: Restaurant allergen PIC & existing payment QR coexistence fields
ALTER TABLE "Restaurant" ADD COLUMN "allergenPersonInCharge" TEXT,
ADD COLUMN "existingPaymentProvider" TEXT NOT NULL DEFAULT 'NONE',
ADD COLUMN "existingPaymentUrl" TEXT;

-- AlterTable: MenuItem optional caloriesKcal
ALTER TABLE "MenuItem" ADD COLUMN "caloriesKcal" INTEGER;

-- CreateTable: Prospect (Sales Pipeline CRM)
CREATE TABLE "Prospect" (
    "id" TEXT NOT NULL,
    "normalizedKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "area" TEXT NOT NULL DEFAULT '',
    "district" TEXT,
    "city" TEXT NOT NULL DEFAULT 'Dubai',
    "cuisine" TEXT,
    "priceTier" TEXT,
    "address" TEXT,
    "website" TEXT,
    "instagram" TEXT,
    "phone" TEXT,
    "ownership" TEXT,
    "existingQrProvider" TEXT,
    "whyFitNotes" TEXT,
    "top30Rank" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'GREY',
    "source" TEXT NOT NULL DEFAULT 'admin',
    "contactPerson" TEXT,
    "dateApproached" TEXT,
    "outcomeNotes" TEXT,
    "rewardOrOffer" TEXT,
    "notesHistory" JSONB NOT NULL DEFAULT '[]',
    "inviteToken" TEXT,
    "convertedRestaurantId" TEXT,
    "lastUpdatedById" TEXT,
    "lastUpdatedByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prospect_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Prospect_normalizedKey_key" ON "Prospect"("normalizedKey");
CREATE UNIQUE INDEX "Prospect_inviteToken_key" ON "Prospect"("inviteToken");
CREATE UNIQUE INDEX "Prospect_convertedRestaurantId_key" ON "Prospect"("convertedRestaurantId");
CREATE INDEX "Prospect_city_status_idx" ON "Prospect"("city", "status");
CREATE INDEX "Prospect_top30Rank_idx" ON "Prospect"("top30Rank");
CREATE INDEX "Prospect_status_updatedAt_idx" ON "Prospect"("status", "updatedAt");

-- AddForeignKey
ALTER TABLE "Prospect" ADD CONSTRAINT "Prospect_convertedRestaurantId_fkey" FOREIGN KEY ("convertedRestaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
