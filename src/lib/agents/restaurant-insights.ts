import { z } from "zod";
import { type AgentCallResult, runStructuredAgent } from "@/lib/agents/gemini";
import type { Locale } from "@/lib/i18n/dictionaries";
import { aedToFils, filsToAedString } from "@/lib/money";

export interface AnonymousRestaurantAggregateInput {
  totalScans: number;
  dietaryScanCounts: Record<string, number>;
  allergenScanCounts: Record<string, number>;
  budgetConsciousScans: number;
  menuDishCount: number;
  verifiedDishCount: number;
  menuDietCoverageCounts: Record<string, number>;
  topOrderedDishes: Array<{ nameEn: string; quantitySold: number; revenueAed: string }>;
  acceptedOrderCount: number;
  grossPlatformSalesAed: string;
}

const rawInsightsSchema = z.object({
  headlineEn: z.string().trim().min(1).max(200),
  headlineAr: z.string().trim().min(1).max(200),
  recommendationsEn: z.array(z.string().trim().min(1).max(260)).min(1).max(5),
  recommendationsAr: z.array(z.string().trim().min(1).max(260)).min(1).max(5),
});

export interface RestaurantInsightsOutput {
  headlineEn: string;
  headlineAr: string;
  recommendationsEn: string[];
  recommendationsAr: string[];
  cachedForDay: string;
}

const insightsDailyCache = new Map<string, RestaurantInsightsOutput>();

export function getCachedRestaurantInsights(restaurantId: string): RestaurantInsightsOutput | null {
  const utcDay = new Date().toISOString().slice(0, 10);
  return insightsDailyCache.get(`${restaurantId}:${utcDay}`) ?? null;
}

export function buildAnonymousAggregatePayload(params: {
  scanEvents: ReadonlyArray<{
    dietaryRestrictions: readonly string[];
    allergens: readonly string[];
    hasBudget: boolean;
  }>;
  menuItems: ReadonlyArray<{
    id: string;
    nameEn: string;
    dietTags: readonly string[];
    verificationStatus: string;
  }>;
  acceptedOrders: ReadonlyArray<{
    subtotalAed: { toString(): string } | string;
    items: ReadonlyArray<{
      menuItemId: string;
      quantity: number;
      lineTotalAed: { toString(): string } | string;
    }>;
  }>;
}): AnonymousRestaurantAggregateInput {
  const dietaryScanCounts: Record<string, number> = {};
  const allergenScanCounts: Record<string, number> = {};
  let budgetConsciousScans = 0;

  for (const ev of params.scanEvents) {
    if (ev.hasBudget) budgetConsciousScans++;
    for (const d of ev.dietaryRestrictions) {
      dietaryScanCounts[d] = (dietaryScanCounts[d] ?? 0) + 1;
    }
    for (const a of ev.allergens) {
      allergenScanCounts[a] = (allergenScanCounts[a] ?? 0) + 1;
    }
  }

  const menuDietCoverageCounts: Record<string, number> = {};
  const dishNameById = new Map<string, string>();
  let verifiedDishCount = 0;

  for (const item of params.menuItems) {
    dishNameById.set(item.id, item.nameEn);
    if (item.verificationStatus === "RESTAURANT_VERIFIED") verifiedDishCount++;
    for (const d of item.dietTags) {
      menuDietCoverageCounts[d] = (menuDietCoverageCounts[d] ?? 0) + 1;
    }
  }

  let grossSalesFils = 0;
  const dishSalesMap = new Map<string, { qty: number; fils: number }>();

  for (const order of params.acceptedOrders) {
    grossSalesFils += aedToFils(order.subtotalAed.toString());
    for (const line of order.items) {
      const prev = dishSalesMap.get(line.menuItemId) ?? { qty: 0, fils: 0 };
      prev.qty += line.quantity;
      prev.fils += aedToFils(line.lineTotalAed.toString());
      dishSalesMap.set(line.menuItemId, prev);
    }
  }

  const topOrderedDishes = Array.from(dishSalesMap.entries())
    .map(([menuItemId, stats]) => ({
      nameEn: dishNameById.get(menuItemId) ?? "Menu Dish",
      quantitySold: stats.qty,
      revenueAed: filsToAedString(stats.fils),
    }))
    .sort((a, b) => b.quantitySold - a.quantitySold)
    .slice(0, 5);

  return {
    totalScans: params.scanEvents.length,
    dietaryScanCounts,
    allergenScanCounts,
    budgetConsciousScans,
    menuDishCount: params.menuItems.length,
    verifiedDishCount,
    menuDietCoverageCounts,
    topOrderedDishes,
    acceptedOrderCount: params.acceptedOrders.length,
    grossPlatformSalesAed: filsToAedString(grossSalesFils),
  };
}

/**
 * Agent 8: Restaurant Insights Agent
 * Sends ONLY anonymous aggregate counters (zero PII, zero diner names or emails)
 * and caches results once per restaurant per UTC calendar day.
 */
export async function runRestaurantInsightsAgent(params: {
  restaurantId: string;
  aggregates: AnonymousRestaurantAggregateInput;
  locale?: Locale;
  userId?: string;
  callerKey?: string | null;
  clientIp?: string | null;
  forceRefresh?: boolean;
}): Promise<AgentCallResult<RestaurantInsightsOutput>> {
  const utcDay = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const cacheKey = `${params.restaurantId}:${utcDay}`;

  if (!params.forceRefresh) {
    const cached = insightsDailyCache.get(cacheKey);
    if (cached) {
      return {
        ok: true,
        data: cached,
        model: "cache",
        latencyMs: 0,
        inputTokens: 0,
        outputTokens: 0,
      };
    }
  }

  const systemInstruction = `You are the Restaurant Insights Agent for a UAE restaurant owner (currency: AED).
Analyze the anonymous aggregate scan, diet/allergen demand, menu coverage, and order metrics.
Produce concrete, data-backed weekly insights in BOTH English and Arabic (e.g. "32% of diners who scanned your menu are vegetarian...").
Output JSON:
{
  "headlineEn": string,
  "headlineAr": string,
  "recommendationsEn": string[], // 2-4 concise actionable bullets
  "recommendationsAr": string[]  // 2-4 concise actionable bullets in Arabic
}`;

  const rawResult = await runStructuredAgent({
    agentName: "restaurantInsightsAgent",
    systemInstruction,
    contents: JSON.stringify(params.aggregates),
    schema: rawInsightsSchema,
    restaurantId: params.restaurantId,
    userId: params.userId,
    callerKey: params.callerKey,
    clientIp: params.clientIp,
    timeoutMs: 20_000,
  });

  if (!rawResult.ok) {
    return rawResult;
  }

  const output: RestaurantInsightsOutput = {
    ...rawResult.data,
    cachedForDay: utcDay,
  };
  insightsDailyCache.set(cacheKey, output);

  return {
    ...rawResult,
    data: output,
  };
}
