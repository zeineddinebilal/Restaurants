import { redirect } from "next/navigation";
import { AnalyticsClient } from "@/app/(restaurant)/dashboard/analytics/AnalyticsClient";
import { getGeminiConfig } from "@/lib/agents/gemini";
import { checkDailyAiQuota } from "@/lib/agents/guardrails";
import {
  buildAnonymousAggregatePayload,
  getCachedRestaurantInsights,
  runRestaurantInsightsAgent,
} from "@/lib/agents/restaurant-insights";
import { requirePageRole } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { pickLocalized } from "@/lib/i18n/dictionaries";
import { getI18nContext } from "@/lib/i18n/server";
import { loadManagedRestaurants } from "@/lib/restaurant/loader";

export const dynamic = "force-dynamic";

export default async function RestaurantAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ restaurantId?: string }>;
}) {
  const [user, { locale }, sp] = await Promise.all([
    requirePageRole(["RESTAURANT_OWNER", "ADMIN"]),
    getI18nContext(),
    searchParams,
  ]);

  const { activeRestaurant } = await loadManagedRestaurants(user, sp.restaurantId);
  if (!activeRestaurant) {
    redirect("/dashboard");
  }

  // Strictly anonymous aggregate queries — zero diner names, emails, or personal identifiers
  const [scanEvents, menuItems, acceptedOrders] = await Promise.all([
    prisma.menuScanEvent.findMany({
      where: { restaurantId: activeRestaurant.id },
      select: {
        dietaryRestrictions: true,
        allergens: true,
        hasBudget: true,
      },
      orderBy: { createdAt: "desc" },
      take: 2000,
    }),
    prisma.menuItem.findMany({
      where: { restaurantId: activeRestaurant.id, isPublished: true },
      select: {
        id: true,
        nameEn: true,
        nameAr: true,
        dietTags: true,
        allergens: true,
        verificationStatus: true,
      },
    }),
    prisma.order.findMany({
      where: {
        restaurantId: activeRestaurant.id,
        status: { in: ["ACCEPTED", "PREPARING", "SERVED"] },
      },
      select: {
        subtotalAed: true,
        items: {
          select: {
            menuItemId: true,
            quantity: true,
            lineTotalAed: true,
          },
        },
      },
    }),
  ]);

  const aggregates = buildAnonymousAggregatePayload({
    scanEvents,
    menuItems,
    acceptedOrders,
  });

  const highAllergenDishes = menuItems
    .filter((m) => m.allergens.length >= 3)
    .slice(0, 6)
    .map((m) => ({
      id: m.id,
      nameEn: m.nameEn,
      nameAr: m.nameAr,
      allergens: m.allergens,
    }));

  const geminiCfg = getGeminiConfig();
  let initialInsights = getCachedRestaurantInsights(activeRestaurant.id);
  let initialAiNotice: string | null = null;

  if (geminiCfg.configured && !initialInsights) {
    const quota = checkDailyAiQuota({
      callerKey: `user:${user.id}`,
      restaurantId: activeRestaurant.id,
    });
    if (quota.allowed) {
      const res = await runRestaurantInsightsAgent({
        restaurantId: activeRestaurant.id,
        aggregates,
        locale,
        userId: user.id,
      });
      if (res.ok) {
        initialInsights = res.data;
      } else {
        initialAiNotice = res.message;
      }
    } else {
      initialAiNotice = quota.reason ?? null;
    }
  }

  return (
    <AnalyticsClient
      locale={locale}
      restaurantId={activeRestaurant.id}
      restaurantName={pickLocalized(activeRestaurant.nameEn, activeRestaurant.nameAr, locale)}
      initialAggregates={aggregates}
      initialHighAllergenDishes={highAllergenDishes}
      initialInsights={initialInsights}
      initialAiConfigured={geminiCfg.configured}
      initialAiNotice={initialAiNotice}
    />
  );
}
