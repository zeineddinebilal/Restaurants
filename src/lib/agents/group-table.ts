import crypto from "node:crypto";
import { z } from "zod";
import { type AgentCallResult, runStructuredAgent } from "@/lib/agents/gemini";
import {
  type EngineDinerProfile,
  type EngineDishInput,
  type EvaluatedMenuItem,
  evaluateGroupSharedDishes,
  type GroupSharedDish,
} from "@/lib/engine/menu-engine";
import type { Locale } from "@/lib/i18n/dictionaries";
import { computeTableBillSplit, type ParticipantBillShare } from "@/lib/ordering/pricing";

const rawGroupAgentSchema = z.object({
  summary: z.string().trim().min(1).max(600),
  sharedDishIds: z.array(z.string().min(1)).max(6).default([]),
  perPersonPicks: z
    .array(
      z.object({
        participantId: z.string().min(1),
        dishId: z.string().min(1),
      }),
    )
    .max(12)
    .default([]),
});

export interface CuratedGroupDish {
  dishId: string;
  nameEn: string;
  nameAr: string;
  effectivePriceFils: number;
  effectivePriceAed: string;
  requiredModifiersEn: string[];
  requiredModifiersAr: string[];
}

export interface GroupTableAgentOutput {
  summary: string;
  cached: boolean;
  sharedSet: CuratedGroupDish[];
  personalPicks: Array<{
    participantId: string;
    participantName: string;
    dish: CuratedGroupDish;
  }>;
  estimatedTotalAed: string;
  estimatedShares: ParticipantBillShare[];
}

interface CacheEntry {
  expiresAtMs: number;
  value: GroupTableAgentOutput;
}

const groupPlanCache = new Map<string, CacheEntry>();
const GROUP_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Deterministic post-processor for Group Table Agent:
 * - Drops any `sharedDishId` not in `allowedSharedById`
 * - Drops any personal `dishId` not in that participant's safe `allowedPersonalByPersonId`
 * - Recomputes all prices & bill splits in integer fils on the server!
 */
export function postProcessGroupTablePlan(params: {
  summary: string;
  rawSharedDishIds: readonly string[];
  rawPerPersonPicks: ReadonlyArray<{ participantId: string; dishId: string }>;
  allowedSharedById: ReadonlyMap<string, GroupSharedDish>;
  allowedPersonalByPersonId: ReadonlyMap<string, ReadonlyMap<string, EvaluatedMenuItem>>;
  participants: ReadonlyArray<{ id: string; name: string }>;
}): Omit<GroupTableAgentOutput, "cached"> {
  const sharedSet: CuratedGroupDish[] = [];
  const seenShared = new Set<string>();

  for (const id of params.rawSharedDishIds) {
    if (seenShared.has(id)) continue;
    const sh = params.allowedSharedById.get(id);
    if (!sh) continue;
    seenShared.add(id);
    sharedSet.push({
      dishId: sh.dish.id,
      nameEn: sh.dish.nameEn,
      nameAr: sh.dish.nameAr,
      effectivePriceFils: sh.effectivePriceFils,
      effectivePriceAed: sh.effectivePriceAed,
      requiredModifiersEn: sh.requiredModifiers.map((m) => m.nameEn),
      requiredModifiersAr: sh.requiredModifiers.map((m) => m.nameAr),
    });
  }

  const nameByPersonId = new Map(params.participants.map((p) => [p.id, p.name]));
  const personalPicks: GroupTableAgentOutput["personalPicks"] = [];
  const seenPerson = new Set<string>();

  for (const pick of params.rawPerPersonPicks) {
    if (seenPerson.has(pick.participantId)) continue;
    const personAllowed = params.allowedPersonalByPersonId.get(pick.participantId);
    const ev = personAllowed?.get(pick.dishId);
    if (!ev) continue;
    seenPerson.add(pick.participantId);

    personalPicks.push({
      participantId: pick.participantId,
      participantName: nameByPersonId.get(pick.participantId) ?? "Diner",
      dish: {
        dishId: ev.dish.id,
        nameEn: ev.dish.nameEn,
        nameAr: ev.dish.nameAr,
        effectivePriceFils: ev.effectivePriceFils,
        effectivePriceAed: ev.effectivePriceAed,
        requiredModifiersEn: ev.preselectedModifiers.map((m) => m.nameEn),
        requiredModifiersAr: ev.preselectedModifiers.map((m) => m.nameAr),
      },
    });
  }

  // Server-authoritative bill split in integer fils
  const splitLines = [
    ...sharedSet.map((s) => ({
      participantId: null as string | null,
      lineTotalFils: s.effectivePriceFils,
    })),
    ...personalPicks.map((p) => ({
      participantId: p.participantId,
      lineTotalFils: p.dish.effectivePriceFils,
    })),
  ];

  const split = computeTableBillSplit({
    participants: params.participants.map((p) => ({ id: p.id, displayName: p.name })),
    lines: splitLines,
  });

  return {
    summary: params.summary,
    sharedSet,
    personalPicks,
    estimatedTotalAed: split.totalAed,
    estimatedShares: split.shares,
  };
}

/**
 * Agent 5: Group Table Agent
 * Suggests a sharing spread + per-person picks strictly from verified safe dishes
 * returned by `evaluateGroupSharedDishes`, recomputing all totals/splits server-side.
 */
export async function runGroupTableAgent(params: {
  restaurantId: string;
  locale: Locale;
  dishes: readonly EngineDishInput[];
  participants: ReadonlyArray<{
    id: string;
    name: string;
    profile: EngineDinerProfile;
  }>;
  userId?: string;
  callerKey?: string | null;
  clientIp?: string | null;
}): Promise<AgentCallResult<GroupTableAgentOutput>> {
  const groupEval = evaluateGroupSharedDishes({
    dishes: params.dishes,
    participants: params.participants,
  });

  const verifiedShared = groupEval.sharedDishes.filter(
    (s) =>
      !s.hasUnverifiedWarning &&
      s.dish.verificationStatus === "RESTAURANT_VERIFIED" &&
      s.dish.allergenDataProvided,
  );
  const allowedSharedById = new Map(verifiedShared.map((s) => [s.dish.id, s]));

  const allowedPersonalByPersonId = new Map<string, Map<string, EvaluatedMenuItem>>();
  for (const p of params.participants) {
    const pMenu = groupEval.perPersonMenus[p.id];
    const safeList = pMenu
      ? [...pMenu.perfectForYou, ...pMenu.goodOptions].filter(
          (i) =>
            i.safetyState !== "UNVERIFIED_WARNING" &&
            i.dish.verificationStatus === "RESTAURANT_VERIFIED" &&
            i.dish.allergenDataProvided,
        )
      : [];
    allowedPersonalByPersonId.set(p.id, new Map(safeList.map((i) => [i.dish.id, i])));
  }

  const cacheSignature = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        r: params.restaurantId,
        l: params.locale,
        p: params.participants.map((p) => ({
          id: p.id,
          d: p.profile.dietaryRestrictions,
          a: p.profile.allergens,
          b: p.profile.maxBudgetAed,
        })),
        sIds: verifiedShared.slice(0, 12).map((s) => s.dish.id),
      }),
    )
    .digest("hex");

  const cachedHit = groupPlanCache.get(cacheSignature);
  if (cachedHit && cachedHit.expiresAtMs > Date.now()) {
    return {
      ok: true,
      data: { ...cachedHit.value, cached: true },
      model: "cache",
      latencyMs: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
  }

  const contextPayload = {
    participants: params.participants.map((p) => ({
      participantId: p.id,
      name: p.name,
      maxBudgetAed: p.profile.maxBudgetAed ?? null,
      candidatePersonalDishes: Array.from(allowedPersonalByPersonId.get(p.id)?.values() ?? [])
        .slice(0, 8)
        .map((i) => ({
          id: i.dish.id,
          nameEn: i.dish.nameEn,
          priceAed: i.effectivePriceAed,
        })),
    })),
    candidateSharedDishes: verifiedShared.slice(0, 12).map((s) => ({
      id: s.dish.id,
      nameEn: s.dish.nameEn,
      priceAed: s.effectivePriceAed,
    })),
  };

  const systemInstruction = `You are the Group Table Agent for a restaurant table.
Propose 2-3 shared dishes from "candidateSharedDishes" that everyone can share, plus 1 individual dish per person from their "candidatePersonalDishes", respecting any maxBudgetAed.
Write a warm 1-2 sentence "summary" in ${params.locale === "ar" ? "Arabic" : "English"}.
NEVER invent dish IDs outside the provided candidates.
Output JSON: { "summary": string, "sharedDishIds": string[], "perPersonPicks": [ { "participantId": string, "dishId": string } ] }`;

  const rawResult = await runStructuredAgent({
    agentName: "groupTableAgent",
    systemInstruction,
    contents: JSON.stringify(contextPayload),
    schema: rawGroupAgentSchema,
    restaurantId: params.restaurantId,
    userId: params.userId,
    callerKey: params.callerKey,
    clientIp: params.clientIp,
    timeoutMs: 20_000,
  });

  if (!rawResult.ok) {
    return rawResult;
  }

  const processed = postProcessGroupTablePlan({
    summary: rawResult.data.summary,
    rawSharedDishIds: rawResult.data.sharedDishIds,
    rawPerPersonPicks: rawResult.data.perPersonPicks,
    allowedSharedById,
    allowedPersonalByPersonId,
    participants: params.participants,
  });

  const finalValue: GroupTableAgentOutput = {
    ...processed,
    cached: false,
  };

  groupPlanCache.set(cacheSignature, {
    expiresAtMs: Date.now() + GROUP_CACHE_TTL_MS,
    value: finalValue,
  });

  return {
    ...rawResult,
    data: finalValue,
  };
}
