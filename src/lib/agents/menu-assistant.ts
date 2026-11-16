import { z } from "zod";
import { type AgentCallResult, runStructuredAgent } from "@/lib/agents/gemini";
import { wrapUntrustedText } from "@/lib/agents/guardrails";
import {
  type EngineDinerProfile,
  type EngineDishInput,
  type EvaluatedMenuItem,
  evaluatePersonalizedMenu,
} from "@/lib/engine/menu-engine";
import type { Locale } from "@/lib/i18n/dictionaries";

const rawAssistantResponseSchema = z.object({
  answer: z.string().trim().min(1).max(900),
  recommendedDishIds: z.array(z.string().trim().min(1)).max(8).default([]),
});

export interface MenuAssistantDishLink {
  id: string;
  nameEn: string;
  nameAr: string;
  effectivePriceAed: string;
  requiredModifiersEn: string[];
  requiredModifiersAr: string[];
  href: string;
}

export interface MenuAssistantOutput {
  answer: string;
  dishes: MenuAssistantDishLink[];
}

const ALLERGY_KEYWORDS =
  /\b(allerg|intoleran|lactose|dairy|milk|cheese|yogurt|gluten|wheat|celiac|nut|peanut|sesame|tahini|egg|fish|shellfish|soy|safe|vegan|vegetarian|halal)\b|(حساسي|لاكتوز|ألبان|حليب|جبن|لبن|غلوتين|قمح|مكسرات|فول سوداني|سمسم|آمن|نباتي|حلال)/i;

export function isAllergyOrDietQuery(question: string): boolean {
  return ALLERGY_KEYWORDS.test(question);
}

/**
 * Deterministic post-processor for Menu Assistant responses:
 * 1. Strips any `dishId` that is not in `verifiedAllowedById` (preventing hallucinated or unverified dishes).
 * 2. Attaches server-authoritative dish names, effective prices, pre-selected modifiers, and links.
 * 3. Appends "Always confirm allergies with staff." whenever the diner has hard restrictions or asks an allergy/diet question.
 */
export function postProcessMenuAssistantOutput(params: {
  rawAnswer: string;
  rawDishIds: readonly string[];
  verifiedAllowedById: ReadonlyMap<string, EvaluatedMenuItem>;
  restaurantSlug: string;
  tableCode?: string;
  locale: Locale;
  appendAllergyConfirm: boolean;
}): MenuAssistantOutput {
  const seen = new Set<string>();
  const dishes: MenuAssistantDishLink[] = [];

  for (const id of params.rawDishIds) {
    if (seen.has(id)) continue;
    const allowed = params.verifiedAllowedById.get(id);
    if (!allowed) continue; // Drop unknown, hidden, or unverified dish IDs!
    seen.add(id);

    const tableQuery = params.tableCode ? `?table=${encodeURIComponent(params.tableCode)}` : "";
    dishes.push({
      id: allowed.dish.id,
      nameEn: allowed.dish.nameEn,
      nameAr: allowed.dish.nameAr,
      effectivePriceAed: allowed.effectivePriceAed,
      requiredModifiersEn: allowed.preselectedModifiers.map((m) => m.nameEn),
      requiredModifiersAr: allowed.preselectedModifiers.map((m) => m.nameAr),
      href: `/r/${encodeURIComponent(params.restaurantSlug)}/dish/${encodeURIComponent(allowed.dish.id)}${tableQuery}`,
    });
  }

  let answer = params.rawAnswer.trim();
  if (params.appendAllergyConfirm) {
    const suffix =
      params.locale === "ar"
        ? "يرجى دائماً تأكيد الحساسية الغذائية مع طاقم المطعم."
        : "Always confirm allergies with staff.";
    if (!answer.toLowerCase().includes("confirm") && !answer.includes("تأكيد الحساسية")) {
      answer = `${answer} ${suffix}`;
    }
  }

  return { answer, dishes };
}

/**
 * Agent 6: Menu Assistant (Chat)
 * Answers strictly from this restaurant's published, RESTAURANT_VERIFIED menu items
 * that pass the deterministic engine for this diner. Never invents or calls unverified dishes safe.
 */
export async function runMenuAssistantAgent(params: {
  question: string;
  locale: Locale;
  restaurantId: string;
  restaurantSlug: string;
  tableCode?: string;
  dishes: readonly EngineDishInput[];
  profile: EngineDinerProfile;
  currentCartTotalFils?: number;
  userId?: string;
}): Promise<AgentCallResult<MenuAssistantOutput>> {
  const evaluated = evaluatePersonalizedMenu({
    dishes: params.dishes,
    profile: params.profile,
    currentCartTotalFils: params.currentCartTotalFils ?? 0,
  });

  // Strictly restrict the assistant's context pool to published, RESTAURANT_VERIFIED,
  // allergen-confirmed dishes that passed the deterministic hard filter for this diner!
  const verifiedCompatible = [
    ...evaluated.perfectForYou,
    ...evaluated.goodOptions,
    ...evaluated.moreOptions,
  ].filter(
    (item) =>
      item.dish.verificationStatus === "RESTAURANT_VERIFIED" &&
      item.dish.allergenDataProvided &&
      item.safetyState !== "UNVERIFIED_WARNING" &&
      item.safetyState !== "HIDDEN",
  );

  const verifiedAllowedById = new Map(verifiedCompatible.map((item) => [item.dish.id, item]));

  const contextMenu = verifiedCompatible.map((item) => ({
    id: item.dish.id,
    nameEn: item.dish.nameEn,
    nameAr: item.dish.nameAr,
    priceAed: item.effectivePriceAed,
    portionSize: item.dish.portionSize ?? "",
    dietTags: item.dish.dietTags,
    allergensAfterModifier:
      item.preselectedModifiers.length > 0
        ? (item.dish.allergens ?? []).filter(
            (a) => !item.preselectedModifiers.some((m) => m.removesAllergens.includes(a)),
          )
        : (item.dish.allergens ?? []),
    requiredModifier: item.preselectedModifiers.map((m) => m.nameEn).join(", ") || null,
    spiceLevel: item.dish.spiceLevel,
  }));

  const systemInstruction = `You are the Menu Assistant for this restaurant.
Answer the diner's question in ${params.locale === "ar" ? "Arabic" : "English"} ONLY using the verified safe dishes in VERIFIED_MENU_CONTEXT.
Rules:
1. NEVER invent dishes or mention any dish not in VERIFIED_MENU_CONTEXT.
2. Put the exact "id" values of any dishes you recommend into "recommendedDishIds".
3. If a recommended dish has a "requiredModifier", explicitly mention that modifier in your answer.
4. If no dish in VERIFIED_MENU_CONTEXT matches the diner's request (e.g. price cap too low), say so honestly.
5. Output JSON: { "answer": string, "recommendedDishIds": string[] }`;

  const userPayload = `VERIFIED_MENU_CONTEXT:\n${JSON.stringify(contextMenu)}\n\nDINER_QUESTION:\n${wrapUntrustedText(params.question, 1000)}`;

  const rawResult = await runStructuredAgent({
    agentName: "menuAssistantAgent",
    systemInstruction,
    contents: userPayload,
    schema: rawAssistantResponseSchema,
    restaurantId: params.restaurantId,
    userId: params.userId,
    timeoutMs: 20_000,
  });

  if (!rawResult.ok) {
    return rawResult;
  }

  const appendAllergyConfirm =
    evaluated.hasHardRestrictions || isAllergyOrDietQuery(params.question);

  const processed = postProcessMenuAssistantOutput({
    rawAnswer: rawResult.data.answer,
    rawDishIds: rawResult.data.recommendedDishIds,
    verifiedAllowedById,
    restaurantSlug: params.restaurantSlug,
    tableCode: params.tableCode,
    locale: params.locale,
    appendAllergyConfirm,
  });

  return {
    ...rawResult,
    data: processed,
  };
}
