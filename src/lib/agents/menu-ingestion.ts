import { z } from "zod";
import { type AgentCallResult, runStructuredAgent } from "@/lib/agents/gemini";
import { aedToFils, filsToAedString } from "@/lib/money";

const rawModifierSchema = z.object({
  nameEn: z.string().trim().min(1).max(160),
  nameAr: z.string().trim().min(1).max(160),
  priceDeltaAed: z.union([z.string(), z.number()]).default("0.00"),
});

const rawMenuItemSchema = z.object({
  nameEn: z.string().trim().min(1).max(160),
  nameAr: z.string().trim().min(1).max(160),
  descriptionEn: z.string().trim().max(600).optional().default(""),
  descriptionAr: z.string().trim().max(600).optional().default(""),
  priceAed: z.union([z.string(), z.number()]),
  portionSize: z.string().trim().max(80).optional().default(""),
  ingredientsEn: z.array(z.string().trim().min(1)).default([]),
  ingredientsAr: z.array(z.string().trim().min(1)).default([]),
  modifiers: z.array(rawModifierSchema).default([]),
});

const rawIngestionOutputSchema = z.object({
  categories: z
    .array(
      z.object({
        nameEn: z.string().trim().min(1).max(120),
        nameAr: z.string().trim().min(1).max(120),
        items: z.array(rawMenuItemSchema).min(1),
      }),
    )
    .min(1),
});

export interface IngestedModifier {
  nameEn: string;
  nameAr: string;
  priceDeltaAed: string;
  verificationStatus: "AI_SUGGESTED";
}

export interface IngestedMenuItem {
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  priceAed: string;
  portionSize: string;
  ingredientsEn: string[];
  ingredientsAr: string[];
  modifiers: IngestedModifier[];
  verificationStatus: "AI_SUGGESTED";
}

export interface IngestedCategory {
  nameEn: string;
  nameAr: string;
  items: IngestedMenuItem[];
}

export interface MenuIngestionOutput {
  categories: IngestedCategory[];
}

/**
 * Converts a raw AI price value (e.g. "42", "42.5", 42) into an exact 2-decimal AED string
 * without performing floating-point multiplication.
 */
export function normalizeAiPriceToAed(raw: string | number, fallback = "0.00"): string {
  const str = String(raw)
    .replace(/[^0-9.-]/g, "")
    .trim();
  if (!str) return fallback;

  // Truncate/round extra decimals purely via string manipulation if model emits >2 decimals
  const parts = str.split(".");
  const normalized = parts.length === 1 ? parts[0]! : `${parts[0] || "0"}.${parts[1]!.slice(0, 2)}`;

  try {
    const fils = aedToFils(normalized);
    return fils < 0 ? fallback : filsToAedString(fils);
  } catch {
    return fallback;
  }
}

export const ALLOWED_INGESTION_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

/**
 * Agent 1: Menu Ingestion Agent
 * Accepts menu photo(s), PDF bytes (processed in memory, never saved to disk),
 * and/or pasted menu text, and outputs bilingual EN/AR categories, items,
 * exact AED prices, ingredients, and modifiers for owner review.
 */
export async function runMenuIngestionAgent(params: {
  pastedText?: string;
  files?: Array<{ mimeType: string; base64Data: string }>;
  restaurantId?: string;
  userId?: string;
}): Promise<AgentCallResult<MenuIngestionOutput>> {
  const hasText = Boolean(params.pastedText?.trim());
  const files = params.files ?? [];

  if (!hasText && files.length === 0) {
    return {
      ok: false,
      reason: "SCHEMA_VALIDATION_FAILED",
      message: "Provide menu photos/PDF or pasted menu text.",
    };
  }

  for (const f of files) {
    if (!ALLOWED_INGESTION_MIMES.has(f.mimeType)) {
      return {
        ok: false,
        reason: "SCHEMA_VALIDATION_FAILED",
        message: `Unsupported file type "${f.mimeType}". Allowed: JPEG, PNG, WebP, PDF.`,
      };
    }
  }

  const systemInstruction = `You are the Menu Ingestion Agent for a UAE restaurant platform (prices in AED).
Extract every menu category and dish accurately from the provided image(s), PDF, or text.
Rules:
1. Output valid JSON matching:
   { "categories": [ { "nameEn": string, "nameAr": string, "items": [ { "nameEn": string, "nameAr": string, "descriptionEn": string, "descriptionAr": string, "priceAed": "XX.XX", "portionSize": string, "ingredientsEn": string[], "ingredientsAr": string[], "modifiers": [ { "nameEn": string, "nameAr": string, "priceDeltaAed": "0.00" } ] } ] } ] }
2. Always provide BOTH English (En) and natural Arabic (Ar) for category names, item names, descriptions, ingredients, and modifiers. Translate faithfully if only one language is shown on the source menu.
3. Format priceAed and priceDeltaAed as 2-decimal strings in AED (e.g. "28.00", "0.00").
4. Never invent dishes that are not in the input. Include useful dietary modifiers when naturally applicable (e.g. "Without cheese", "Without yogurt sauce").`;

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

  for (const file of files) {
    parts.push({
      inlineData: {
        mimeType: file.mimeType,
        data: file.base64Data,
      },
    });
  }

  if (hasText) {
    parts.push({
      text: `Menu text:\n${params.pastedText!.trim()}`,
    });
  } else {
    parts.push({
      text: "Extract all categories and menu items from the attached menu file(s) into the required JSON schema.",
    });
  }

  const rawResult = await runStructuredAgent({
    agentName: "menuIngestionAgent",
    systemInstruction,
    contents: [{ role: "user", parts }],
    schema: rawIngestionOutputSchema,
    restaurantId: params.restaurantId,
    userId: params.userId,
  });

  if (!rawResult.ok) {
    return rawResult;
  }

  const categories: IngestedCategory[] = rawResult.data.categories.map((cat) => ({
    nameEn: cat.nameEn,
    nameAr: cat.nameAr,
    items: cat.items.map((item) => ({
      nameEn: item.nameEn,
      nameAr: item.nameAr,
      descriptionEn: item.descriptionEn ?? "",
      descriptionAr: item.descriptionAr ?? "",
      priceAed: normalizeAiPriceToAed(item.priceAed, "0.00"),
      portionSize: item.portionSize ?? "",
      ingredientsEn: item.ingredientsEn,
      ingredientsAr: item.ingredientsAr,
      verificationStatus: "AI_SUGGESTED" as const,
      modifiers: item.modifiers.map((mod) => ({
        nameEn: mod.nameEn,
        nameAr: mod.nameAr,
        priceDeltaAed: normalizeAiPriceToAed(mod.priceDeltaAed, "0.00"),
        verificationStatus: "AI_SUGGESTED" as const,
      })),
    })),
  }));

  return {
    ...rawResult,
    data: { categories },
  };
}
