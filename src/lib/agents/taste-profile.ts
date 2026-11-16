import type { SpiceLevel } from "@prisma/client";
import { z } from "zod";
import { type AgentCallResult, runStructuredAgent } from "@/lib/agents/gemini";
import { normalizeAiPriceToAed } from "@/lib/agents/menu-ingestion";
import type { Locale } from "@/lib/i18n/dictionaries";
import {
  CANONICAL_ALLERGENS,
  CANONICAL_DIET_TAGS,
  normalizeAllergenList,
  normalizeDietTagList,
  SPICE_LEVELS,
} from "@/lib/menu/taxonomy";

const rawTasteProfileSchema = z.object({
  reply: z.string().trim().min(1).max(500),
  dietaryRestrictions: z.array(z.string()).default([]),
  allergens: z.array(z.string()).default([]),
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
 * Turns a diner's friendly natural-language message into a structured DinerProfile patch.
 */
export async function runTasteProfileAgent(params: {
  message: string;
  locale: Locale;
  userId?: string;
}): Promise<AgentCallResult<TasteProfileAgentOutput>> {
  const systemInstruction = `You are the Taste Profile Agent for a UAE dining personalization app (currency: AED).
Convert the diner's message into a structured JSON profile patch and a warm 1-2 sentence reply in ${params.locale === "ar" ? "Arabic" : "English"}.
JSON schema:
{
  "reply": string,
  "dietaryRestrictions": string[], // ONLY from: ${CANONICAL_DIET_TAGS.filter((d) => d !== "keto" && d !== "high_protein").join(", ")}
  "allergens": string[], // ONLY from: ${CANONICAL_ALLERGENS.join(", ")} (map lactose/dairy intolerance to "milk", wheat/celiac to "gluten")
  "likedIngredients": string[],
  "dislikedIngredients": string[],
  "favoriteCuisines": string[],
  "spiceTolerance": "NONE" | "MILD" | "MEDIUM" | "HOT",
  "maxBudgetAed": "XX.XX" | null, // whole-meal budget in AED if mentioned, else null
  "preferHighProtein": boolean,
  "preferKeto": boolean
}`;

  const rawResult = await runStructuredAgent({
    agentName: "tasteProfileAgent",
    systemInstruction,
    contents: params.message.trim().slice(0, 1500),
    schema: rawTasteProfileSchema,
    userId: params.userId,
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

  const dietTags = normalizeDietTagList(rawResult.data.dietaryRestrictions);

  return {
    ...rawResult,
    data: {
      reply: rawResult.data.reply,
      patch: {
        dietaryRestrictions: dietTags.filter(
          (d) => d === "vegetarian" || d === "vegan" || d === "pescatarian" || d === "halal",
        ),
        allergens: normalizeAllergenList(rawResult.data.allergens),
        likedIngredients: rawResult.data.likedIngredients.slice(0, 15),
        dislikedIngredients: rawResult.data.dislikedIngredients.slice(0, 15),
        favoriteCuisines: rawResult.data.favoriteCuisines.slice(0, 10),
        spiceTolerance: rawResult.data.spiceTolerance,
        maxBudgetAed,
        preferHighProtein: rawResult.data.preferHighProtein ?? dietTags.includes("high_protein"),
        preferKeto: rawResult.data.preferKeto ?? dietTags.includes("keto"),
      },
    },
  };
}
