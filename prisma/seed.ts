import { PrismaClient, Role, SpiceLevel } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // 1. Always ensure singleton PlatformSetting exists
  await prisma.platformSetting.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      feePercentage: "10.00",
      feeCapAed: "1.00",
      currency: "AED",
      tableSessionTtlHours: 4,
    },
  });
  console.log("✔ PlatformSetting ensured (10% fee, AED 1.00 cap, AED currency).");

  // 2. Demo accounts & demo restaurant are strictly gated by SEED_DEMO=true
  if (process.env.SEED_DEMO !== "true") {
    console.log("ℹ SEED_DEMO is not 'true'; skipping demo accounts and demo restaurant.");
    return;
  }

  const demoPassword = process.env.DEMO_PASSWORD?.trim();
  if (!demoPassword || demoPassword.length < 8) {
    throw new Error(
      "SEED_DEMO=true requires DEMO_PASSWORD (at least 8 characters) to be set in environment variables.",
    );
  }

  const passwordHash = await bcrypt.hash(demoPassword, 10);

  // Admin, Owner, Staff (@example.com per safety/privacy rules)
  await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: { passwordHash, role: Role.ADMIN, name: "Platform Admin" },
    create: {
      email: "admin@example.com",
      passwordHash,
      name: "Platform Admin",
      role: Role.ADMIN,
      locale: "en",
    },
  });

  const owner = await prisma.user.upsert({
    where: { email: "owner@example.com" },
    update: { passwordHash, role: Role.RESTAURANT_OWNER, name: "Layla Mansour (Owner)" },
    create: {
      email: "owner@example.com",
      passwordHash,
      name: "Layla Mansour (Owner)",
      role: Role.RESTAURANT_OWNER,
      locale: "en",
    },
  });

  const staff = await prisma.user.upsert({
    where: { email: "staff@example.com" },
    update: { passwordHash, role: Role.RESTAURANT_STAFF, name: "Karim Haddad (Staff)" },
    create: {
      email: "staff@example.com",
      passwordHash,
      name: "Karim Haddad (Staff)",
      role: Role.RESTAURANT_STAFF,
      locale: "en",
    },
  });

  // Demo Diners: Claude (Vegetarian), Bilal (Lactose intolerant), James (Meal budget AED 40.00)
  const claude = await prisma.user.upsert({
    where: { email: "claude@example.com" },
    update: { passwordHash, role: Role.DINER, name: "Claude" },
    create: {
      email: "claude@example.com",
      passwordHash,
      name: "Claude",
      role: Role.DINER,
      locale: "en",
    },
  });
  await prisma.dinerProfile.upsert({
    where: { userId: claude.id },
    update: {
      displayName: "Claude",
      dietaryRestrictions: ["vegetarian"],
      allergens: [],
      likedIngredients: ["chickpeas", "eggplant", "pomegranate", "olive oil", "mint"],
      dislikedIngredients: [],
      spiceTolerance: SpiceLevel.MEDIUM,
      maxBudgetAed: null,
    },
    create: {
      userId: claude.id,
      displayName: "Claude",
      dietaryRestrictions: ["vegetarian"],
      allergens: [],
      likedIngredients: ["chickpeas", "eggplant", "pomegranate", "olive oil", "mint"],
      dislikedIngredients: [],
      spiceTolerance: SpiceLevel.MEDIUM,
      maxBudgetAed: null,
    },
  });

  const bilal = await prisma.user.upsert({
    where: { email: "bilal@example.com" },
    update: { passwordHash, role: Role.DINER, name: "Bilal" },
    create: {
      email: "bilal@example.com",
      passwordHash,
      name: "Bilal",
      role: Role.DINER,
      locale: "en",
    },
  });
  await prisma.dinerProfile.upsert({
    where: { userId: bilal.id },
    update: {
      displayName: "Bilal",
      dietaryRestrictions: ["halal"],
      allergens: ["milk"],
      likedIngredients: ["garlic", "charcoal chicken", "sumac", "lemon"],
      dislikedIngredients: [],
      spiceTolerance: SpiceLevel.HOT,
      maxBudgetAed: null,
    },
    create: {
      userId: bilal.id,
      displayName: "Bilal",
      dietaryRestrictions: ["halal"],
      allergens: ["milk"],
      likedIngredients: ["garlic", "charcoal chicken", "sumac", "lemon"],
      dislikedIngredients: [],
      spiceTolerance: SpiceLevel.HOT,
      maxBudgetAed: null,
    },
  });

  const james = await prisma.user.upsert({
    where: { email: "james@example.com" },
    update: { passwordHash, role: Role.DINER, name: "James" },
    create: {
      email: "james@example.com",
      passwordHash,
      name: "James",
      role: Role.DINER,
      locale: "en",
    },
  });
  await prisma.dinerProfile.upsert({
    where: { userId: james.id },
    update: {
      displayName: "James",
      dietaryRestrictions: [],
      allergens: [],
      likedIngredients: ["grilled meat", "fries", "hummus"],
      dislikedIngredients: ["olives"],
      spiceTolerance: SpiceLevel.MILD,
      maxBudgetAed: "40.00",
    },
    create: {
      userId: james.id,
      displayName: "James",
      dietaryRestrictions: [],
      allergens: [],
      likedIngredients: ["grilled meat", "fries", "hummus"],
      dislikedIngredients: ["olives"],
      spiceTolerance: SpiceLevel.MILD,
      maxBudgetAed: "40.00",
    },
  });

  // Fictional Demo Restaurant shell (full ~40-dish menu added in Phase 3/4)
  const demoRestaurant = await prisma.restaurant.upsert({
    where: { slug: "demo-lebanese-kitchen" },
    update: {
      nameEn: "Demo Lebanese Kitchen",
      nameAr: "المطبخ اللبناني التجريبي",
      descriptionEn:
        "Fictional Levantine kitchen showcasing personalized allergen-safe & budget-smart menus.",
      descriptionAr:
        "مطعم لبناني تجريبي يعرض القوائم المخصصة الآمنة من مسببات الحساسية والمناسبة للميزانية.",
      cuisine: "Lebanese",
      status: "APPROVED",
      isDemo: true,
      ownerId: owner.id,
    },
    create: {
      slug: "demo-lebanese-kitchen",
      nameEn: "Demo Lebanese Kitchen",
      nameAr: "المطبخ اللبناني التجريبي",
      descriptionEn:
        "Fictional Levantine kitchen showcasing personalized allergen-safe & budget-smart menus.",
      descriptionAr:
        "مطعم لبناني تجريبي يعرض القوائم المخصصة الآمنة من مسببات الحساسية والمناسبة للميزانية.",
      cuisine: "Lebanese",
      status: "APPROVED",
      isDemo: true,
      ownerId: owner.id,
    },
  });

  await prisma.restaurantMember.upsert({
    where: {
      restaurantId_userId: {
        restaurantId: demoRestaurant.id,
        userId: staff.id,
      },
    },
    update: { role: Role.RESTAURANT_STAFF },
    create: {
      restaurantId: demoRestaurant.id,
      userId: staff.id,
      role: Role.RESTAURANT_STAFF,
    },
  });

  console.log("✔ Seeded demo users (@example.com) and Demo Lebanese Kitchen shell.");
}

main()
  .catch((err) => {
    console.error("Seed error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
