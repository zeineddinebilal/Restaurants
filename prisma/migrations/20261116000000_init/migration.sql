-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('DINER', 'RESTAURANT_OWNER', 'RESTAURANT_STAFF', 'ADMIN');

-- CreateEnum
CREATE TYPE "RestaurantStatus" AS ENUM ('PENDING', 'APPROVED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('AI_SUGGESTED', 'RESTAURANT_VERIFIED');

-- CreateEnum
CREATE TYPE "SpiceLevel" AS ENUM ('NONE', 'MILD', 'MEDIUM', 'HOT');

-- CreateEnum
CREATE TYPE "MeatType" AS ENUM ('NONE', 'CHICKEN', 'BEEF', 'LAMB', 'FISH', 'SHELLFISH', 'OTHER');

-- CreateEnum
CREATE TYPE "TableSessionStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('SENT', 'ACCEPTED', 'PREPARING', 'SERVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'DINER',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DinerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "guestToken" TEXT,
    "displayName" TEXT NOT NULL,
    "dietaryRestrictions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allergens" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "likedIngredients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dislikedIngredients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "favoriteCuisines" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "spiceTolerance" "SpiceLevel" NOT NULL DEFAULT 'MEDIUM',
    "maxBudgetAed" DECIMAL(10,2),
    "preferHighProtein" BOOLEAN NOT NULL DEFAULT false,
    "preferKeto" BOOLEAN NOT NULL DEFAULT false,
    "onboardingTranscript" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DinerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Restaurant" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "descriptionEn" TEXT,
    "descriptionAr" TEXT,
    "cuisine" TEXT NOT NULL DEFAULT 'Lebanese',
    "logoUrl" TEXT,
    "status" "RestaurantStatus" NOT NULL DEFAULT 'PENDING',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Restaurant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "addressEn" TEXT,
    "addressAr" TEXT,
    "city" TEXT NOT NULL DEFAULT 'Dubai',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantMember" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "branchId" TEXT,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'RESTAURANT_STAFF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RestaurantMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuCategory" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "descriptionEn" TEXT,
    "descriptionAr" TEXT,
    "priceAed" DECIMAL(10,2) NOT NULL,
    "portionSize" TEXT,
    "ingredientsEn" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ingredientsAr" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dietTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allergens" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allergenDataProvided" BOOLEAN NOT NULL DEFAULT false,
    "spiceLevel" "SpiceLevel" NOT NULL DEFAULT 'NONE',
    "meatType" "MeatType" NOT NULL DEFAULT 'NONE',
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'AI_SUGGESTED',
    "aiConfidence" DECIMAL(4,3),
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "isPopular" BOOLEAN NOT NULL DEFAULT false,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "cachedBlurbEn" TEXT,
    "cachedBlurbAr" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItemModifier" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "priceDeltaAed" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "removesAllergens" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "addsDietTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'AI_SUGGESTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuItemModifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiningTable" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "branchId" TEXT,
    "tableCode" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 4,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiningTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TableSession" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "status" "TableSessionStatus" NOT NULL DEFAULT 'OPEN',
    "shareCode" TEXT NOT NULL,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "TableSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TableParticipant" (
    "id" TEXT NOT NULL,
    "tableSessionId" TEXT NOT NULL,
    "dinerProfileId" TEXT,
    "guestToken" TEXT,
    "displayName" TEXT NOT NULL,
    "cartItems" JSONB NOT NULL DEFAULT '[]',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TableParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderNumber" SERIAL NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "tableSessionId" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "placedByProfileId" TEXT,
    "placedByGuestToken" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'SENT',
    "subtotalAed" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,
    "cancelReason" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "preparingAt" TIMESTAMP(3),
    "servedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "participantId" TEXT,
    "participantName" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPriceAed" DECIMAL(10,2) NOT NULL,
    "lineTotalAed" DECIMAL(10,2) NOT NULL,
    "selectedModifiers" JSONB NOT NULL DEFAULT '[]',
    "specialInstructions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DishRating" (
    "id" TEXT NOT NULL,
    "dinerProfileId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "orderId" TEXT,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DishRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "feePercentage" DECIMAL(5,2) NOT NULL DEFAULT 10.00,
    "feeCapAed" DECIMAL(10,2) NOT NULL DEFAULT 1.00,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "tableSessionTtlHours" INTEGER NOT NULL DEFAULT 4,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformFee" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "orderSubtotalAed" DECIMAL(10,2) NOT NULL,
    "feePercentageApplied" DECIMAL(5,2) NOT NULL,
    "feeCapAppliedAed" DECIMAL(10,2) NOT NULL,
    "feeAmountAed" DECIMAL(10,2) NOT NULL,
    "isVoided" BOOLEAN NOT NULL DEFAULT false,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "invoiceId" TEXT,

    CONSTRAINT "PlatformFee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "totalOrders" INTEGER NOT NULL,
    "grossSalesAed" DECIMAL(10,2) NOT NULL,
    "totalFeesAed" DECIMAL(10,2) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuScanEvent" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "tableId" TEXT,
    "dietaryRestrictions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allergens" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hasBudget" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MenuScanEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalMenuScan" (
    "id" TEXT NOT NULL,
    "dinerProfileId" TEXT,
    "guestToken" TEXT,
    "sourceLabel" TEXT,
    "extractedMenu" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalMenuScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsageLog" (
    "id" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorMessage" TEXT,
    "restaurantId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "DinerProfile_userId_key" ON "DinerProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DinerProfile_guestToken_key" ON "DinerProfile"("guestToken");

-- CreateIndex
CREATE UNIQUE INDEX "Restaurant_slug_key" ON "Restaurant"("slug");

-- CreateIndex
CREATE INDEX "Restaurant_ownerId_idx" ON "Restaurant"("ownerId");

-- CreateIndex
CREATE INDEX "Restaurant_status_idx" ON "Restaurant"("status");

-- CreateIndex
CREATE INDEX "Branch_restaurantId_idx" ON "Branch"("restaurantId");

-- CreateIndex
CREATE INDEX "RestaurantMember_userId_idx" ON "RestaurantMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantMember_restaurantId_userId_key" ON "RestaurantMember"("restaurantId", "userId");

-- CreateIndex
CREATE INDEX "MenuCategory_restaurantId_sortOrder_idx" ON "MenuCategory"("restaurantId", "sortOrder");

-- CreateIndex
CREATE INDEX "MenuItem_restaurantId_isPublished_isAvailable_idx" ON "MenuItem"("restaurantId", "isPublished", "isAvailable");

-- CreateIndex
CREATE INDEX "MenuItem_categoryId_idx" ON "MenuItem"("categoryId");

-- CreateIndex
CREATE INDEX "MenuItemModifier_menuItemId_idx" ON "MenuItemModifier"("menuItemId");

-- CreateIndex
CREATE INDEX "DiningTable_restaurantId_idx" ON "DiningTable"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "DiningTable_restaurantId_tableCode_key" ON "DiningTable"("restaurantId", "tableCode");

-- CreateIndex
CREATE UNIQUE INDEX "TableSession_shareCode_key" ON "TableSession"("shareCode");

-- CreateIndex
CREATE INDEX "TableSession_tableId_status_idx" ON "TableSession"("tableId", "status");

-- CreateIndex
CREATE INDEX "TableSession_restaurantId_status_idx" ON "TableSession"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "TableParticipant_tableSessionId_idx" ON "TableParticipant"("tableSessionId");

-- CreateIndex
CREATE INDEX "Order_restaurantId_status_sentAt_idx" ON "Order"("restaurantId", "status", "sentAt");

-- CreateIndex
CREATE INDEX "Order_tableSessionId_idx" ON "Order"("tableSessionId");

-- CreateIndex
CREATE INDEX "Order_placedByGuestToken_sentAt_idx" ON "Order"("placedByGuestToken", "sentAt");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "DishRating_menuItemId_idx" ON "DishRating"("menuItemId");

-- CreateIndex
CREATE INDEX "DishRating_dinerProfileId_idx" ON "DishRating"("dinerProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformFee_orderId_key" ON "PlatformFee"("orderId");

-- CreateIndex
CREATE INDEX "PlatformFee_restaurantId_recordedAt_idx" ON "PlatformFee"("restaurantId", "recordedAt");

-- CreateIndex
CREATE INDEX "PlatformFee_invoiceId_idx" ON "PlatformFee"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Invoice_restaurantId_idx" ON "Invoice"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_restaurantId_year_month_key" ON "Invoice"("restaurantId", "year", "month");

-- CreateIndex
CREATE INDEX "MenuScanEvent_restaurantId_createdAt_idx" ON "MenuScanEvent"("restaurantId", "createdAt");

-- CreateIndex
CREATE INDEX "ExternalMenuScan_dinerProfileId_idx" ON "ExternalMenuScan"("dinerProfileId");

-- CreateIndex
CREATE INDEX "AiUsageLog_agentName_createdAt_idx" ON "AiUsageLog"("agentName", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsageLog_restaurantId_createdAt_idx" ON "AiUsageLog"("restaurantId", "createdAt");

-- AddForeignKey
ALTER TABLE "DinerProfile" ADD CONSTRAINT "DinerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Restaurant" ADD CONSTRAINT "Restaurant_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantMember" ADD CONSTRAINT "RestaurantMember_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantMember" ADD CONSTRAINT "RestaurantMember_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantMember" ADD CONSTRAINT "RestaurantMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuCategory" ADD CONSTRAINT "MenuCategory_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MenuCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItemModifier" ADD CONSTRAINT "MenuItemModifier_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiningTable" ADD CONSTRAINT "DiningTable_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiningTable" ADD CONSTRAINT "DiningTable_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableSession" ADD CONSTRAINT "TableSession_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableSession" ADD CONSTRAINT "TableSession_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "DiningTable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableParticipant" ADD CONSTRAINT "TableParticipant_tableSessionId_fkey" FOREIGN KEY ("tableSessionId") REFERENCES "TableSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableParticipant" ADD CONSTRAINT "TableParticipant_dinerProfileId_fkey" FOREIGN KEY ("dinerProfileId") REFERENCES "DinerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_tableSessionId_fkey" FOREIGN KEY ("tableSessionId") REFERENCES "TableSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "DiningTable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_placedByProfileId_fkey" FOREIGN KEY ("placedByProfileId") REFERENCES "DinerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "TableParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishRating" ADD CONSTRAINT "DishRating_dinerProfileId_fkey" FOREIGN KEY ("dinerProfileId") REFERENCES "DinerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishRating" ADD CONSTRAINT "DishRating_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishRating" ADD CONSTRAINT "DishRating_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformFee" ADD CONSTRAINT "PlatformFee_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformFee" ADD CONSTRAINT "PlatformFee_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformFee" ADD CONSTRAINT "PlatformFee_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuScanEvent" ADD CONSTRAINT "MenuScanEvent_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuScanEvent" ADD CONSTRAINT "MenuScanEvent_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "DiningTable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalMenuScan" ADD CONSTRAINT "ExternalMenuScan_dinerProfileId_fkey" FOREIGN KEY ("dinerProfileId") REFERENCES "DinerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsageLog" ADD CONSTRAINT "AiUsageLog_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsageLog" ADD CONSTRAINT "AiUsageLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
