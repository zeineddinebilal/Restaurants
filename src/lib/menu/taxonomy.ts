/**
 * Canonical allergen and diet tag taxonomy used across AI tagging,
 * Restaurant Menu Builder verification, and the Deterministic Menu Engine.
 */

export const CANONICAL_ALLERGENS = [
  "milk",
  "gluten",
  "tree_nuts",
  "peanuts",
  "sesame",
  "eggs",
  "fish",
  "crustaceans",
  "molluscs",
  "shellfish",
  "soy",
  "celery",
  "mustard",
  "lupin",
  "sulphites",
] as const;

export type CanonicalAllergen = (typeof CANONICAL_ALLERGENS)[number];

export const ALLERGEN_LABELS: Record<CanonicalAllergen, { en: string; ar: string }> = {
  milk: { en: "Milk / Dairy (Lactose)", ar: "حليب / ألبان (لاكتوز)" },
  gluten: { en: "Gluten (Wheat/Barley)", ar: "غلوتين (قمح / شعير)" },
  tree_nuts: { en: "Tree Nuts", ar: "مكسرات" },
  peanuts: { en: "Peanuts", ar: "فول سوداني" },
  sesame: { en: "Sesame", ar: "سمسم" },
  eggs: { en: "Eggs", ar: "بيض" },
  fish: { en: "Fish", ar: "سمك" },
  crustaceans: { en: "Crustaceans", ar: "قشريات" },
  molluscs: { en: "Molluscs", ar: "رخويات" },
  shellfish: { en: "Shellfish", ar: "محار / مأكولات بحرية قشرية" },
  soy: { en: "Soy", ar: "صويا" },
  celery: { en: "Celery", ar: "كرفس" },
  mustard: { en: "Mustard", ar: "خردل" },
  lupin: { en: "Lupin", ar: "ترمس" },
  sulphites: { en: "Sulphites", ar: "كبريتيت" },
};

// Dish-level diet tags stored on MenuItem
export const CANONICAL_DIET_TAGS = [
  "vegetarian",
  "vegan",
  "pescatarian",
  "halal",
  "keto",
  "high_protein",
  "low_sugar",
] as const;

export type CanonicalDietTag = (typeof CANONICAL_DIET_TAGS)[number];

export const DIET_TAG_LABELS: Record<CanonicalDietTag, { en: string; ar: string }> = {
  vegetarian: { en: "Vegetarian", ar: "نباتي" },
  vegan: { en: "Vegan", ar: "نباتي صرف (فيغن)" },
  pescatarian: { en: "Pescatarian", ar: "نباتي يتناول السمك" },
  halal: { en: "Halal", ar: "حلال" },
  keto: { en: "Keto / Low-Carb", ar: "كيتو / قليل الكربوهيدرات" },
  high_protein: { en: "High Protein", ar: "عالي البروتين" },
  low_sugar: { en: "Diabetic-Friendly / Low-Sugar", ar: "مناسب للسكري / قليل السكر" },
};

// Diner-level hard & lifestyle diet options (superset of dish tags, including meat exclusions)
export const HARD_DINER_DIETS = [
  "vegetarian",
  "vegan",
  "pescatarian",
  "halal",
  "no_pork",
  "no_beef",
  "no_red_meat",
  "gluten_free_lifestyle",
] as const;

export type HardDinerDiet = (typeof HARD_DINER_DIETS)[number];

export const SOFT_LIFESTYLE_DIETS = ["keto", "high_protein", "low_sugar"] as const;
export type SoftLifestyleDiet = (typeof SOFT_LIFESTYLE_DIETS)[number];

export const ALL_DINER_DIETS = [...HARD_DINER_DIETS, ...SOFT_LIFESTYLE_DIETS] as const;
export type DinerDietOption = (typeof ALL_DINER_DIETS)[number];

export const DINER_DIET_LABELS: Record<DinerDietOption, { en: string; ar: string }> = {
  vegetarian: { en: "Vegetarian", ar: "نباتي" },
  vegan: { en: "Vegan", ar: "نباتي صرف (فيغن)" },
  pescatarian: { en: "Pescatarian", ar: "نباتي يتناول السمك" },
  halal: { en: "Halal", ar: "حلال" },
  no_pork: { en: "No Pork", ar: "بدون لحم خنزير" },
  no_beef: { en: "No Beef", ar: "بدون لحم بقري" },
  no_red_meat: { en: "No Red Meat", ar: "بدون لحوم حمراء" },
  gluten_free_lifestyle: { en: "Gluten-Free Lifestyle", ar: "نظام خالٍ من الغلوتين" },
  keto: { en: "Keto / Low-Carb", ar: "كيتو / قليل الكربوهيدرات" },
  high_protein: { en: "High Protein", ar: "عالي البروتين" },
  low_sugar: { en: "Diabetic-Friendly / Low-Sugar", ar: "مناسب للسكري / قليل السكر" },
};

export const SPICE_LEVELS = ["NONE", "MILD", "MEDIUM", "HOT"] as const;
export const MEAT_TYPES = [
  "NONE",
  "CHICKEN",
  "BEEF",
  "LAMB",
  "FISH",
  "SHELLFISH",
  "OTHER",
] as const;

const ALLERGEN_ALIASES: Record<string, CanonicalAllergen> = {
  dairy: "milk",
  lactose: "milk",
  cheese: "milk",
  yogurt: "milk",
  wheat: "gluten",
  nuts: "tree_nuts",
  tree_nut: "tree_nuts",
  peanut: "peanuts",
  egg: "eggs",
  tahini: "sesame",
  shrimp: "crustaceans",
  prawns: "crustaceans",
  soya: "soy",
  sulfites: "sulphites",
};

const DINER_DIET_ALIASES: Record<string, DinerDietOption> = {
  pork_free: "no_pork",
  without_pork: "no_pork",
  beef_free: "no_beef",
  red_meat_free: "no_red_meat",
  gluten_free: "gluten_free_lifestyle",
  low_carb: "keto",
  diabetic: "low_sugar",
  diabetic_friendly: "low_sugar",
};

export function normalizeAllergenList(raw: readonly string[]): CanonicalAllergen[] {
  const allowed = new Set<string>(CANONICAL_ALLERGENS);
  const result = new Set<CanonicalAllergen>();

  for (const entry of raw) {
    const cleaned = entry
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
    if (allowed.has(cleaned)) {
      result.add(cleaned as CanonicalAllergen);
    } else if (ALLERGEN_ALIASES[cleaned]) {
      result.add(ALLERGEN_ALIASES[cleaned]!);
    }
  }

  return Array.from(result);
}

export function normalizeDietTagList(raw: readonly string[]): CanonicalDietTag[] {
  const allowed = new Set<string>(CANONICAL_DIET_TAGS);
  const result = new Set<CanonicalDietTag>();

  for (const entry of raw) {
    const cleaned = entry
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
    if (allowed.has(cleaned)) {
      result.add(cleaned as CanonicalDietTag);
    }
  }

  return Array.from(result);
}

export function normalizeDinerDietRestrictions(raw: readonly string[]): DinerDietOption[] {
  const allowed = new Set<string>(ALL_DINER_DIETS);
  const result = new Set<DinerDietOption>();

  for (const entry of raw) {
    const cleaned = entry
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
    if (allowed.has(cleaned)) {
      result.add(cleaned as DinerDietOption);
    } else if (DINER_DIET_ALIASES[cleaned]) {
      result.add(DINER_DIET_ALIASES[cleaned]!);
    }
  }

  return Array.from(result);
}
