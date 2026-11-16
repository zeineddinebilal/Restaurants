import { NextRequest, NextResponse } from "next/server";
import { getGeminiConfig, httpStatusForAgentError } from "@/lib/agents/gemini";
import {
  buildAnonymousAggregatePayload,
  getCachedRestaurantInsights,
  runRestaurantInsightsAgent,
} from "@/lib/agents/restaurant-insights";
import { prisma } from "@/lib/db";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { requireRestaurantOwnerApi } from "@/lib/restaurant/access";

async function loadAnonymousRestaurantMetrics(restaurantId: string) {
  // Privacy invariant: select ONLY anonymous scan & order counters — zero diner names, emails, or profile IDs!
  const [scanEvents, menuItems, acceptedOrders] = await Promise.all([
    prisma.menuScanEvent.findMany({
      where: { restaurantId },
      select: {
        dietaryRestrictions: true,
        allergens: true,
        hasBudget: true,
      },
      orderBy: { createdAt: "desc" },
      take: 2000,
    }),
    prisma.menuItem.findMany({
      where: { restaurantId, isPublished: true },
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
        restaurantId,
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

  // Deterministic gap highlights (always available even without GEMINI_API_KEY)
  const highAllergenDishes = menuItems
    .filter((m) => m.allergens.length >= 3)
    .slice(0, 6)
    .map((m) => ({
      id: m.id,
      nameEn: m.nameEn,
      nameAr: m.nameAr,
      allergens: m.allergens,
    }));

  return { aggregates, highAllergenDishes };
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ restaurantId: string }> },
) {
  const { restaurantId } = await context.params;
  const access = await requireRestaurantOwnerApi(restaurantId);
  if (!access.ok) return access.response;

  const { aggregates, highAllergenDishes } = await loadAnonymousRestaurantMetrics(restaurantId);
  const geminiCfg = getGeminiConfig();

  if (!geminiCfg.configured) {
    return NextResponse.json({
      aggregates,
      highAllergenDishes,
      aiConfigured: false,
      insights: null,
    });
  }

  const cachedToday = getCachedRestaurantInsights(restaurantId);
  if (cachedToday) {
    return NextResponse.json({
      aggregates,
      highAllergenDishes,
      aiConfigured: true,
      insights: cachedToday,
      aiNotice: null,
    });
  }

  const clientIp = getClientIp(req.headers);
  const aiResult = await runRestaurantInsightsAgent({
    restaurantId,
    aggregates,
    userId: access.user.id,
    callerKey: `user:${access.user.id}`,
    clientIp,
    forceRefresh: false,
  });

  return NextResponse.json({
    aggregates,
    highAllergenDishes,
    aiConfigured: aiResult.ok || aiResult.reason !== "AI_NOT_CONFIGURED",
    insights: aiResult.ok ? aiResult.data : null,
    aiNotice: aiResult.ok ? null : aiResult.message,
  });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ restaurantId: string }> },
) {
  const { restaurantId } = await context.params;
  const access = await requireRestaurantOwnerApi(restaurantId);
  if (!access.ok) return access.response;

  const clientIp = getClientIp(req.headers);
  const rl = checkRateLimit({
    key: `ai:insights:refresh:${restaurantId}:${clientIp}`,
    limit: 3,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Insights were refreshed recently. Please try again later." },
      { status: 429 },
    );
  }

  const { aggregates, highAllergenDishes } = await loadAnonymousRestaurantMetrics(restaurantId);
  const aiResult = await runRestaurantInsightsAgent({
    restaurantId,
    aggregates,
    userId: access.user.id,
    callerKey: `user:${access.user.id}`,
    clientIp,
    forceRefresh: true,
  });

  if (!aiResult.ok) {
    const status = httpStatusForAgentError(aiResult.reason);
    return NextResponse.json({ error: aiResult.message, reason: aiResult.reason }, { status });
  }

  return NextResponse.json({
    aggregates,
    highAllergenDishes,
    aiConfigured: true,
    insights: aiResult.data,
  });
}
