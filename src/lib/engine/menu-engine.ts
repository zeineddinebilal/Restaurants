import type { MeatType, SpiceLevel, VerificationStatus } from "@prisma/client";
import { normalizeAllergenList, normalizeDietTagList } from "@/lib/menu/taxonomy";
import { validateModifierForVerification } from "@/lib/menu/verification";
import { aedToFils, computeRemainingBudgetFils, filsToAedString, formatAed } from "@/lib/money";

export interface EngineModifierInput {
  id: string;
  nameEn: string;
  nameAr: string;
  priceDeltaAed: string;
  removesAllergens: readonly string[];
  addsDietTags: readonly string[];
  verificationStatus: VerificationStatus;
}

export interface EngineDishInput {
  id: string;
  categoryId: string;
  categoryNameEn?: string;
  categoryNameAr?: string;
  nameEn: string;
  nameAr: string;
  descriptionEn?: string | null;
  descriptionAr?: string | null;
  priceAed: string;
  portionSize?: string | null;
  ingredientsEn: readonly string[];
  ingredientsAr: readonly string[];
  dietTags: readonly string[];
  allergens: readonly string[] | null | undefined;
  allergenDataProvided: boolean;
  spiceLevel: SpiceLevel;
  meatType: MeatType;
  verificationStatus: VerificationStatus;
  isAvailable: boolean;
  isPopular: boolean;
  isPublished: boolean;
  cachedBlurbEn?: string | null;
  cachedBlurbAr?: string | null;
  imageUrl?: string | null;
  modifiers: readonly EngineModifierInput[];
}

export interface EngineDinerProfile {
  displayName?: string;
  dietaryRestrictions: readonly string[];
  allergens: readonly string[];
  likedIngredients?: readonly string[];
  dislikedIngredients?: readonly string[];
  spiceTolerance?: SpiceLevel;
  maxBudgetAed?: string | null;
  preferHighProtein?: boolean;
  preferKeto?: boolean;
  pastRatingsByDishId?: Readonly<Record<string, number>>;
}

export type DishSafetyState =
  "NO_RESTRICTIONS" | "VERIFIED_SAFE" | "SAFE_WITH_MODIFIER" | "UNVERIFIED_WARNING" | "HIDDEN";

export type MenuBadge =
  | "VERIFIED_SAFE"
  | "SAFE_WITH_MODIFIER"
  | "UNVERIFIED_WARNING"
  | "BEST_VALUE"
  | "POPULAR"
  | "SPICY";

export interface EvaluatedMenuItem {
  dish: EngineDishInput;
  safetyState: DishSafetyState;
  badges: MenuBadge[];
  preselectedModifierIds: string[];
  preselectedModifiers: EngineModifierInput[];
  basePriceFils: number;
  effectivePriceFils: number;
  effectivePriceAed: string;
  withinRemainingBudget: boolean;
  score: number;
  hiddenReasonsEn: string[];
  hiddenReasonsAr: string[];
  whyForYouEn: string;
  whyForYouAr: string;
}

export interface PersonalizedMenuResult {
  hasHardRestrictions: boolean;
  maxBudgetFils: number | null;
  cartTotalFils: number;
  remainingBudgetFils: number | null;
  perfectForYou: EvaluatedMenuItem[];
  goodOptions: EvaluatedMenuItem[];
  moreOptions: EvaluatedMenuItem[];
  hidden: EvaluatedMenuItem[];
}

function expandDinerAllergens(raw: readonly string[]): Set<string> {
  const normalized = normalizeAllergenList(raw);
  const expanded = new Set<string>(normalized);
  // Shellfish umbrella protects against crustaceans & molluscs and vice-versa
  if (expanded.has("shellfish")) {
    expanded.add("crustaceans");
    expanded.add("molluscs");
  }
  if (expanded.has("crustaceans") || expanded.has("molluscs")) {
    expanded.add("shellfish");
  }
  return expanded;
}

function evaluateConflictsAgainstState(params: {
  dinerAllergens: ReadonlySet<string>;
  dinerDiets: readonly string[];
  dishAllergens: readonly string[];
  dishDiets: readonly string[];
  meatType: MeatType;
}): {
  conflictingAllergens: string[];
  conflictingDiets: string[];
  reasonsEn: string[];
  reasonsAr: string[];
} {
  const { dinerAllergens, dinerDiets, dishAllergens, dishDiets, meatType } = params;
  const dishAllergenSet = new Set(dishAllergens);
  const dishDietSet = new Set(dishDiets);

  const conflictingAllergens: string[] = [];
  const conflictingDiets: string[] = [];
  const reasonsEn: string[] = [];
  const reasonsAr: string[] = [];

  for (const alg of dishAllergenSet) {
    if (dinerAllergens.has(alg)) {
      conflictingAllergens.push(alg);
      reasonsEn.push(`Contains ${alg.replace(/_/g, " ")}`);
      reasonsAr.push(`يحتوي على ${alg}`);
    }
  }

  for (const diet of dinerDiets) {
    if (diet === "vegetarian") {
      const hasSeafoodAllergen =
        dishAllergenSet.has("fish") ||
        dishAllergenSet.has("crustaceans") ||
        dishAllergenSet.has("molluscs") ||
        dishAllergenSet.has("shellfish");
      if (meatType !== "NONE" || hasSeafoodAllergen || !dishDietSet.has("vegetarian")) {
        conflictingDiets.push("vegetarian");
        reasonsEn.push(
          meatType !== "NONE" ? `Contains meat (${meatType.toLowerCase()})` : "Not vegetarian",
        );
        reasonsAr.push("غير نباتي");
      }
    } else if (diet === "vegan") {
      const hasAnimalAllergen =
        dishAllergenSet.has("milk") ||
        dishAllergenSet.has("eggs") ||
        dishAllergenSet.has("fish") ||
        dishAllergenSet.has("crustaceans") ||
        dishAllergenSet.has("molluscs") ||
        dishAllergenSet.has("shellfish");
      if (meatType !== "NONE" || hasAnimalAllergen || !dishDietSet.has("vegan")) {
        conflictingDiets.push("vegan");
        reasonsEn.push("Not vegan");
        reasonsAr.push("غير نباتي صرف (فيغن)");
      }
    } else if (diet === "pescatarian") {
      const hasLandMeat = meatType !== "NONE" && meatType !== "FISH" && meatType !== "SHELLFISH";
      if (
        hasLandMeat ||
        (!dishDietSet.has("pescatarian") &&
          !dishDietSet.has("vegetarian") &&
          !dishDietSet.has("vegan"))
      ) {
        conflictingDiets.push("pescatarian");
        reasonsEn.push("Contains land meat (not pescatarian)");
        reasonsAr.push("يحتوي على لحوم غير بحرية");
      }
    } else if (diet === "halal") {
      if (!dishDietSet.has("halal")) {
        conflictingDiets.push("halal");
        reasonsEn.push("Not tagged halal");
        reasonsAr.push("غير مصنف كحلال");
      }
    }
  }

  return { conflictingAllergens, conflictingDiets, reasonsEn, reasonsAr };
}

/**
 * Finds a single restaurant-verified, safety-valid modifier that resolves ALL
 * hard conflicts for the diner on `dish`.
 */
function findVerifiedUnlockModifier(params: {
  dish: EngineDishInput;
  dishAllergens: readonly string[];
  dishDiets: readonly string[];
  dinerAllergens: ReadonlySet<string>;
  dinerDiets: readonly string[];
}): EngineModifierInput | null {
  const { dish, dishAllergens, dishDiets, dinerAllergens, dinerDiets } = params;

  // A modifier can only unlock a conflicting dish as safe when the parent dish itself
  // has confirmed allergen data and is RESTAURANT_VERIFIED.
  if (!dish.allergenDataProvided || dish.verificationStatus !== "RESTAURANT_VERIFIED") {
    return null;
  }

  for (const mod of dish.modifiers) {
    if (mod.verificationStatus !== "RESTAURANT_VERIFIED") {
      continue;
    }

    // Enforce the exact same modifier consistency rules as Phase 3 Fix 3
    const validity = validateModifierForVerification(
      {
        allergens: dishAllergens,
        dietTags: dishDiets,
        meatType: dish.meatType,
      },
      mod,
    );
    if (!validity.ok) {
      continue;
    }

    const removedSet = new Set(validity.normalizedRemovesAllergens);
    // Expand shellfish removals consistently only if explicitly removed
    const postAllergens = dishAllergens.filter((a) => !removedSet.has(a));
    const postDiets = Array.from(new Set([...dishDiets, ...validity.normalizedAddsDietTags]));

    const postConflict = evaluateConflictsAgainstState({
      dinerAllergens,
      dinerDiets,
      dishAllergens: postAllergens,
      dishDiets: postDiets,
      meatType: dish.meatType,
    });

    if (
      postConflict.conflictingAllergens.length === 0 &&
      postConflict.conflictingDiets.length === 0
    ) {
      return mod;
    }
  }

  return null;
}

const SPICE_RANK: Record<SpiceLevel, number> = {
  NONE: 0,
  MILD: 1,
  MEDIUM: 2,
  HOT: 3,
};

/**
 * Deterministic Personalized Menu Engine (Zero LLM calls on page load).
 *
 * Step 1: Hard deterministic filter (allergies, intolerances, strict diets, modifier unlock,
 *         missing allergen data = UNVERIFIED_WARNING, no-restriction diners = zero safety badges).
 * Step 2: Meal-level remaining-budget check & soft preference scoring.
 * Step 3: One-line EN/AR "Why this is for you" blurbs (cached or deterministic).
 */
export function evaluatePersonalizedMenu(params: {
  dishes: readonly EngineDishInput[];
  profile: EngineDinerProfile;
  currentCartTotalFils?: number;
}): PersonalizedMenuResult {
  const { dishes, profile, currentCartTotalFils = 0 } = params;

  const dinerAllergens = expandDinerAllergens(profile.allergens);
  const hardDiets = normalizeDietTagList(profile.dietaryRestrictions).filter(
    (d) => d === "vegetarian" || d === "vegan" || d === "pescatarian" || d === "halal",
  );
  const hasHardRestrictions = dinerAllergens.size > 0 || hardDiets.length > 0;

  const maxBudgetFils =
    profile.maxBudgetAed !== undefined &&
    profile.maxBudgetAed !== null &&
    profile.maxBudgetAed !== ""
      ? aedToFils(profile.maxBudgetAed)
      : null;

  const remainingBudgetFils =
    maxBudgetFils !== null
      ? computeRemainingBudgetFils(maxBudgetFils, Math.max(0, currentCartTotalFils))
      : null;

  const likedLower = (profile.likedIngredients ?? [])
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const dislikedLower = (profile.dislikedIngredients ?? [])
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const dinerSpice = profile.spiceTolerance ?? "MEDIUM";

  const visibleEvaluated: EvaluatedMenuItem[] = [];
  const hidden: EvaluatedMenuItem[] = [];

  for (const dish of dishes) {
    if (!dish.isPublished || !dish.isAvailable) {
      continue;
    }

    const basePriceFils = aedToFils(dish.priceAed);
    const hasAllergenArray = Array.isArray(dish.allergens);
    const missingAllergenData = !dish.allergenDataProvided || !hasAllergenArray;
    const normalizedDishAllergens = hasAllergenArray ? normalizeAllergenList(dish.allergens!) : [];
    const normalizedDishDiets = normalizeDietTagList(dish.dietTags);

    let safetyState: DishSafetyState = "NO_RESTRICTIONS";
    let preselectedModifiers: EngineModifierInput[] = [];
    let effectivePriceFils = basePriceFils;

    if (hasHardRestrictions) {
      const baseConflicts = evaluateConflictsAgainstState({
        dinerAllergens,
        dinerDiets: hardDiets,
        dishAllergens: normalizedDishAllergens,
        dishDiets: normalizedDishDiets,
        meatType: dish.meatType,
      });

      const hasBaseConflict =
        baseConflicts.conflictingAllergens.length > 0 || baseConflicts.conflictingDiets.length > 0;

      if (!hasBaseConflict) {
        if (!missingAllergenData && dish.verificationStatus === "RESTAURANT_VERIFIED") {
          safetyState = "VERIFIED_SAFE";
        } else {
          // Missing allergen data OR AI_SUGGESTED is NEVER shown as safe to a restricted diner
          safetyState = "UNVERIFIED_WARNING";
        }
      } else {
        const unlockMod = findVerifiedUnlockModifier({
          dish,
          dishAllergens: normalizedDishAllergens,
          dishDiets: normalizedDishDiets,
          dinerAllergens,
          dinerDiets: hardDiets,
        });

        if (unlockMod) {
          safetyState = "SAFE_WITH_MODIFIER";
          preselectedModifiers = [unlockMod];
          effectivePriceFils = Math.max(0, basePriceFils + aedToFils(unlockMod.priceDeltaAed));
        } else {
          const effectivePriceAed = filsToAedString(effectivePriceFils);
          hidden.push({
            dish,
            safetyState: "HIDDEN",
            badges: [],
            preselectedModifierIds: [],
            preselectedModifiers: [],
            basePriceFils,
            effectivePriceFils,
            effectivePriceAed,
            withinRemainingBudget:
              remainingBudgetFils === null || effectivePriceFils <= remainingBudgetFils,
            score: -1000,
            hiddenReasonsEn: baseConflicts.reasonsEn,
            hiddenReasonsAr: baseConflicts.reasonsAr,
            whyForYouEn: "",
            whyForYouAr: "",
          });
          continue;
        }
      }
    }

    // Soft scoring & remaining meal budget evaluation
    const withinRemainingBudget =
      remainingBudgetFils === null || effectivePriceFils <= remainingBudgetFils;

    let score = 50;
    const reasonsEn: string[] = [];
    const reasonsAr: string[] = [];

    if (safetyState === "VERIFIED_SAFE") {
      score += 10;
    } else if (safetyState === "SAFE_WITH_MODIFIER") {
      score += 8;
      reasonsEn.push(`Safe with "${preselectedModifiers[0]!.nameEn}"`);
      reasonsAr.push(`آمن مع «${preselectedModifiers[0]!.nameAr}»`);
    } else if (safetyState === "UNVERIFIED_WARNING") {
      score -= 25;
    }

    const searchableText = [dish.nameEn, dish.descriptionEn ?? "", ...(dish.ingredientsEn ?? [])]
      .join(" ")
      .toLowerCase();

    const matchedLikes: string[] = [];
    for (const liked of likedLower) {
      if (searchableText.includes(liked)) {
        score += 15;
        matchedLikes.push(liked);
      }
    }
    if (matchedLikes.length > 0) {
      reasonsEn.push(`Matches your taste (${matchedLikes.slice(0, 2).join(", ")})`);
      reasonsAr.push("يناسب مكوناتك المفضلة");
    }

    for (const disliked of dislikedLower) {
      if (searchableText.includes(disliked)) {
        score -= 20;
      }
    }

    const spiceDiff = Math.abs(SPICE_RANK[dish.spiceLevel] - SPICE_RANK[dinerSpice]);
    if (spiceDiff === 0) {
      score += 10;
    } else if (SPICE_RANK[dish.spiceLevel] > SPICE_RANK[dinerSpice] + 1) {
      score -= 10;
    }

    if (profile.preferHighProtein && normalizedDishDiets.includes("high_protein")) {
      score += 12;
      reasonsEn.push("High protein");
      reasonsAr.push("عالي البروتين");
    }
    if (profile.preferKeto && normalizedDishDiets.includes("keto")) {
      score += 12;
      reasonsEn.push("Keto-friendly");
      reasonsAr.push("مناسب للكيتو");
    }

    if (dish.isPopular) {
      score += 10;
    }

    const pastRating = profile.pastRatingsByDishId?.[dish.id];
    if (pastRating !== undefined) {
      if (pastRating >= 4) {
        score += 15;
        reasonsEn.push("You rated this highly");
        reasonsAr.push("نال إعجابك سابقاً");
      } else if (pastRating <= 2) {
        score -= 20;
      }
    }

    if (remainingBudgetFils !== null) {
      if (withinRemainingBudget) {
        score += 30;
        // Extra value bonus for affordable picks leaving comfortable headroom
        const savingsRatioPts = Math.min(
          15,
          Math.trunc(
            ((remainingBudgetFils - effectivePriceFils) * 15) / Math.max(100, remainingBudgetFils),
          ),
        );
        score += savingsRatioPts;
        reasonsEn.push(`Fits your ${formatAed(remainingBudgetFils, "en")} remaining meal budget`);
        reasonsAr.push(`ضمن ميزانيتك المتبقية (${formatAed(remainingBudgetFils, "ar")})`);
      } else {
        score -= 35;
      }
    }

    const badges: MenuBadge[] = [];
    // Safety badges ONLY appear when the diner has hard restrictions
    if (hasHardRestrictions) {
      if (safetyState === "VERIFIED_SAFE") badges.push("VERIFIED_SAFE");
      if (safetyState === "SAFE_WITH_MODIFIER") badges.push("SAFE_WITH_MODIFIER");
      if (safetyState === "UNVERIFIED_WARNING") badges.push("UNVERIFIED_WARNING");
    }
    if (dish.isPopular) badges.push("POPULAR");
    if (dish.spiceLevel === "MEDIUM" || dish.spiceLevel === "HOT") badges.push("SPICY");

    const defaultWhyEn =
      dish.cachedBlurbEn?.trim() ||
      (reasonsEn.length > 0
        ? reasonsEn.slice(0, 2).join(" • ")
        : dish.isPopular
          ? "House favorite on this menu"
          : "Great match for your table");
    const defaultWhyAr =
      dish.cachedBlurbAr?.trim() ||
      (reasonsAr.length > 0
        ? reasonsAr.slice(0, 2).join(" • ")
        : dish.isPopular
          ? "من الأطباق الأكثر طلباً في المطعم"
          : "خيار مميز يناسب ذوقك");

    visibleEvaluated.push({
      dish,
      safetyState,
      badges,
      preselectedModifierIds: preselectedModifiers.map((m) => m.id),
      preselectedModifiers,
      basePriceFils,
      effectivePriceFils,
      effectivePriceAed: filsToAedString(effectivePriceFils),
      withinRemainingBudget,
      score,
      hiddenReasonsEn: [],
      hiddenReasonsAr: [],
      whyForYouEn: defaultWhyEn,
      whyForYouAr: defaultWhyAr,
    });
  }

  // Assign "BEST_VALUE" badge to the most affordable within-budget dishes
  const withinBudgetList = visibleEvaluated.filter((item) => item.withinRemainingBudget);
  if (withinBudgetList.length > 0) {
    const sortedPrices = withinBudgetList.map((i) => i.effectivePriceFils).sort((a, b) => a - b);
    const valueCutoffIndex = Math.max(0, Math.floor(sortedPrices.length * 0.35) - 1);
    const cutoffPriceFils = Math.max(2400, sortedPrices[valueCutoffIndex] ?? 2400);

    for (const item of withinBudgetList) {
      if (
        item.effectivePriceFils <= cutoffPriceFils &&
        (remainingBudgetFils === null || item.effectivePriceFils <= remainingBudgetFils)
      ) {
        item.badges.push("BEST_VALUE");
      }
    }
  }

  // Sort deterministically by score DESC, then effectivePriceFils ASC, then nameEn ASC
  visibleEvaluated.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.effectivePriceFils !== b.effectivePriceFils) {
      return a.effectivePriceFils - b.effectivePriceFils;
    }
    return a.dish.nameEn.localeCompare(b.dish.nameEn);
  });

  const inBudgetRanked = visibleEvaluated.filter((i) => i.withinRemainingBudget);
  const overBudgetRanked = visibleEvaluated.filter((i) => !i.withinRemainingBudget);

  // Top Picks ("Perfect for you"): top-scoring non-unverified within-budget items (up to 8)
  const perfectForYou: EvaluatedMenuItem[] = [];
  const goodOptions: EvaluatedMenuItem[] = [];

  for (const item of inBudgetRanked) {
    if (perfectForYou.length < 8 && item.safetyState !== "UNVERIFIED_WARNING" && item.score >= 60) {
      perfectForYou.push(item);
    } else {
      goodOptions.push(item);
    }
  }

  // Fallback if a diner has neutral preferences and nothing crossed 60 pts
  if (perfectForYou.length === 0 && goodOptions.length > 0) {
    const promoteCount = Math.min(5, goodOptions.length);
    for (let i = 0; i < promoteCount; i++) {
      if (goodOptions[0] && goodOptions[0].safetyState !== "UNVERIFIED_WARNING") {
        perfectForYou.push(goodOptions.shift()!);
      }
    }
  }

  return {
    hasHardRestrictions,
    maxBudgetFils,
    cartTotalFils: Math.max(0, currentCartTotalFils),
    remainingBudgetFils,
    perfectForYou,
    goodOptions,
    moreOptions: overBudgetRanked,
    hidden,
  };
}

export interface GroupSharedDish {
  dish: EngineDishInput;
  effectivePriceFils: number;
  effectivePriceAed: string;
  requiredModifiers: EngineModifierInput[];
  hasUnverifiedWarning: boolean;
  combinedScore: number;
}

/**
 * Deterministic Group Table Intersection:
 * Finds all dishes that EVERY participant at the table can eat (none hidden),
 * verifying that any required modifiers are mutually compatible across all members.
 */
export function evaluateGroupSharedDishes(params: {
  dishes: readonly EngineDishInput[];
  participants: ReadonlyArray<{
    id: string;
    name: string;
    profile: EngineDinerProfile;
    cartTotalFils?: number;
  }>;
}): {
  sharedDishes: GroupSharedDish[];
  perPersonMenus: Record<string, PersonalizedMenuResult>;
} {
  const { dishes, participants } = params;
  const perPersonMenus: Record<string, PersonalizedMenuResult> = {};

  for (const p of participants) {
    perPersonMenus[p.id] = evaluatePersonalizedMenu({
      dishes,
      profile: p.profile,
      currentCartTotalFils: p.cartTotalFils ?? 0,
    });
  }

  if (participants.length === 0) {
    return { sharedDishes: [], perPersonMenus };
  }

  // Index visible evaluated items per person by dishId
  const visibleMapByPerson = participants.map((p) => {
    const res = perPersonMenus[p.id]!;
    const map = new Map<string, EvaluatedMenuItem>();
    for (const item of [...res.perfectForYou, ...res.goodOptions, ...res.moreOptions]) {
      map.set(item.dish.id, item);
    }
    return map;
  });

  const sharedDishes: GroupSharedDish[] = [];

  for (const dish of dishes) {
    if (!dish.isPublished || !dish.isAvailable) continue;

    const memberEvaluations: EvaluatedMenuItem[] = [];
    let compatibleForAll = true;

    for (const memberMap of visibleMapByPerson) {
      const ev = memberMap.get(dish.id);
      if (!ev) {
        compatibleForAll = false;
        break;
      }
      memberEvaluations.push(ev);
    }

    if (!compatibleForAll) continue;

    // Collect union of preselected safety modifiers required by any restricted member
    const modById = new Map<string, EngineModifierInput>();
    for (const ev of memberEvaluations) {
      for (const m of ev.preselectedModifiers) {
        modById.set(m.id, m);
      }
    }
    const requiredModifiers = Array.from(modById.values());

    // If multiple distinct modifiers were required, verify the combined state still satisfies all members
    if (requiredModifiers.length > 0) {
      const removedAll = new Set(
        requiredModifiers.flatMap((m) => normalizeAllergenList(m.removesAllergens)),
      );
      const addedDietsAll = requiredModifiers.flatMap((m) => normalizeDietTagList(m.addsDietTags));
      const baseAllergens = Array.isArray(dish.allergens)
        ? normalizeAllergenList(dish.allergens)
        : [];
      const postAllergens = baseAllergens.filter((a) => !removedAll.has(a));
      const postDiets = Array.from(
        new Set([...normalizeDietTagList(dish.dietTags), ...addedDietsAll]),
      );

      let postValidForAll = true;
      for (const p of participants) {
        const dAllergens = expandDinerAllergens(p.profile.allergens);
        const dDiets = normalizeDietTagList(p.profile.dietaryRestrictions).filter(
          (d) => d === "vegetarian" || d === "vegan" || d === "pescatarian" || d === "halal",
        );
        if (dAllergens.size === 0 && dDiets.length === 0) continue;

        const c = evaluateConflictsAgainstState({
          dinerAllergens: dAllergens,
          dinerDiets: dDiets,
          dishAllergens: postAllergens,
          dishDiets: postDiets,
          meatType: dish.meatType,
        });
        if (c.conflictingAllergens.length > 0 || c.conflictingDiets.length > 0) {
          postValidForAll = false;
          break;
        }
      }
      if (!postValidForAll) continue;
    }

    const basePriceFils = aedToFils(dish.priceAed);
    const modDeltaFils = requiredModifiers.reduce((sum, m) => sum + aedToFils(m.priceDeltaAed), 0);
    const effectivePriceFils = Math.max(0, basePriceFils + modDeltaFils);

    const hasUnverifiedWarning = memberEvaluations.some(
      (ev) => ev.safetyState === "UNVERIFIED_WARNING",
    );
    const avgScore = Math.round(
      memberEvaluations.reduce((sum, ev) => sum + ev.score, 0) / memberEvaluations.length,
    );

    sharedDishes.push({
      dish,
      effectivePriceFils,
      effectivePriceAed: filsToAedString(effectivePriceFils),
      requiredModifiers,
      hasUnverifiedWarning,
      combinedScore: avgScore,
    });
  }

  sharedDishes.sort((a, b) => {
    if (a.hasUnverifiedWarning !== b.hasUnverifiedWarning) {
      return a.hasUnverifiedWarning ? 1 : -1;
    }
    if (b.combinedScore !== a.combinedScore) return b.combinedScore - a.combinedScore;
    return a.effectivePriceFils - b.effectivePriceFils;
  });

  return { sharedDishes, perPersonMenus };
}
