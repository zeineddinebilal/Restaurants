import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { PersonalizedMenuClient } from "@/app/(diner)/r/[restaurantSlug]/t/[tableCode]/PersonalizedMenuClient";
import { prisma } from "@/lib/db";
import { getActiveDinerProfile } from "@/lib/diner/profile";
import type { EngineDishInput } from "@/lib/engine/menu-engine";
import { getI18nContext } from "@/lib/i18n/server";
import {
  decodeSignedSessionList,
  getOrCreateOpenTableSession,
  isAuthorizedForTableOrdering,
  TABLE_ACCESS_COOKIE_NAME,
} from "@/lib/ordering/session";
import { verifyTableQrToken } from "@/lib/qr";

export const dynamic = "force-dynamic";

export default async function PersonalizedTableMenuPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantSlug: string; tableCode: string }>;
  searchParams: Promise<{ k?: string }>;
}) {
  const [{ restaurantSlug, tableCode }, sp, cookieStore, { locale, dict }, { profile }] =
    await Promise.all([params, searchParams, cookies(), getI18nContext(), getActiveDinerProfile()]);

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

  if (!restaurant || restaurant.status !== "APPROVED" || restaurant.tables.length === 0) {
    notFound();
  }

  const table = restaurant.tables[0]!;
  const cookieEntries = decodeSignedSessionList(cookieStore.get(TABLE_ACCESS_COOKIE_NAME)?.value);

  // Determine if visitor scanned the physical table QR (`?k=...`) or holds a valid cookie grant
  let canOrder = verifyTableQrToken(sp.k, table.qrToken);
  if (!canOrder && cookieEntries.length > 0) {
    const openSession = await getOrCreateOpenTableSession({
      restaurantId: restaurant.id,
      tableId: table.id,
    });
    canOrder = isAuthorizedForTableOrdering({
      providedToken: sp.k,
      expectedTableQrToken: table.qrToken,
      cookieEntries,
      sessionId: openSession.id,
    });
  }

  // Record anonymous scan event only when actually scanned or viewed
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
      removableIngredients: item.removableIngredients,
      removableIngredientsVerified: item.removableIngredientsVerified,
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
      canOrder={canOrder}
      tableToken={canOrder && sp.k ? sp.k : null}
    />
  );
}
