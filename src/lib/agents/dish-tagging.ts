import type { MeatType, SpiceLevel } from "@prisma/client";
import { z } from "zod";
import { type AgentCallResult, runStructuredAgent } from "@/lib/agents/gemini";
import { wrapUntrustedText } from "@/lib/agents/guardrails";
import { normalizeAiPriceToAed } from "@/lib/agents/menu-ingestion";
import {
  CANONICAL_ALLERGENS,
  CANONICAL_DIET_TAGS,
  MEAT_TYPES,
  normalizeAllergenList,
  normalizeDietTagList,
  SPICE_LEVELS,
} from "@/lib/menu/taxonomy";

const rawTaggedModifierSchema = z.object({
  nameEn: z.string().trim().min(1).max(160),
  nameAr: z.string().trim().min(1).max(160),
  priceDeltaAed: z.union([z.string(), z.number()]).default("0.00"),
  removesAllergens: z.array(z.string()).default([]),
  addsDietTags: z.array(z.string()).default([]),
});

const rawDishTagResultSchema = z.object({
  index: z.number().int().nonnegative(),
  dietTags: z.array(z.string()).default([]),
  allergens: z.array(z.string()).default([]),
  removableIngredients: z.array(z.string().trim().min(1).max(60)).max(12).default([]),
  spiceLevel: z.enum(SPICE_LEVELS).default("NONE"),
  meatType: z.enum(MEAT_TYPES).default("NONE"),
  confidence: z.number().min(0).max(1).default(0.8),
  suggestedModifiers: z.array(rawTaggedModifierSchema).default([]),
});

const rawTaggingOutputSchema = z.object({
  items: z.array(rawDishTagResultSchema),
});

export interface DishTaggingInputItem {
  nameEn: string;
  nameAr?: string;
  descriptionEn?: string;
  ingredientsEn?: string[];
  existingModifiers?: Array<{
    nameEn: string;
    nameAr: string;
    priceDeltaAed?: string;
  }>;
}

export interface TaggedModifierSuggestion {
  nameEn: string;
  nameAr: string;
  priceDeltaAed: string;
  removesAllergens: string[];
  addsDietTags: string[];
  verificationStatus: "AI_SUGGESTED";
}

export interface DishTagSuggestion {
  index: number;
  dietTags: string[];
  allergens: string[];
  removableIngredients: string[];
  removableIngredientsVerified: false;
  spiceLevel: SpiceLevel;
  meatType: MeatType;
  aiConfidence: string;
  verificationStatus: "AI_SUGGESTED";
  suggestedModifiers: TaggedModifierSuggestion[];
}

/**
 * Agent 2: Dish Tagging Agent
 * Suggests diet tags, the 14 major allergens, spice level, meat type, confidence,
 * and "can be made X with modifier Y" transformations.
 * Every tag/modifier is strictly stamped `AI_SUGGESTED` until verified by the restaurant.
 */
export async function runDishTaggingAgent(params: {
  dishes: DishTaggingInputItem[];
  restaurantId?: string;
  userId?: string;
  callerKey?: string | null;
  clientIp?: string | null;
}): Promise<AgentCallResult<{ items: DishTagSuggestion[] }>> {
  if (params.dishes.length === 0) {
    return {
      ok: true,
      data: { items: [] },
      model: "none",
      latencyMs: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
  }

  const systemInstruction = `You are the Dish Tagging Agent for a food allergy & dietary safety platform.
Analyze each dish and return conservative, accurate suggestions in JSON:
{
  "items": [
    {
      "index": 0,
      "dietTags": string[], // ONLY from: ${CANONICAL_DIET_TAGS.join(", ")}
      "allergens": string[], // ONLY from: ${CANONICAL_ALLERGENS.join(", ")}
      "removableIngredients": string[], // garnishes/toppings/sauces easily left off on request (e.g. "pickles", "tomato", "onion", "garlic", "parsley") — NEVER core main ingredients!
      "spiceLevel": "NONE" | "MILD" | "MEDIUM" | "HOT",
      "meatType": "NONE" | "CHICKEN" | "BEEF" | "LAMB" | "FISH" | "SHELLFISH" | "OTHER",
      "confidence": number, // 0.0 to 1.0
      "suggestedModifiers": [
        {
          "nameEn": string,
          "nameAr": string,
          "priceDeltaAed": "0.00",
          "removesAllergens": string[], // allergens completely eliminated by this modifier
          "addsDietTags": string[] // diet tags unlocked by this modifier (e.g. "vegan", "vegetarian")
        }
      ]
    }
  ]
}
Safety rules:
- When in doubt whether a traditional recipe contains sesame (tahini), milk (yogurt/butter/ghee/cheese/labneh), gluten (pita/bulgur/flour), eggs, or tree_nuts (pine nuts/walnuts/pistachios), INCLUDE that allergen in "allergens".
- Never tag a dish "vegetarian" or "vegan" if meatType is not "NONE".
- Never tag a dish "vegan" if "milk" or "eggs" is in "allergens".`;

  const payload = params.dishes.map((d, index) => ({
    index,
    nameEn: d.nameEn,
    nameAr: d.nameAr ?? "",
    descriptionEn: d.descriptionEn ?? "",
    ingredientsEn: d.ingredientsEn ?? [],
    existingModifiers: d.existingModifiers ?? [],
  }));

  const rawResult = await runStructuredAgent({
    agentName: "dishTaggingAgent",
    systemInstruction,
    contents: `UNTRUSTED_MENU_DISHES_JSON:\n${wrapUntrustedText(JSON.stringify({ dishes: payload }), 24_000)}`,
    schema: rawTaggingOutputSchema,
    restaurantId: params.restaurantId,
    userId: params.userId,
    callerKey: params.callerKey,
    clientIp: params.clientIp,
  });

  if (!rawResult.ok) {
    return rawResult;
  }

  const items: DishTagSuggestion[] = rawResult.data.items.map((entry) => {
    const allergens = normalizeAllergenList(entry.allergens);
    const allergenSet = new Set(allergens);
    let dietTags = normalizeDietTagList(entry.dietTags);

    if (
      entry.meatType !== "NONE" ||
      allergenSet.has("fish") ||
      allergenSet.has("crustaceans") ||
      allergenSet.has("molluscs") ||
      allergenSet.has("shellfish")
    ) {
      dietTags = dietTags.filter((d) => d !== "vegetarian" && d !== "vegan");
    }
    if (allergenSet.has("milk") || allergenSet.has("eggs")) {
      dietTags = dietTags.filter((d) => d !== "vegan");
    }
    if (entry.meatType !== "NONE" && entry.meatType !== "FISH" && entry.meatType !== "SHELLFISH") {
      dietTags = dietTags.filter((d) => d !== "pescatarian");
    }

    return {
      index: entry.index,
      dietTags,
      allergens,
      removableIngredients: Array.from(
        new Set(entry.removableIngredients.map((r) => r.trim().toLowerCase()).filter(Boolean)),
      ),
      removableIngredientsVerified: false as const,
      spiceLevel: entry.spiceLevel,
      meatType: entry.meatType,
      aiConfidence: entry.confidence.toFixed(3),
      verificationStatus: "AI_SUGGESTED",
      suggestedModifiers: entry.suggestedModifiers.map((mod) => ({
        nameEn: mod.nameEn,
        nameAr: mod.nameAr,
        priceDeltaAed: normalizeAiPriceToAed(mod.priceDeltaAed, "0.00"),
        removesAllergens: normalizeAllergenList(mod.removesAllergens),
        addsDietTags: normalizeDietTagList(mod.addsDietTags),
        verificationStatus: "AI_SUGGESTED",
      })),
    };
  });

  return {
    ...rawResult,
    data: { items },
  };
}
