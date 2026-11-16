import type { MeatType, VerificationStatus } from "@prisma/client";
import { normalizeAllergenList, normalizeDietTagList } from "@/lib/menu/taxonomy";

export interface ModifierVerificationCandidate {
  nameEn: string;
  nameAr?: string;
  removesAllergens: readonly string[];
  addsDietTags: readonly string[];
}

export interface DishVerificationCandidate {
  allergenDataProvided: boolean;
  allergens: readonly string[];
  dietTags: readonly string[];
  meatType: MeatType;
  modifiers?: readonly ModifierVerificationCandidate[];
}

export type DishVerificationValidation =
  | { ok: true; normalizedAllergens: string[]; normalizedDietTags: string[] }
  | { ok: false; code: string; message: string };

/**
 * Validates a modifier against its parent dish before allowing verification:
 * - `addsDietTags` containing "vegetarian" or "vegan" is invalid if base `meatType !== "NONE"`
 *   (modifiers do not remove base meatType) or if remaining allergens still contain fish/shellfish.
 * - `addsDietTags` containing "vegan" requires that any `milk` or `eggs` on the base dish
 *   are included in `modifier.removesAllergens`.
 * - `addsDietTags` containing "pescatarian" is invalid if base `meatType` is land meat.
 */
export function validateModifierForVerification(
  dish: {
    allergens: readonly string[];
    dietTags: readonly string[];
    meatType: MeatType;
  },
  modifier: ModifierVerificationCandidate,
):
  | { ok: true; normalizedRemovesAllergens: string[]; normalizedAddsDietTags: string[] }
  | { ok: false; code: string; message: string } {
  const baseAllergens = normalizeAllergenList(dish.allergens);
  const removesAllergens = normalizeAllergenList(modifier.removesAllergens);
  const addsDietTags = normalizeDietTagList(modifier.addsDietTags);

  const removedSet = new Set(removesAllergens);
  const remainingAllergens = new Set(baseAllergens.filter((a) => !removedSet.has(a)));
  const addedDietSet = new Set(addsDietTags);
  const combinedDietSet = new Set([...normalizeDietTagList(dish.dietTags), ...addsDietTags]);

  if (addedDietSet.has("vegetarian") || addedDietSet.has("vegan")) {
    if (dish.meatType !== "NONE") {
      return {
        ok: false,
        code: "MODIFIER_MEAT_CONFLICT",
        message: `Modifier "${modifier.nameEn}" cannot add vegetarian/vegan to a dish with meatType "${dish.meatType}".`,
      };
    }
    if (
      remainingAllergens.has("fish") ||
      remainingAllergens.has("crustaceans") ||
      remainingAllergens.has("molluscs") ||
      remainingAllergens.has("shellfish")
    ) {
      return {
        ok: false,
        code: "MODIFIER_SEAFOOD_CONFLICT",
        message: `Modifier "${modifier.nameEn}" cannot add vegetarian/vegan while fish/shellfish allergens remain.`,
      };
    }
  }

  if (addedDietSet.has("vegan") || (combinedDietSet.has("vegan") && addedDietSet.size > 0)) {
    if (remainingAllergens.has("milk") || remainingAllergens.has("eggs")) {
      return {
        ok: false,
        code: "MODIFIER_VEGAN_DAIRY_EGG_CONFLICT",
        message: `Modifier "${modifier.nameEn}" adds vegan, so it must remove all milk and egg allergens present in the base dish.`,
      };
    }
  }

  if (
    addedDietSet.has("pescatarian") &&
    dish.meatType !== "NONE" &&
    dish.meatType !== "FISH" &&
    dish.meatType !== "SHELLFISH"
  ) {
    return {
      ok: false,
      code: "MODIFIER_PESCATARIAN_MEAT_CONFLICT",
      message: `Modifier "${modifier.nameEn}" cannot add pescatarian to land meatType "${dish.meatType}".`,
    };
  }

  return {
    ok: true,
    normalizedRemovesAllergens: removesAllergens,
    normalizedAddsDietTags: addsDietTags,
  };
}

/**
 * Validates whether a dish (and all of its modifiers, if provided) is eligible
 * to be marked `RESTAURANT_VERIFIED`.
 */
export function validateDishForVerification(
  candidate: DishVerificationCandidate,
): DishVerificationValidation {
  if (!candidate.allergenDataProvided) {
    return {
      ok: false,
      code: "MISSING_ALLERGEN_DATA",
      message:
        "Cannot mark dish as restaurant-verified until allergen information is explicitly confirmed by the restaurant.",
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

  for (const mod of candidate.modifiers ?? []) {
    const modCheck = validateModifierForVerification(
      {
        allergens,
        dietTags,
        meatType: candidate.meatType,
      },
      mod,
    );
    if (!modCheck.ok) {
      return modCheck;
    }
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

function canonicalizeModifiers(mods: readonly ModifierVerificationCandidate[]): string[] {
  return mods
    .map((m) => {
      const rem = normalizeAllergenList(m.removesAllergens).sort().join(",");
      const add = normalizeDietTagList(m.addsDietTags).sort().join(",");
      return `${m.nameEn.trim()}|${(m.nameAr ?? "").trim()}|${rem}|${add}`;
    })
    .sort();
}

/**
 * Evaluates a batch-imported item where `verifyNow` may have been requested.
 * If validation fails, safely falls back to `AI_SUGGESTED` and returns a warning
 * rather than allowing invalid safety claims to be saved as verified.
 */
export function evaluateBatchImportVerification(
  candidate: DishVerificationCandidate & { nameEn: string; verifyNow: boolean },
): {
  verified: boolean;
  warning?: { nameEn: string; code: string; message: string };
} {
  if (!candidate.verifyNow) {
    return { verified: false };
  }

  const check = validateDishForVerification(candidate);
  if (!check.ok) {
    return {
      verified: false,
      warning: {
        nameEn: candidate.nameEn,
        code: check.code,
        message: check.message,
      },
    };
  }

  return { verified: true };
}

/**
 * Determines the resulting `verificationStatus` when a restaurant edits an existing dish.
 *
 * - Any change to dish safety fields OR modifiers (`removesAllergens`, `addsDietTags`,
 *   modifier names, or adding/removing modifiers) downgrades BOTH the dish and its
 *   modifiers to `AI_SUGGESTED` unless `reverify: true` is passed and passes validation.
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
    modifiers?: readonly ModifierVerificationCandidate[];
  };
  next: {
    allergenDataProvided: boolean;
    allergens: readonly string[];
    dietTags: readonly string[];
    meatType: MeatType;
    ingredientsEn: readonly string[];
    ingredientsAr: readonly string[];
    modifiers?: readonly ModifierVerificationCandidate[];
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
    const validation = validateDishForVerification({
      ...params.next,
      modifiers: params.next.modifiers ?? params.previous.modifiers,
    });
    if (!validation.ok) {
      return validation;
    }
    return {
      ok: true,
      verificationStatus: "RESTAURANT_VERIFIED",
      keepVerifiedMetadata: false,
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

  const modifiersUnchanged =
    params.next.modifiers === undefined
      ? true
      : sameSortedStrings(
          canonicalizeModifiers(params.previous.modifiers ?? []),
          canonicalizeModifiers(params.next.modifiers),
        );

  const safetyFieldsUnchanged =
    modifiersUnchanged &&
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
