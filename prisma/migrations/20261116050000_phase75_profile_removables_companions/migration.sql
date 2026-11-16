-- AlterTable: DinerProfile custom hard restrictions & companion privacy
ALTER TABLE "DinerProfile" ADD COLUMN "customAvoidIngredients" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "shareFullProfileWithCompanions" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: MenuItem removable ingredients & owner confirmation flag
ALTER TABLE "MenuItem" ADD COLUMN "removableIngredients" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "removableIngredientsVerified" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: TableSession payment mode ("SPLIT_BY_PERSON" | "ONE_PERSON_PAYS_ALL")
ALTER TABLE "TableSession" ADD COLUMN "paymentMode" TEXT NOT NULL DEFAULT 'SPLIT_BY_PERSON',
ADD COLUMN "payerParticipantId" TEXT;

-- CreateTable: CompanionInvite
CREATE TABLE "CompanionInvite" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "inviterProfileId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanionInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable: DiningCompanion
CREATE TABLE "DiningCompanion" (
    "id" TEXT NOT NULL,
    "profileAId" TEXT NOT NULL,
    "profileBId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiningCompanion_pkey" PRIMARY KEY ("id")
);

-- CreateTable: MealPlan
CREATE TABLE "MealPlan" (
    "id" TEXT NOT NULL,
    "hostProfileId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "appliedTableSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable: MealPlanMember
CREATE TABLE "MealPlanMember" (
    "id" TEXT NOT NULL,
    "mealPlanId" TEXT NOT NULL,
    "dinerProfileId" TEXT NOT NULL,
    "plannedItems" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealPlanMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanionInvite_code_key" ON "CompanionInvite"("code");
CREATE INDEX "CompanionInvite_inviterProfileId_idx" ON "CompanionInvite"("inviterProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "DiningCompanion_profileAId_profileBId_key" ON "DiningCompanion"("profileAId", "profileBId");
CREATE INDEX "DiningCompanion_profileBId_idx" ON "DiningCompanion"("profileBId");

-- CreateIndex
CREATE INDEX "MealPlan_restaurantId_status_idx" ON "MealPlan"("restaurantId", "status");
CREATE INDEX "MealPlan_hostProfileId_status_idx" ON "MealPlan"("hostProfileId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MealPlanMember_mealPlanId_dinerProfileId_key" ON "MealPlanMember"("mealPlanId", "dinerProfileId");
CREATE INDEX "MealPlanMember_dinerProfileId_idx" ON "MealPlanMember"("dinerProfileId");

-- AddForeignKey
ALTER TABLE "CompanionInvite" ADD CONSTRAINT "CompanionInvite_inviterProfileId_fkey" FOREIGN KEY ("inviterProfileId") REFERENCES "DinerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiningCompanion" ADD CONSTRAINT "DiningCompanion_profileAId_fkey" FOREIGN KEY ("profileAId") REFERENCES "DinerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiningCompanion" ADD CONSTRAINT "DiningCompanion_profileBId_fkey" FOREIGN KEY ("profileBId") REFERENCES "DinerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MealPlan" ADD CONSTRAINT "MealPlan_hostProfileId_fkey" FOREIGN KEY ("hostProfileId") REFERENCES "DinerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MealPlan" ADD CONSTRAINT "MealPlan_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MealPlanMember" ADD CONSTRAINT "MealPlanMember_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "MealPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MealPlanMember" ADD CONSTRAINT "MealPlanMember_dinerProfileId_fkey" FOREIGN KEY ("dinerProfileId") REFERENCES "DinerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
