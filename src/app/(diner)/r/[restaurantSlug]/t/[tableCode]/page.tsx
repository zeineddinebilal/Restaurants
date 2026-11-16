import { notFound } from "next/navigation";
import { PersonalizedMenuClient } from "@/app/(diner)/r/[restaurantSlug]/t/[tableCode]/PersonalizedMenuClient";
import { prisma } from "@/lib/db";
import { getActiveDinerProfile } from "@/lib/diner/profile";
import type { EngineDishInput } from "@/lib/engine/menu-engine";
import { getI18nContext } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function PersonalizedTableMenuPage({
  params,
}: {
  params: Promise<{ restaurantSlug: string; tableCode: string }>;
}) {
  const [{ restaurantSlug, tableCode }, { locale, dict }, { profile }] = await Promise.all([
    params,
    getI18nContext(),
    getActiveDinerProfile(),
  ]);

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: restaurantSlug },
    include: {
      tables: {
        where: {
          tableCode: { equals: tableCode, mode: "insensitive" },
          isActive: true,
        },
        take: 1,
      },
      categories: {
        orderBy: { sortOrder: "asc" },
        include: {
          items: {
            where: { isPublished: true, isAvailable: true },
            orderBy: { createdAt: "asc" },
            include: {
              modifiers: { orderBy: { createdAt: "asc" } },
            },
          },
        },
      },
    },
  });

  if (!restaurant || restaurant.status === "SUSPENDED" || restaurant.tables.length === 0) {
    notFound();
  }

  const table = restaurant.tables[0]!;

  // Record anonymous scan event for Restaurant Insights Agent (non-blocking)
  prisma.menuScanEvent
    .create({
      data: {
        restaurantId: restaurant.id,
        tableId: table.id,
        dietaryRestrictions: profile?.dietaryRestrictions ?? [],
        allergens: profile?.allergens ?? [],
        hasBudget: Boolean(profile?.maxBudgetAed),
      },
    })
    .catch(() => {});

  const engineDishes: EngineDishInput[] = restaurant.categories.flatMap((cat) =>
    cat.items.map((item) => ({
      id: item.id,
      categoryId: cat.id,
      categoryNameEn: cat.nameEn,
      categoryNameAr: cat.nameAr,
      nameEn: item.nameEn,
      nameAr: item.nameAr,
      descriptionEn: item.descriptionEn,
      descriptionAr: item.descriptionAr,
      priceAed: item.priceAed.toFixed(2),
      portionSize: item.portionSize,
      ingredientsEn: item.ingredientsEn,
      ingredientsAr: item.ingredientsAr,
      dietTags: item.dietTags,
      allergens: item.allergens,
      allergenDataProvided: item.allergenDataProvided,
      spiceLevel: item.spiceLevel,
      meatType: item.meatType,
      verificationStatus: item.verificationStatus,
      isAvailable: item.isAvailable,
      isPopular: item.isPopular,
      isPublished: item.isPublished,
      cachedBlurbEn: item.cachedBlurbEn,
      cachedBlurbAr: item.cachedBlurbAr,
      imageUrl: item.imageUrl,
      modifiers: item.modifiers.map((mod) => ({
        id: mod.id,
        nameEn: mod.nameEn,
        nameAr: mod.nameAr,
        priceDeltaAed: mod.priceDeltaAed.toFixed(2),
        removesAllergens: mod.removesAllergens,
        addsDietTags: mod.addsDietTags,
        verificationStatus: mod.verificationStatus,
      })),
    })),
  );

  // Strictly only shown on the demo restaurant AND when DEMO_MODE=true
  const showDemoSwitcher = process.env.DEMO_MODE === "true" && restaurant.isDemo === true;

  return (
    <PersonalizedMenuClient
      locale={locale}
      safetyDisclaimer={dict.safetyDisclaimer}
      restaurant={{
        id: restaurant.id,
        slug: restaurant.slug,
        nameEn: restaurant.nameEn,
        nameAr: restaurant.nameAr,
        descriptionEn: restaurant.descriptionEn,
        descriptionAr: restaurant.descriptionAr,
      }}
      table={{
        tableCode: table.tableCode,
        displayName: table.displayName,
      }}
      dishes={engineDishes}
      initialProfile={profile}
      showDemoSwitcher={showDemoSwitcher}
    />
  );
}
