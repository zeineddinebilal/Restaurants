import type { MeatType, VerificationStatus } from "@prisma/client";
import { normalizeAllergenList, normalizeDietTagList } from "@/lib/menu/taxonomy";

export interface DishVerificationCandidate {
  allergenDataProvided: boolean;
  allergens: readonly string[];
  dietTags: readonly string[];
  meatType: MeatType;
}

export type DishVerificationValidation =
  | { ok: true; normalizedAllergens: string[]; normalizedDietTags: string[] }
  | { ok: false; code: string; message: string };

/**
 * Validates whether a dish is eligible to be marked `RESTAURANT_VERIFIED`.
 *
 * Safety-first rules:
 * 1. `allergenDataProvided` MUST be `true` (missing allergen data can never be verified safe).
 * 2. Diet/meat/allergen contradictions are rejected:
 *    - `vegetarian` or `vegan` cannot have `meatType !== "NONE"` or `fish`/`crustaceans`/`molluscs`/`shellfish` allergens.
 *    - `vegan` cannot contain `milk` or `eggs` allergens.
 *    - `pescatarian` cannot have `CHICKEN`, `BEEF`, `LAMB`, or `OTHER` meat types.
 */
export function validateDishForVerification(
  candidate: DishVerificationCandidate,
): DishVerificationValidation {
  if (!candidate.allergenDataProvided) {
    return {
      ok: false,
      code: "MISSING_ALLERGEN_DATA",
      message:
        "Cannot mark dish as restaurant-verified until allergen information is explicitly confirmed (allergenDataProvided = true).",
    };
  }

  const allergens = normalizeAllergenList(candidate.allergens);
  const dietTags = normalizeDietTagList(candidate.dietTags);
  const allergenSet = new Set(allergens);
  const dietSet = new Set(dietTags);

  if (dietSet.has("vegetarian") || dietSet.has("vegan")) {
    if (candidate.meatType !== "NONE") {
      return {
        ok: false,
        code: "DIET_MEAT_CONFLICT",
        message: `Dish tagged vegetarian/vegan cannot have meatType "${candidate.meatType}".`,
      };
    }
    if (
      allergenSet.has("fish") ||
      allergenSet.has("crustaceans") ||
      allergenSet.has("molluscs") ||
      allergenSet.has("shellfish")
    ) {
      return {
        ok: false,
        code: "DIET_SEAFOOD_CONFLICT",
        message: "Dish tagged vegetarian/vegan cannot contain fish or shellfish allergens.",
      };
    }
  }

  if (dietSet.has("vegan") && (allergenSet.has("milk") || allergenSet.has("eggs"))) {
    return {
      ok: false,
      code: "VEGAN_ANIMAL_ALLERGEN_CONFLICT",
      message: "Dish tagged vegan cannot contain milk/dairy or egg allergens.",
    };
  }

  if (
    dietSet.has("pescatarian") &&
    candidate.meatType !== "NONE" &&
    candidate.meatType !== "FISH" &&
    candidate.meatType !== "SHELLFISH"
  ) {
    return {
      ok: false,
      code: "PESCATARIAN_MEAT_CONFLICT",
      message: `Dish tagged pescatarian cannot have land meatType "${candidate.meatType}".`,
    };
  }

  return {
    ok: true,
    normalizedAllergens: allergens,
    normalizedDietTags: dietTags,
  };
}

function sameSortedStrings(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((val, i) => val === sb[i]);
}

/**
 * Determines the resulting `verificationStatus` when a restaurant edits an existing dish.
 *
 * - New AI-extracted/tagged items ALWAYS start at `AI_SUGGESTED`.
 * - If safety-critical fields (`allergens`, `dietTags`, `meatType`, `ingredientsEn`,
 *   `ingredientsAr`, or `allergenDataProvided`) change on a `RESTAURANT_VERIFIED` dish
 *   WITHOUT `reverify: true`, its status automatically downgrades to `AI_SUGGESTED`
 *   so modified dishes are never shown as verified-safe until re-confirmed.
 */
export function resolveUpdatedVerificationStatus(params: {
  previous: {
    verificationStatus: VerificationStatus;
    allergenDataProvided: boolean;
    allergens: readonly string[];
    dietTags: readonly string[];
    meatType: MeatType;
    ingredientsEn: readonly string[];
    ingredientsAr: readonly string[];
  };
  next: {
    allergenDataProvided: boolean;
    allergens: readonly string[];
    dietTags: readonly string[];
    meatType: MeatType;
    ingredientsEn: readonly string[];
    ingredientsAr: readonly string[];
  };
  reverify?: boolean;
}):
  | {
      ok: true;
      verificationStatus: VerificationStatus;
      keepVerifiedMetadata: boolean;
    }
  | { ok: false; code: string; message: string } {
  if (params.reverify) {
    const validation = validateDishForVerification(params.next);
    if (!validation.ok) {
      return validation;
    }
    return {
      ok: true,
      verificationStatus: "RESTAURANT_VERIFIED",
      keepVerifiedMetadata: false, // caller stamps fresh verifiedAt + verifiedById
    };
  }

  if (!params.next.allergenDataProvided) {
    return {
      ok: true,
      verificationStatus: "AI_SUGGESTED",
      keepVerifiedMetadata: false,
    };
  }

  if (params.previous.verificationStatus !== "RESTAURANT_VERIFIED") {
    return {
      ok: true,
      verificationStatus: "AI_SUGGESTED",
      keepVerifiedMetadata: false,
    };
  }

  const safetyFieldsUnchanged =
    params.previous.allergenDataProvided === params.next.allergenDataProvided &&
    params.previous.meatType === params.next.meatType &&
    sameSortedStrings(
      normalizeAllergenList(params.previous.allergens),
      normalizeAllergenList(params.next.allergens),
    ) &&
    sameSortedStrings(
      normalizeDietTagList(params.previous.dietTags),
      normalizeDietTagList(params.next.dietTags),
    ) &&
    sameSortedStrings(params.previous.ingredientsEn, params.next.ingredientsEn) &&
    sameSortedStrings(params.previous.ingredientsAr, params.next.ingredientsAr);

  if (!safetyFieldsUnchanged) {
    return {
      ok: true,
      verificationStatus: "AI_SUGGESTED",
      keepVerifiedMetadata: false,
    };
  }

  return {
    ok: true,
    verificationStatus: "RESTAURANT_VERIFIED",
    keepVerifiedMetadata: true,
  };
}
