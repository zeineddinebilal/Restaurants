import { PrismaClient, Role, SpiceLevel } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import {
  DEMO_LEBANESE_CATEGORIES,
  inferDemoRemovableIngredients,
} from "../src/lib/demo/lebanese-menu-data";

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

  // Admin, Owner, Staff (@example.com)
  await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: { passwordHash, role: Role.ADMIN, name: "Platform Admin", isActive: true },
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
    update: {
      passwordHash,
      role: Role.RESTAURANT_OWNER,
      name: "Layla Mansour (Owner)",
      isActive: true,
    },
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
    update: {
      passwordHash,
      role: Role.RESTAURANT_STAFF,
      name: "Karim Haddad (Staff)",
      isActive: true,
    },
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
    update: { passwordHash, role: Role.DINER, name: "Claude", isActive: true },
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
    update: { passwordHash, role: Role.DINER, name: "Bilal", isActive: true },
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
    update: { passwordHash, role: Role.DINER, name: "James", isActive: true },
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

  // Fictional Demo Restaurant + Branches + Tables + ~40-Dish Menu
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
      allergenPersonInCharge: "Chef Karim Mansour",
      existingPaymentProvider: "QLUB",
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
      allergenPersonInCharge: "Chef Karim Mansour",
      existingPaymentProvider: "QLUB",
      status: "APPROVED",
      isDemo: true,
      ownerId: owner.id,
    },
  });

  // Branches (idempotent lookup by nameEn)
  let marinaBranch = await prisma.branch.findFirst({
    where: { restaurantId: demoRestaurant.id, nameEn: "Dubai Marina Walk" },
  });
  if (!marinaBranch) {
    marinaBranch = await prisma.branch.create({
      data: {
        restaurantId: demoRestaurant.id,
        nameEn: "Dubai Marina Walk",
        nameAr: "ممشى دبي مارينا",
        addressEn: "Promenade Level, Dubai Marina, Dubai",
        addressAr: "ممشى دبي مارينا، دبي",
        city: "Dubai",
        isActive: true,
      },
    });
  }

  const cornicheBranch = await prisma.branch.findFirst({
    where: { restaurantId: demoRestaurant.id, nameEn: "Abu Dhabi Corniche" },
  });
  if (!cornicheBranch) {
    await prisma.branch.create({
      data: {
        restaurantId: demoRestaurant.id,
        nameEn: "Abu Dhabi Corniche",
        nameAr: "كورنيش أبوظبي",
        addressEn: "West Corniche Road, Abu Dhabi",
        addressAr: "طريق الكورنيش الغربي، أبوظبي",
        city: "Abu Dhabi",
        isActive: true,
      },
    });
  }

  await prisma.restaurantMember.upsert({
    where: {
      restaurantId_userId: {
        restaurantId: demoRestaurant.id,
        userId: staff.id,
      },
    },
    update: { role: Role.RESTAURANT_STAFF, branchId: marinaBranch.id, isActive: true },
    create: {
      restaurantId: demoRestaurant.id,
      branchId: marinaBranch.id,
      userId: staff.id,
      role: Role.RESTAURANT_STAFF,
      isActive: true,
    },
  });

  // 5 Demo Tables (T1 - T5)
  const demoTables = [
    { code: "T1", name: "Table 1 — Marina Terrace", capacity: 4 },
    { code: "T2", name: "Table 2 — Olive Courtyard", capacity: 2 },
    { code: "T3", name: "Table 3 — Family Majlis", capacity: 6 },
    { code: "T4", name: "Table 4 — Fountain View", capacity: 4 },
    { code: "T5", name: "Table 5 — Indoor Dining", capacity: 4 },
  ];
  for (const t of demoTables) {
    await prisma.diningTable.upsert({
      where: {
        restaurantId_tableCode: {
          restaurantId: demoRestaurant.id,
          tableCode: t.code,
        },
      },
      update: {
        displayName: t.name,
        capacity: t.capacity,
        branchId: marinaBranch.id,
        isActive: true,
      },
      create: {
        restaurantId: demoRestaurant.id,
        branchId: marinaBranch.id,
        tableCode: t.code,
        displayName: t.name,
        capacity: t.capacity,
        qrToken: crypto.randomBytes(16).toString("hex"),
        isActive: true,
      },
    });
  }

  // Seed the ~40-dish demo menu idempotently if no categories exist yet
  const existingItemCount = await prisma.menuItem.count({
    where: { restaurantId: demoRestaurant.id },
  });

  if (existingItemCount === 0) {
    const now = new Date();
    let seededCount = 0;

    for (const cat of DEMO_LEBANESE_CATEGORIES) {
      const createdCat = await prisma.menuCategory.create({
        data: {
          restaurantId: demoRestaurant.id,
          nameEn: cat.nameEn,
          nameAr: cat.nameAr,
          sortOrder: cat.sortOrder,
        },
      });

      for (const dish of cat.items) {
        const isVerified = dish.verificationStatus === "RESTAURANT_VERIFIED";
        const removable = dish.removableIngredients ?? inferDemoRemovableIngredients(dish);
        await prisma.menuItem.create({
          data: {
            restaurantId: demoRestaurant.id,
            categoryId: createdCat.id,
            nameEn: dish.nameEn,
            nameAr: dish.nameAr,
            descriptionEn: dish.descriptionEn,
            descriptionAr: dish.descriptionAr,
            priceAed: dish.priceAed,
            portionSize: dish.portionSize,
            ingredientsEn: dish.ingredientsEn,
            ingredientsAr: dish.ingredientsAr,
            removableIngredients: removable,
            removableIngredientsVerified: isVerified && removable.length > 0,
            dietTags: dish.dietTags,
            allergens: dish.allergens,
            allergenDataProvided: dish.allergenDataProvided,
            spiceLevel: dish.spiceLevel,
            meatType: dish.meatType,
            verificationStatus: dish.verificationStatus,
            verifiedAt: isVerified ? now : null,
            verifiedById: isVerified ? owner.id : null,
            isAvailable: true,
            isPopular: Boolean(dish.isPopular),
            isPublished: true,
            modifiers: dish.modifiers?.length
              ? {
                  create: dish.modifiers.map((mod) => ({
                    nameEn: mod.nameEn,
                    nameAr: mod.nameAr,
                    priceDeltaAed: mod.priceDeltaAed,
                    removesAllergens: mod.removesAllergens,
                    addsDietTags: mod.addsDietTags,
                    verificationStatus: mod.verificationStatus,
                  })),
                }
              : undefined,
          },
        });
        seededCount++;
      }
    }
    console.log(
      `✔ Seeded ${seededCount} dishes across ${DEMO_LEBANESE_CATEGORIES.length} categories.`,
    );
  } else {
    // Idempotently backfill removableIngredients on existing Demo Lebanese Kitchen items after Phase 7.5 upgrade
    const unpopulated = await prisma.menuItem.findMany({
      where: {
        restaurantId: demoRestaurant.id,
        removableIngredients: { equals: [] },
      },
      select: {
        id: true,
        nameEn: true,
        descriptionEn: true,
        ingredientsEn: true,
        verificationStatus: true,
      },
    });
    for (const item of unpopulated) {
      const removable = inferDemoRemovableIngredients(item);
      if (removable.length > 0) {
        await prisma.menuItem.update({
          where: { id: item.id },
          data: {
            removableIngredients: removable,
            removableIngredientsVerified: item.verificationStatus === "RESTAURANT_VERIFIED",
          },
        });
      }
    }
    console.log(
      `ℹ Demo menu already has ${existingItemCount} items; verified removable garnishes up to date.`,
    );
  }

  // Idempotently connect demo friends (Claude, Bilal, James) as Dining Companions
  const demoProfiles = await prisma.dinerProfile.findMany({
    where: { userId: { in: [claude.id, bilal.id, james.id] } },
    select: { id: true },
  });
  const sortedIds = demoProfiles.map((p) => p.id).sort();
  for (let i = 0; i < sortedIds.length; i++) {
    for (let j = i + 1; j < sortedIds.length; j++) {
      await prisma.diningCompanion.upsert({
        where: {
          profileAId_profileBId: {
            profileAId: sortedIds[i]!,
            profileBId: sortedIds[j]!,
          },
        },
        update: {},
        create: {
          profileAId: sortedIds[i]!,
          profileBId: sortedIds[j]!,
        },
      });
    }
  }
}

main()
  .catch((err) => {
    console.error("Seed error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
