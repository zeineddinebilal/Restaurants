import type { MeatType, SpiceLevel, VerificationStatus } from "@prisma/client";
import {
  type CustomAvoidIngredient,
  parseCustomAvoidIngredientsJson,
  resolveIngredientSynonyms,
  textContainsIngredientSynonyms,
} from "@/lib/menu/ingredient-synonyms";
import {
  HARD_DINER_DIETS,
  type HardDinerDiet,
  normalizeAllergenList,
  normalizeDietTagList,
  normalizeDinerDietRestrictions,
} from "@/lib/menu/taxonomy";
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
  removableIngredients?: readonly string[];
  removableIngredientsVerified?: boolean;
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
  customAvoidIngredients?: ReadonlyArray<CustomAvoidIngredient | string>;
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
  omittedDislikedIngredients: string[];
  autoOrderNotesEn: string[];
  dislikeNoticesEn: string[];
  dislikeNoticesAr: string[];
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

const HARD_DIET_SET = new Set<string>(HARD_DINER_DIETS);
const PORK_TERMS = ["pork", "bacon", "ham", "lard", "prosciutto", "pepperoni", "خنزير", "بيكون"];
const BEEF_TERMS = ["beef", "veal", "steak", "brisket", "بقري", "عجل", "ستيك"];
const LAMB_TERMS = ["lamb", "mutton", "غنم", "ضأن", "خاروف"];

function expandDinerAllergens(raw: readonly string[]): Set<string> {
  const normalized = normalizeAllergenList(raw);
  const expanded = new Set<string>(normalized);
  if (expanded.has("shellfish")) {
    expanded.add("crustaceans");
    expanded.add("molluscs");
  }
  if (expanded.has("crustaceans") || expanded.has("molluscs")) {
    expanded.add("shellfish");
  }
  return expanded;
}

function extractHardDiets(raw: readonly string[]): HardDinerDiet[] {
  return normalizeDinerDietRestrictions(raw).filter((d): d is HardDinerDiet =>
    HARD_DIET_SET.has(d),
  );
}

function buildDishAllText(dish: EngineDishInput): string {
  return [
    dish.nameEn,
    dish.nameAr,
    dish.descriptionEn ?? "",
    dish.descriptionAr ?? "",
    ...(dish.ingredientsEn ?? []),
    ...(dish.ingredientsAr ?? []),
  ].join(" , ");
}

function evaluateConflictsAgainstState(params: {
  dinerAllergens: ReadonlySet<string>;
  dinerDiets: readonly HardDinerDiet[];
  dishAllergens: readonly string[];
  dishDiets: readonly string[];
  meatType: MeatType;
  dishAllText: string;
}): {
  conflictingAllergens: string[];
  conflictingDiets: string[];
  reasonsEn: string[];
  reasonsAr: string[];
} {
  const { dinerAllergens, dinerDiets, dishAllergens, dishDiets, meatType, dishAllText } = params;
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
    } else if (diet === "no_pork") {
      const mentionsPork = textContainsIngredientSynonyms(dishAllText, PORK_TERMS);
      if (mentionsPork || (meatType === "OTHER" && !dishDietSet.has("halal"))) {
        conflictingDiets.push("no_pork");
        reasonsEn.push("May contain pork");
        reasonsAr.push("قد يحتوي على لحم خنزير");
      }
    } else if (diet === "no_beef") {
      if (meatType === "BEEF" || textContainsIngredientSynonyms(dishAllText, BEEF_TERMS)) {
        conflictingDiets.push("no_beef");
        reasonsEn.push("Contains beef");
        reasonsAr.push("يحتوي على لحم بقري");
      }
    } else if (diet === "no_red_meat") {
      if (
        meatType === "BEEF" ||
        meatType === "LAMB" ||
        textContainsIngredientSynonyms(dishAllText, [...BEEF_TERMS, ...LAMB_TERMS])
      ) {
        conflictingDiets.push("no_red_meat");
        reasonsEn.push("Contains red meat");
        reasonsAr.push("يحتوي على لحوم حمراء");
      }
    } else if (diet === "gluten_free_lifestyle") {
      if (dishAllergenSet.has("gluten")) {
        conflictingDiets.push("gluten_free_lifestyle");
        reasonsEn.push("Contains gluten");
        reasonsAr.push("يحتوي على الغلوتين");
      }
    }
  }

  return { conflictingAllergens, conflictingDiets, reasonsEn, reasonsAr };
}

/**
 * Finds a single restaurant-verified, safety-valid modifier that resolves ALL
 * hard allergen & diet conflicts for the diner on `dish`.
 * Note: `customAvoidIngredients` are NEVER unlocked by generic modifiers or `removableIngredients`.
 */
function findVerifiedUnlockModifier(params: {
  dish: EngineDishInput;
  dishAllergens: readonly string[];
  dishDiets: readonly string[];
  dinerAllergens: ReadonlySet<string>;
  dinerDiets: readonly HardDinerDiet[];
  dishAllText: string;
}): EngineModifierInput | null {
  const { dish, dishAllergens, dishDiets, dinerAllergens, dinerDiets, dishAllText } = params;

  if (!dish.allergenDataProvided || dish.verificationStatus !== "RESTAURANT_VERIFIED") {
    return null;
  }

  for (const mod of dish.modifiers) {
    if (mod.verificationStatus !== "RESTAURANT_VERIFIED") {
      continue;
    }

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
    const postAllergens = dishAllergens.filter((a) => !removedSet.has(a));
    const postDiets = Array.from(new Set([...dishDiets, ...validity.normalizedAddsDietTags]));

    const postConflict = evaluateConflictsAgainstState({
      dinerAllergens,
      dinerDiets,
      dishAllergens: postAllergens,
      dishDiets: postDiets,
      meatType: dish.meatType,
      dishAllText,
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

function isCoreDishIngredient(
  dish: EngineDishInput,
  terms: readonly string[],
  excludePhrases: readonly string[],
): boolean {
  // Strip trailing "with ..." / "مع ..." garnish clauses from title before checking core identity
  const coreTitleEn = dish.nameEn.split(/\bwith\b/i)[0] ?? dish.nameEn;
  const coreTitleAr = dish.nameAr.split(/\sمع\s/)[0] ?? dish.nameAr;

  if (
    textContainsIngredientSynonyms(coreTitleEn, terms, excludePhrases) ||
    textContainsIngredientSynonyms(coreTitleAr, terms, excludePhrases)
  ) {
    return true;
  }

  const ingEn = dish.ingredientsEn ?? [];
  if (ingEn.length === 1 && textContainsIngredientSynonyms(ingEn[0]!, terms, excludePhrases)) {
    return true;
  }

  return false;
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
 * Step 1: Hard deterministic filter:
 *         - Canonical allergens + strict diets + verified modifier unlock
 *         - Custom hard avoidances (`customAvoidIngredients`) across EN/AR ingredients + synonyms
 *           (missing ingredient list => `UNVERIFIED_WARNING`, never safe; never unlocked by `removableIngredients`)
 * Step 2: Soft dislikes (`dislikedIngredients` + `removableIngredients`):
 *         - Confirmed removable non-core ingredient => normal rank (0 penalty), "Comes with X — we'll ask for it without", auto "No X" order note
 *         - Unknown removability non-core ingredient => light downrank (-6), "Ask your server if it can be made without X"
 *         - Core ingredient of dish (e.g. Pickle Platter, Tomato Soup) => heavy downrank (-25)
 * Step 3: Meal-level remaining-budget check & soft preference scoring.
 */
export function evaluatePersonalizedMenu(params: {
  dishes: readonly EngineDishInput[];
  profile: EngineDinerProfile;
  currentCartTotalFils?: number;
}): PersonalizedMenuResult {
  const { dishes, profile, currentCartTotalFils = 0 } = params;

  const dinerAllergens = expandDinerAllergens(profile.allergens);
  const allDinerDiets = normalizeDinerDietRestrictions(profile.dietaryRestrictions);
  const hardDiets = extractHardDiets(profile.dietaryRestrictions);
  const customAvoids = parseCustomAvoidIngredientsJson(
    Array.isArray(profile.customAvoidIngredients) ? profile.customAvoidIngredients : [],
  );

  const hasHardRestrictions =
    dinerAllergens.size > 0 || hardDiets.length > 0 || customAvoids.length > 0;

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

  const likedResolved = (profile.likedIngredients ?? [])
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => resolveIngredientSynonyms(s));
  const dislikedResolved = (profile.dislikedIngredients ?? [])
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => resolveIngredientSynonyms(s));

  const preferLowSugar = allDinerDiets.includes("low_sugar");
  const preferKeto = Boolean(profile.preferKeto || allDinerDiets.includes("keto"));
  const preferHighProtein = Boolean(
    profile.preferHighProtein || allDinerDiets.includes("high_protein"),
  );
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
    const hasIngredientData =
      (dish.ingredientsEn?.length ?? 0) > 0 || (dish.ingredientsAr?.length ?? 0) > 0;
    const normalizedDishAllergens = hasAllergenArray ? normalizeAllergenList(dish.allergens!) : [];
    const normalizedDishDiets = normalizeDietTagList(dish.dietTags);
    const dishAllText = buildDishAllText(dish);

    let safetyState: DishSafetyState = "NO_RESTRICTIONS";
    let preselectedModifiers: EngineModifierInput[] = [];
    let effectivePriceFils = basePriceFils;

    if (hasHardRestrictions) {
      // 1a. Evaluate customAvoidIngredients (strict hard filter across EN/AR + synonyms; never removable!)
      const customConflictEn: string[] = [];
      const customConflictAr: string[] = [];

      for (const custom of customAvoids) {
        const syn = resolveIngredientSynonyms(custom);
        if (textContainsIngredientSynonyms(dishAllText, syn.terms, syn.excludePhrases)) {
          customConflictEn.push(`Contains ${syn.labelEn}`);
          customConflictAr.push(`يحتوي على ${syn.labelAr}`);
        }
      }

      if (customConflictEn.length > 0) {
        hidden.push({
          dish,
          safetyState: "HIDDEN",
          badges: [],
          preselectedModifierIds: [],
          preselectedModifiers: [],
          omittedDislikedIngredients: [],
          autoOrderNotesEn: [],
          dislikeNoticesEn: [],
          dislikeNoticesAr: [],
          basePriceFils,
          effectivePriceFils,
          effectivePriceAed: filsToAedString(effectivePriceFils),
          withinRemainingBudget:
            remainingBudgetFils === null || effectivePriceFils <= remainingBudgetFils,
          score: -1000,
          hiddenReasonsEn: customConflictEn,
          hiddenReasonsAr: customConflictAr,
          whyForYouEn: "",
          whyForYouAr: "",
        });
        continue;
      }

      // 1b. Evaluate canonical allergens & hard diets
      const baseConflicts = evaluateConflictsAgainstState({
        dinerAllergens,
        dinerDiets: hardDiets,
        dishAllergens: normalizedDishAllergens,
        dishDiets: normalizedDishDiets,
        meatType: dish.meatType,
        dishAllText,
      });

      const hasBaseConflict =
        baseConflicts.conflictingAllergens.length > 0 || baseConflicts.conflictingDiets.length > 0;

      // If diner relies on customAvoidIngredients or meat-ingredient text matching, missing ingredient data = UNVERIFIED_WARNING!
      const missingRequiredCustomIngredientData = customAvoids.length > 0 && !hasIngredientData;

      if (!hasBaseConflict) {
        if (
          !missingAllergenData &&
          !missingRequiredCustomIngredientData &&
          dish.verificationStatus === "RESTAURANT_VERIFIED"
        ) {
          safetyState = "VERIFIED_SAFE";
        } else {
          safetyState = "UNVERIFIED_WARNING";
        }
      } else {
        const unlockMod = findVerifiedUnlockModifier({
          dish,
          dishAllergens: normalizedDishAllergens,
          dishDiets: normalizedDishDiets,
          dinerAllergens,
          dinerDiets: hardDiets,
          dishAllText,
        });

        if (unlockMod) {
          safetyState = missingRequiredCustomIngredientData
            ? "UNVERIFIED_WARNING"
            : "SAFE_WITH_MODIFIER";
          preselectedModifiers = [unlockMod];
          effectivePriceFils = Math.max(0, basePriceFils + aedToFils(unlockMod.priceDeltaAed));
        } else {
          hidden.push({
            dish,
            safetyState: "HIDDEN",
            badges: [],
            preselectedModifierIds: [],
            preselectedModifiers: [],
            omittedDislikedIngredients: [],
            autoOrderNotesEn: [],
            dislikeNoticesEn: [],
            dislikeNoticesAr: [],
            basePriceFils,
            effectivePriceFils,
            effectivePriceAed: filsToAedString(effectivePriceFils),
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

    // Step 2: Soft scoring, dislikes ("without X"), & remaining meal budget evaluation
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

    const matchedLikes: string[] = [];
    for (const liked of likedResolved) {
      if (textContainsIngredientSynonyms(dishAllText, liked.terms, liked.excludePhrases)) {
        score += 15;
        matchedLikes.push(liked.labelEn);
      }
    }
    if (matchedLikes.length > 0) {
      reasonsEn.push(`Matches your taste (${matchedLikes.slice(0, 2).join(", ")})`);
      reasonsAr.push("يناسب مكوناتك المفضلة");
    }

    // Soft dislikes: never hide; convert confirmed removable garnishes to "without X" with 0 score penalty!
    const omittedDislikedIngredients: string[] = [];
    const autoOrderNotesEn: string[] = [];
    const dislikeNoticesEn: string[] = [];
    const dislikeNoticesAr: string[] = [];
    const removableText = (dish.removableIngredients ?? []).join(" , ");

    for (const disliked of dislikedResolved) {
      if (!textContainsIngredientSynonyms(dishAllText, disliked.terms, disliked.excludePhrases)) {
        continue;
      }

      if (isCoreDishIngredient(dish, disliked.terms, disliked.excludePhrases)) {
        // Core of the dish (e.g. "Pickle Platter", "Tomato Soup") -> downrank significantly
        score -= 25;
      } else if (
        dish.removableIngredientsVerified === true &&
        textContainsIngredientSynonyms(removableText, disliked.terms, disliked.excludePhrases)
      ) {
        // Confirmed removable garnish -> rank normally (0 penalty!) and auto-add "No X"
        omittedDislikedIngredients.push(disliked.labelEn);
        autoOrderNotesEn.push(`No ${disliked.labelEn}`);
        dislikeNoticesEn.push(`Comes with ${disliked.labelEn} — we'll ask for it without`);
        dislikeNoticesAr.push(`يُقدم مع ${disliked.labelAr} — سنطلبه بدونه`);
      } else {
        // Removability unknown -> light downrank only (-6) + server prompt
        score -= 6;
        dislikeNoticesEn.push(`Ask your server if it can be made without ${disliked.labelEn}`);
        dislikeNoticesAr.push(`اسأل النادل إن كان بالإمكان تحضيره بدون ${disliked.labelAr}`);
      }
    }

    const spiceDiff = Math.abs(SPICE_RANK[dish.spiceLevel] - SPICE_RANK[dinerSpice]);
    if (spiceDiff === 0) {
      score += 10;
    } else if (SPICE_RANK[dish.spiceLevel] > SPICE_RANK[dinerSpice] + 1) {
      score -= 10;
    }

    if (preferHighProtein && normalizedDishDiets.includes("high_protein")) {
      score += 12;
      reasonsEn.push("High protein");
      reasonsAr.push("عالي البروتين");
    }
    if (preferKeto && normalizedDishDiets.includes("keto")) {
      score += 12;
      reasonsEn.push("Keto-friendly");
      reasonsAr.push("مناسب للكيتو");
    }
    if (preferLowSugar) {
      const mentionsSugar = textContainsIngredientSynonyms(dishAllText, [
        "sugar",
        "syrup",
        "rose syrup",
        "date syrup",
        "molasses",
        "سكر",
        "قطر",
      ]);
      if (
        normalizedDishDiets.includes("low_sugar") ||
        (!mentionsSugar && normalizedDishDiets.includes("keto"))
      ) {
        score += 12;
        reasonsEn.push("Low-sugar friendly");
        reasonsAr.push("مناسب لقليلي السكر");
      } else if (mentionsSugar) {
        score -= 18;
      }
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
      omittedDislikedIngredients,
      autoOrderNotesEn,
      dislikeNoticesEn,
      dislikeNoticesAr,
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

  visibleEvaluated.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.effectivePriceFils !== b.effectivePriceFils) {
      return a.effectivePriceFils - b.effectivePriceFils;
    }
    return a.dish.nameEn.localeCompare(b.dish.nameEn);
  });

  const inBudgetRanked = visibleEvaluated.filter((i) => i.withinRemainingBudget);
  const overBudgetRanked = visibleEvaluated.filter((i) => !i.withinRemainingBudget);

  const perfectForYou: EvaluatedMenuItem[] = [];
  const goodOptions: EvaluatedMenuItem[] = [];

  for (const item of inBudgetRanked) {
    if (perfectForYou.length < 8 && item.safetyState !== "UNVERIFIED_WARNING" && item.score >= 60) {
      perfectForYou.push(item);
    } else {
      goodOptions.push(item);
    }
  }

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
  autoOrderNotesEn: string[];
  dislikeNoticesEn: string[];
  dislikeNoticesAr: string[];
  hasUnverifiedWarning: boolean;
  combinedScore: number;
}

/**
 * Deterministic Group Table Intersection:
 * Finds all dishes that EVERY participant at the table can eat (none hidden),
 * verifying that any required modifiers are mutually compatible across all members,
 * and merging any "without X" dislike customizations across the group.
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

    const modById = new Map<string, EngineModifierInput>();
    const autoNotesSet = new Set<string>();
    const dislikeEnSet = new Set<string>();
    const dislikeArSet = new Set<string>();

    for (const ev of memberEvaluations) {
      for (const m of ev.preselectedModifiers) modById.set(m.id, m);
      for (const n of ev.autoOrderNotesEn) autoNotesSet.add(n);
      for (const n of ev.dislikeNoticesEn) dislikeEnSet.add(n);
      for (const n of ev.dislikeNoticesAr) dislikeArSet.add(n);
    }
    const requiredModifiers = Array.from(modById.values());

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
      const dishAllText = buildDishAllText(dish);

      let postValidForAll = true;
      for (const p of participants) {
        const dAllergens = expandDinerAllergens(p.profile.allergens);
        const dDiets = extractHardDiets(p.profile.dietaryRestrictions);
        if (dAllergens.size === 0 && dDiets.length === 0) continue;

        const c = evaluateConflictsAgainstState({
          dinerAllergens: dAllergens,
          dinerDiets: dDiets,
          dishAllergens: postAllergens,
          dishDiets: postDiets,
          meatType: dish.meatType,
          dishAllText,
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
      autoOrderNotesEn: Array.from(autoNotesSet),
      dislikeNoticesEn: Array.from(dislikeEnSet),
      dislikeNoticesAr: Array.from(dislikeArSet),
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
