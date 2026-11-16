import type { PrismaClient, SpiceLevel } from "@prisma/client";
import { z } from "zod";
import { type AgentCallResult, runStructuredAgent } from "@/lib/agents/gemini";
import { wrapUntrustedText } from "@/lib/agents/guardrails";
import { normalizeAiPriceToAed } from "@/lib/agents/menu-ingestion";
import type { Locale } from "@/lib/i18n/dictionaries";
import {
  buildCustomAvoidIngredient,
  type CustomAvoidIngredient,
  parseFreeTextProfileFallback,
} from "@/lib/menu/ingredient-synonyms";
import {
  ALL_DINER_DIETS,
  CANONICAL_ALLERGENS,
  normalizeAllergenList,
  normalizeDinerDietRestrictions,
  SPICE_LEVELS,
} from "@/lib/menu/taxonomy";

const rawCustomAvoidSchema = z.object({
  key: z.string().trim().min(1).max(60),
  labelEn: z.string().trim().min(1).max(80),
  labelAr: z.string().trim().min(1).max(80),
  terms: z.array(z.string().trim().min(1).max(80)).min(1).max(16),
});

const rawTasteProfileSchema = z.object({
  reply: z.string().trim().min(1).max(500),
  dietaryRestrictions: z.array(z.string()).default([]),
  allergens: z.array(z.string()).default([]),
  customAvoidIngredients: z.array(rawCustomAvoidSchema).max(15).default([]),
  likedIngredients: z.array(z.string().trim().min(1)).default([]),
  dislikedIngredients: z.array(z.string().trim().min(1)).default([]),
  favoriteCuisines: z.array(z.string().trim().min(1)).default([]),
  spiceTolerance: z.enum(SPICE_LEVELS).optional(),
  maxBudgetAed: z.union([z.string(), z.number(), z.null()]).optional(),
  preferHighProtein: z.boolean().optional(),
  preferKeto: z.boolean().optional(),
});

export interface TasteProfileAgentOutput {
  reply: string;
  patch: {
    dietaryRestrictions: string[];
    allergens: string[];
    customAvoidIngredients: CustomAvoidIngredient[];
    likedIngredients: string[];
    dislikedIngredients: string[];
    favoriteCuisines: string[];
    spiceTolerance?: SpiceLevel;
    maxBudgetAed?: string | null;
    preferHighProtein?: boolean;
    preferKeto?: boolean;
  };
}

/**
 * Agent 3: Taste Profile Agent
 * Turns a diner's natural-language text (including "Other" diets, non-canonical allergies like
 * tomato/garlic/MSG, and colloquial dislikes like "that green herb in tabbouleh") into a
 * structured DinerProfile patch for the diner's explicit Confirmation Screen.
 */
export async function runTasteProfileAgent(params: {
  message: string;
  locale: Locale;
  userId?: string;
  callerKey?: string | null;
  clientIp?: string | null;
  db?: PrismaClient;
}): Promise<AgentCallResult<TasteProfileAgentOutput>> {
  const systemInstruction = `You are the Taste Profile Agent for a UAE dining safety & personalization app (currency: AED).
Interpret the diner's free-text answers into a structured JSON profile patch and a friendly 1-2 sentence confirmation reply in ${params.locale === "ar" ? "Arabic" : "English"}.
Distinguish carefully between HARD medical/religious restrictions vs SOFT taste dislikes:
1. "dietaryRestrictions": ONLY from [${ALL_DINER_DIETS.join(", ")}] (map pork-free -> "no_pork", beef-free -> "no_beef", no red meat -> "no_red_meat", diabetic/low-sugar -> "low_sugar", gluten-free diet -> "gluten_free_lifestyle").
2. "allergens": ONLY canonical allergens from [${CANONICAL_ALLERGENS.join(", ")}] (lactose/dairy -> "milk", wheat/celiac -> "gluten", tahini -> "sesame").
3. "customAvoidIngredients": For ANY hard allergy/intolerance/strict avoidance that is NOT in the 15 canonical allergens (e.g. "tomato allergy", "garlic intolerance", "I react to MSG", "mushroom allergy"), output objects:
   { "key": "tomato", "labelEn": "tomato", "labelAr": "طماطم", "terms": ["tomato", "tomatoes", "طماطم", "بندورة"] }
   Always include singular, plural, English, and common Arabic/Levantine synonyms in "terms"!
4. "dislikedIngredients": Soft taste dislikes (e.g. "I don't like pickles", "that green herb in tabbouleh" -> "parsley", "raw onion"). Do NOT put soft dislikes in allergens or customAvoidIngredients!
5. "likedIngredients": Ingredients/flavors they enjoy (resolve descriptions like "that green herb in tabbouleh" -> "parsley", "garlic dip" -> "garlic").
Output JSON matching:
{
  "reply": string,
  "dietaryRestrictions": string[],
  "allergens": string[],
  "customAvoidIngredients": [{ "key": string, "labelEn": string, "labelAr": string, "terms": string[] }],
  "likedIngredients": string[],
  "dislikedIngredients": string[],
  "favoriteCuisines": string[],
  "spiceTolerance": "NONE" | "MILD" | "MEDIUM" | "HOT",
  "maxBudgetAed": "XX.XX" | null,
  "preferHighProtein": boolean,
  "preferKeto": boolean
}`;

  const rawResult = await runStructuredAgent({
    agentName: "tasteProfileAgent",
    systemInstruction,
    contents: wrapUntrustedText(params.message.trim(), 2000),
    schema: rawTasteProfileSchema,
    userId: params.userId,
    callerKey: params.callerKey,
    clientIp: params.clientIp,
    db: params.db,
  });

  if (!rawResult.ok) {
    return rawResult;
  }

  let maxBudgetAed: string | null | undefined = undefined;
  if (rawResult.data.maxBudgetAed === null) {
    maxBudgetAed = null;
  } else if (rawResult.data.maxBudgetAed !== undefined) {
    const cleaned = normalizeAiPriceToAed(rawResult.data.maxBudgetAed, "");
    maxBudgetAed = cleaned && cleaned !== "0.00" ? cleaned : null;
  }

  const normalizedDiets = normalizeDinerDietRestrictions(rawResult.data.dietaryRestrictions);
  const customAvoidIngredients = rawResult.data.customAvoidIngredients.map((c) =>
    buildCustomAvoidIngredient(c.key, {
      labelEn: c.labelEn,
      labelAr: c.labelAr,
      terms: c.terms,
    }),
  );

  return {
    ...rawResult,
    data: {
      reply: rawResult.data.reply,
      patch: {
        dietaryRestrictions: normalizedDiets,
        allergens: normalizeAllergenList(rawResult.data.allergens),
        customAvoidIngredients,
        likedIngredients: rawResult.data.likedIngredients.slice(0, 20),
        dislikedIngredients: rawResult.data.dislikedIngredients.slice(0, 20),
        favoriteCuisines: rawResult.data.favoriteCuisines.slice(0, 10),
        spiceTolerance: rawResult.data.spiceTolerance,
        maxBudgetAed,
        preferHighProtein:
          rawResult.data.preferHighProtein ?? normalizedDiets.includes("high_protein"),
        preferKeto: rawResult.data.preferKeto ?? normalizedDiets.includes("keto"),
      },
    },
  };
}

/**
 * Executes `runTasteProfileAgent` and, on ANY AI failure (`AI_NOT_CONFIGURED`, `AI_CALL_FAILED`,
 * `SCHEMA_VALIDATION_FAILED`, `AI_QUOTA_EXCEEDED`), falls back deterministically to
 * `parseFreeTextProfileFallback` when `allowFallback !== false`.
 */
export async function resolveTasteChatWithFallback(params: {
  message: string;
  locale: Locale;
  otherDietText?: string;
  otherAllergyText?: string;
  freePreferencesText?: string;
  allowFallback?: boolean;
  userId?: string;
  callerKey?: string | null;
  clientIp?: string | null;
  db?: PrismaClient;
}): Promise<
  | {
      ok: true;
      usedFallback: boolean;
      reply: string;
      patch: TasteProfileAgentOutput["patch"];
    }
  | {
      ok: false;
      reason: Exclude<AgentCallResult<TasteProfileAgentOutput>, { ok: true }>["reason"];
      safeError: string;
    }
> {
  const result = await runTasteProfileAgent({
    message: params.message,
    locale: params.locale,
    userId: params.userId,
    callerKey: params.callerKey,
    clientIp: params.clientIp,
    db: params.db,
  });

  if (result.ok) {
    return {
      ok: true,
      usedFallback: false,
      reply: result.data.reply,
      patch: result.data.patch,
    };
  }

  if (params.allowFallback !== false) {
    const fb = parseFreeTextProfileFallback({
      otherDietText: params.otherDietText,
      otherAllergyText: params.otherAllergyText,
      freePreferencesText: params.freePreferencesText || params.message,
    });
    return {
      ok: true,
      usedFallback: true,
      reply:
        params.locale === "ar"
          ? "تمت مطابقة ملاحظاتك تلقائياً بدون الذكاء الاصطناعي — يرجى المراجعة والتأكيد قبل الحفظ."
          : "Your notes were matched without AI — please review and confirm before saving.",
      patch: {
        dietaryRestrictions: fb.dietaryRestrictions,
        allergens: fb.allergens,
        customAvoidIngredients: fb.customAvoidIngredients,
        likedIngredients: fb.likedIngredients,
        dislikedIngredients: fb.dislikedIngredients,
        favoriteCuisines: [],
        ...(fb.maxBudgetAed !== undefined ? { maxBudgetAed: fb.maxBudgetAed } : {}),
      },
    };
  }

  return {
    ok: false,
    reason: result.reason,
    safeError:
      params.locale === "ar"
        ? "تعذر تحليل الملاحظات حالياً — يرجى استخدام الخيارات السريعة أدناه."
        : "Unable to analyze notes right now — please use the quick-pick options below.",
  };
}
