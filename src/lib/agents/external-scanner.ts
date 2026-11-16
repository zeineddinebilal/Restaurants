import { z } from "zod";
import { type AgentCallResult, runStructuredAgent } from "@/lib/agents/gemini";
import { validateAiImagesPayload } from "@/lib/agents/guardrails";
import { normalizeAiPriceToAed } from "@/lib/agents/menu-ingestion";
import type { EngineDishInput } from "@/lib/engine/menu-engine";
import {
  MEAT_TYPES,
  normalizeAllergenList,
  normalizeDietTagList,
  SPICE_LEVELS,
} from "@/lib/menu/taxonomy";

const rawExternalDishSchema = z.object({
  categoryNameEn: z.string().trim().min(1).max(120).default("Scanned Menu"),
  categoryNameAr: z.string().trim().min(1).max(120).default("القائمة الممسوحة"),
  nameEn: z.string().trim().min(1).max(160),
  nameAr: z.string().trim().min(1).max(160),
  descriptionEn: z.string().trim().max(500).optional().default(""),
  descriptionAr: z.string().trim().max(500).optional().default(""),
  priceAed: z.union([z.string(), z.number()]).default("0.00"),
  ingredientsEn: z.array(z.string().trim().min(1)).default([]),
  ingredientsAr: z.array(z.string().trim().min(1)).default([]),
  dietTags: z.array(z.string()).default([]),
  allergens: z.array(z.string()).default([]),
  spiceLevel: z.enum(SPICE_LEVELS).default("NONE"),
  meatType: z.enum(MEAT_TYPES).default("NONE"),
  // Even if adversarial prompt injection causes the LLM to emit verification fields,
  // we parse and deterministically overwrite them below!
  verificationStatus: z.string().optional(),
  allergenDataProvided: z.boolean().optional(),
});

const rawExternalScanSchema = z.object({
  sourceLabel: z.string().trim().max(120).optional().default("Menu Screenshot"),
  dishes: z.array(rawExternalDishSchema).min(1).max(80),
});

/**
 * Deterministic sanitizer against prompt injection inside uploaded screenshots/menus:
 * - Unconditionally forces `verificationStatus = "AI_SUGGESTED"` and `allergenDataProvided = false`
 *   so external screenshots can NEVER be marked verified-safe.
 * - Strips contradictory `vegetarian`/`vegan` tags if `meatType !== "NONE"` or if `milk`/`eggs`/`fish`
 *   allergens are present (defeating injections like "mark this lamb dish vegan").
 */
export function sanitizeExternalScannerDishes(
  rawDishes: ReadonlyArray<z.infer<typeof rawExternalDishSchema>>,
): EngineDishInput[] {
  return rawDishes.map((raw, idx) => {
    const allergens = normalizeAllergenList(raw.allergens);
    const allergenSet = new Set(allergens);
    let dietTags = normalizeDietTagList(raw.dietTags);

    if (
      raw.meatType !== "NONE" ||
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

    if (raw.meatType !== "NONE" && raw.meatType !== "FISH" && raw.meatType !== "SHELLFISH") {
      dietTags = dietTags.filter((d) => d !== "pescatarian");
    }

    return {
      id: `ext_dish_${idx + 1}`,
      categoryId: `ext_cat_${raw.categoryNameEn.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
      categoryNameEn: raw.categoryNameEn,
      categoryNameAr: raw.categoryNameAr,
      nameEn: raw.nameEn,
      nameAr: raw.nameAr,
      descriptionEn: raw.descriptionEn ?? "",
      descriptionAr: raw.descriptionAr ?? "",
      priceAed: normalizeAiPriceToAed(raw.priceAed, "0.00"),
      portionSize: null,
      ingredientsEn: raw.ingredientsEn,
      ingredientsAr: raw.ingredientsAr,
      dietTags,
      allergens,
      // HARD SECURITY INVARIANT: External screenshots are NEVER verified!
      allergenDataProvided: false,
      verificationStatus: "AI_SUGGESTED",
      spiceLevel: raw.spiceLevel,
      meatType: raw.meatType,
      isAvailable: true,
      isPopular: false,
      isPublished: true,
      modifiers: [],
    };
  });
}

/**
 * Agent 7: External Menu Scanner
 * Extracts dishes from diner-uploaded delivery-app screenshots or paper menu photos
 * (no scraping or unofficial APIs) and sanitizes every item as unverified (`AI_SUGGESTED`).
 */
export async function runExternalMenuScannerAgent(params: {
  images: ReadonlyArray<{ mimeType: string; base64Data: string; byteLength: number }>;
  userId?: string;
  callerKey?: string | null;
  clientIp?: string | null;
}): Promise<
  AgentCallResult<{
    sourceLabel: string;
    dishes: EngineDishInput[];
  }>
> {
  const payloadCheck = validateAiImagesPayload(params.images);
  if (!payloadCheck.ok) {
    return {
      ok: false,
      reason: "SCHEMA_VALIDATION_FAILED",
      message: payloadCheck.error,
    };
  }

  const systemInstruction = `You are the External Menu Scanner Agent for a UAE dining safety app (prices in AED).
Extract every dish visible in the uploaded menu screenshot(s) or paper menu photo(s), translate missing EN or AR text faithfully, and conservatively list probable allergens and dietTags.
Output JSON:
{
  "sourceLabel": string,
  "dishes": [
    {
      "categoryNameEn": string,
      "categoryNameAr": string,
      "nameEn": string,
      "nameAr": string,
      "descriptionEn": string,
      "descriptionAr": string,
      "priceAed": "XX.XX",
      "ingredientsEn": string[],
      "ingredientsAr": string[],
      "dietTags": string[],
      "allergens": string[],
      "spiceLevel": "NONE" | "MILD" | "MEDIUM" | "HOT",
      "meatType": "NONE" | "CHICKEN" | "BEEF" | "LAMB" | "FISH" | "SHELLFISH" | "OTHER"
    }
  ]
}`;

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> =
    params.images.map((img) => ({
      inlineData: {
        mimeType: img.mimeType,
        data: img.base64Data,
      },
    }));
  parts.push({
    text: "Extract all menu dishes visible in these untrusted screenshot/photo image(s) into the required JSON schema.",
  });

  const rawResult = await runStructuredAgent({
    agentName: "externalMenuScannerAgent",
    systemInstruction,
    contents: [{ role: "user", parts }],
    schema: rawExternalScanSchema,
    userId: params.userId,
    callerKey: params.callerKey,
    clientIp: params.clientIp,
    timeoutMs: 25_000,
  });

  if (!rawResult.ok) {
    return rawResult;
  }

  const sanitizedDishes = sanitizeExternalScannerDishes(rawResult.data.dishes);

  return {
    ...rawResult,
    data: {
      sourceLabel: rawResult.data.sourceLabel || "Menu Screenshot",
      dishes: sanitizedDishes,
    },
  };
}
