import { z } from "zod";

export interface CustomAvoidIngredient {
  key: string;
  labelEn: string;
  labelAr: string;
  terms: string[];
}

export const customAvoidIngredientSchema = z.object({
  key: z.string().trim().min(1).max(60),
  labelEn: z.string().trim().min(1).max(80),
  labelAr: z.string().trim().min(1).max(80),
  terms: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
});

interface SynonymEntry {
  key: string;
  labelEn: string;
  labelAr: string;
  terms: readonly string[];
  excludePhrases?: readonly string[];
}

export const INGREDIENT_SYNONYM_GROUPS: readonly SynonymEntry[] = [
  {
    key: "tomato",
    labelEn: "tomato",
    labelAr: "طماطم",
    terms: [
      "tomato",
      "tomatoes",
      "cherry tomato",
      "cherry tomatoes",
      "tomato sauce",
      "sun-dried tomato",
      "طماطم",
      "بندورة",
      "صلصة طماطم",
    ],
  },
  {
    key: "pickles",
    labelEn: "pickles",
    labelAr: "مخلل",
    terms: [
      "pickle",
      "pickles",
      "pickled cucumber",
      "pickled turnip",
      "pickled turnips",
      "kabis",
      "مخلل",
      "مخللات",
      "كبيس",
      "مخلل خيار",
      "مخلل لفت",
    ],
  },
  {
    key: "garlic",
    labelEn: "garlic",
    labelAr: "ثوم",
    terms: [
      "garlic",
      "toum",
      "garlic toum",
      "garlic sauce",
      "ثوم",
      "توم",
      "صلصة الثوم",
      "كريم ثوم",
    ],
  },
  {
    key: "onion",
    labelEn: "onion",
    labelAr: "بصل",
    terms: [
      "onion",
      "onions",
      "raw onion",
      "red onion",
      "spring onion",
      "scallion",
      "بصل",
      "بصل أحمر",
      "بصل أخضر",
    ],
  },
  {
    key: "parsley",
    labelEn: "parsley",
    labelAr: "بقدونس",
    terms: ["parsley", "flat-leaf parsley", "green herb in tabbouleh", "بقدونس"],
  },
  {
    key: "coriander",
    labelEn: "coriander",
    labelAr: "كزبرة",
    terms: ["coriander", "cilantro", "fresh coriander", "كزبرة", "كزبرة خضراء"],
  },
  {
    key: "mint",
    labelEn: "mint",
    labelAr: "نعناع",
    terms: ["mint", "fresh mint", "dried mint", "نعناع", "نعنع"],
  },
  {
    key: "olives",
    labelEn: "olives",
    labelAr: "زيتون",
    terms: ["olive", "olives", "black olives", "green olives", "kalamata", "زيتون"],
    excludePhrases: ["olive oil", "extra virgin olive oil", "زيت زيتون"],
  },
  {
    key: "pork",
    labelEn: "pork",
    labelAr: "لحم خنزير",
    terms: [
      "pork",
      "bacon",
      "ham",
      "lard",
      "prosciutto",
      "pepperoni",
      "خنزير",
      "لحم خنزير",
      "بيكون",
    ],
  },
  {
    key: "msg",
    labelEn: "MSG",
    labelAr: "غلوتامات أحادية الصوديوم (MSG)",
    terms: ["msg", "monosodium glutamate", "أجينوموتو", "غلوتامات أحادية الصوديوم"],
  },
  {
    key: "mushroom",
    labelEn: "mushrooms",
    labelAr: "فطر",
    terms: ["mushroom", "mushrooms", "فطر", "مشروم"],
  },
  {
    key: "eggplant",
    labelEn: "eggplant",
    labelAr: "باذنجان",
    terms: ["eggplant", "eggplants", "aubergine", "باذنجان"],
  },
  {
    key: "pomegranate",
    labelEn: "pomegranate",
    labelAr: "رمان",
    terms: ["pomegranate", "pomegranate seeds", "pomegranate molasses", "رمان", "دبس رمان"],
  },
  {
    key: "cucumber",
    labelEn: "cucumber",
    labelAr: "خيار",
    terms: ["cucumber", "cucumbers", "خيار"],
    excludePhrases: ["pickled cucumber", "مخلل خيار"],
  },
  {
    key: "chili",
    labelEn: "chili",
    labelAr: "فلفل حار",
    terms: ["chili", "chilli", "jalapeno", "harissa", "shatta", "فلفل حار", "شطة"],
  },
];

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Resolves canonical EN/AR labels and full bilingual synonym set for an ingredient string or object.
 */
export function resolveIngredientSynonyms(raw: string | CustomAvoidIngredient): {
  key: string;
  labelEn: string;
  labelAr: string;
  terms: string[];
  excludePhrases: readonly string[];
} {
  const inputTerms =
    typeof raw === "string"
      ? [raw.trim().toLowerCase()]
      : [
          raw.key.trim().toLowerCase(),
          raw.labelEn.trim().toLowerCase(),
          raw.labelAr.trim().toLowerCase(),
          ...raw.terms.map((t) => t.trim().toLowerCase()),
        ].filter(Boolean);

  for (const group of INGREDIENT_SYNONYM_GROUPS) {
    const groupSet = new Set(group.terms.map((t) => t.toLowerCase()));
    groupSet.add(group.key);
    if (inputTerms.some((t) => groupSet.has(t))) {
      const mergedTerms = Array.from(new Set([...group.terms, ...inputTerms]));
      return {
        key: group.key,
        labelEn: typeof raw === "object" && raw.labelEn ? raw.labelEn : group.labelEn,
        labelAr: typeof raw === "object" && raw.labelAr ? raw.labelAr : group.labelAr,
        terms: mergedTerms,
        excludePhrases: group.excludePhrases ?? [],
      };
    }
  }

  const base = (typeof raw === "string" ? raw : raw.labelEn || raw.key).trim().toLowerCase();
  const autoPlural =
    /^[a-z]+$/.test(base) && !base.endsWith("s")
      ? base.endsWith("o")
        ? [base, `${base}es`, `${base}s`]
        : [base, `${base}s`]
      : base.endsWith("es") && base.length > 4
        ? [base, base.slice(0, -2), base.slice(0, -1)]
        : base.endsWith("s") && base.length > 3
          ? [base, base.slice(0, -1)]
          : [base];

  const terms = Array.from(new Set([...autoPlural, ...inputTerms])).filter(Boolean);
  return {
    key: typeof raw === "object" ? raw.key.trim().toLowerCase() : base,
    labelEn: typeof raw === "object" && raw.labelEn ? raw.labelEn : base,
    labelAr: typeof raw === "object" && raw.labelAr ? raw.labelAr : base,
    terms,
    excludePhrases: [],
  };
}

export function buildCustomAvoidIngredient(
  rawTerm: string,
  extra?: { labelEn?: string; labelAr?: string; terms?: readonly string[] },
): CustomAvoidIngredient {
  const resolved = resolveIngredientSynonyms({
    key: rawTerm.trim().toLowerCase(),
    labelEn: extra?.labelEn ?? rawTerm.trim(),
    labelAr: extra?.labelAr ?? rawTerm.trim(),
    terms: [rawTerm.trim(), ...(extra?.terms ?? [])],
  });
  return {
    key: resolved.key,
    labelEn: resolved.labelEn,
    labelAr: resolved.labelAr,
    terms: resolved.terms,
  };
}

export function parseCustomAvoidIngredientsJson(raw: unknown): CustomAvoidIngredient[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomAvoidIngredient[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    if (typeof item === "string" && item.trim()) {
      const built = buildCustomAvoidIngredient(item);
      if (!seen.has(built.key)) {
        seen.add(built.key);
        out.push(built);
      }
      continue;
    }
    const parsed = customAvoidIngredientSchema.safeParse(item);
    if (parsed.success) {
      const built = buildCustomAvoidIngredient(parsed.data.key, {
        labelEn: parsed.data.labelEn,
        labelAr: parsed.data.labelAr,
        terms: parsed.data.terms,
      });
      if (!seen.has(built.key)) {
        seen.add(built.key);
        out.push(built);
      }
    }
  }
  return out;
}

/**
 * Checks whether a text fragment (ingredient string, dish title, or description)
 * contains any of `terms` on clean token/word boundaries while respecting `excludePhrases`
 * (e.g. "olive oil" does NOT trigger "olives").
 */
export function textContainsIngredientSynonyms(
  rawText: string,
  terms: readonly string[],
  excludePhrases: readonly string[] = [],
): boolean {
  let cleaned = rawText.toLowerCase();
  if (!cleaned.trim()) return false;

  for (const excl of excludePhrases) {
    cleaned = cleaned.split(excl.toLowerCase()).join(" ");
  }

  for (const term of terms) {
    const t = term.trim().toLowerCase();
    if (!t) continue;

    if (/^[a-z0-9\s-]+$/.test(t)) {
      const re = new RegExp(`(^|[^a-z0-9])${escapeRegex(t)}($|[^a-z0-9])`, "i");
      if (re.test(cleaned)) return true;
    } else {
      // Arabic / non-Latin script token check (allowing common Arabic prefixes ال / و / ب)
      const re = new RegExp(
        `(^|[\\s،,.()\\-/]|ال|وال|بال)${escapeRegex(t)}($|[\\s،,.()\\-/])`,
        "i",
      );
      if (re.test(cleaned) || cleaned.trim() === t) return true;
    }
  }

  return false;
}

/**
 * Deterministic fallback interpreter when GEMINI_API_KEY is unset so free-text
 * inputs ("tomato allergy", "that green herb in tabbouleh", "no pork", "pickles")
 * still produce a structured confirmation preview.
 */
export function parseFreeTextProfileFallback(params: {
  otherDietText?: string;
  otherAllergyText?: string;
  freePreferencesText?: string;
}): {
  dietaryRestrictions: string[];
  allergens: string[];
  customAvoidIngredients: CustomAvoidIngredient[];
  likedIngredients: string[];
  dislikedIngredients: string[];
} {
  const dietaryRestrictions = new Set<string>();
  const allergens = new Set<string>();
  const customAvoidMap = new Map<string, CustomAvoidIngredient>();
  const liked = new Set<string>();
  const disliked = new Set<string>();

  const dietRaw = (params.otherDietText ?? "").toLowerCase();
  if (/\b(no\s+pork|pork[-\s]?free|بدون\s*خنزير)\b/i.test(dietRaw))
    dietaryRestrictions.add("no_pork");
  if (/\b(no\s+beef|beef[-\s]?free|بدون\s*بقر)\b/i.test(dietRaw))
    dietaryRestrictions.add("no_beef");
  if (/\b(no\s+red\s+meat|بدون\s*لحوم\s*حمراء)\b/i.test(dietRaw))
    dietaryRestrictions.add("no_red_meat");
  if (/\b(diabetic|low[-\s]?sugar|سكري|قليل\s*السكر)\b/i.test(dietRaw))
    dietaryRestrictions.add("low_sugar");
  if (/\b(keto|low[-\s]?carb|كيتو)\b/i.test(dietRaw)) dietaryRestrictions.add("keto");
  if (/\b(gluten[-\s]?free|بدون\s*غلوتين)\b/i.test(dietRaw))
    dietaryRestrictions.add("gluten_free_lifestyle");

  const allergyChunks = (params.otherAllergyText ?? "")
    .split(/[,،;\n]+|\band\b/i)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const chunk of allergyChunks) {
    const cleaned = chunk
      .replace(
        /\b(i\s+react\s+to|allergic\s+to|allergy|intolerant\s+to|intolerance|avoid|no|حساسية\s*من|حساسية)\b/gi,
        "",
      )
      .trim();
    if (!cleaned) continue;
    const low = cleaned.toLowerCase();
    if (low === "milk" || low === "dairy" || low === "lactose") allergens.add("milk");
    else if (low === "gluten" || low === "wheat") allergens.add("gluten");
    else if (low === "sesame" || low === "tahini") allergens.add("sesame");
    else if (low === "peanuts" || low === "peanut") allergens.add("peanuts");
    else if (low === "nuts" || low === "tree nuts") allergens.add("tree_nuts");
    else {
      const built = buildCustomAvoidIngredient(cleaned);
      customAvoidMap.set(built.key, built);
    }
  }

  const prefRaw = params.freePreferencesText ?? "";
  if (/green\s+herb\s+in\s+tabbouleh/i.test(prefRaw)) {
    if (/\b(don'?t\s+like|hate|dislike|no|without)\b/i.test(prefRaw)) {
      disliked.add("parsley");
    } else {
      liked.add("parsley");
    }
  }

  const clauses = prefRaw
    .split(/[,،.;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const clause of clauses) {
    if (/green\s+herb\s+in\s+tabbouleh/i.test(clause)) continue;
    const dislikeMatch =
      /\b(?:i\s+don'?t\s+like|dislike|hate|no|without|avoid)\s+([a-z\s]{2,30})/i.exec(clause);
    if (dislikeMatch?.[1]) {
      const resolved = resolveIngredientSynonyms(dislikeMatch[1].trim());
      disliked.add(resolved.labelEn);
      continue;
    }
    const likeMatch = /\b(?:i\s+love|i\s+like|love|like)\s+([a-z\s]{2,30})/i.exec(clause);
    if (likeMatch?.[1]) {
      const resolved = resolveIngredientSynonyms(likeMatch[1].trim());
      liked.add(resolved.labelEn);
    }
  }

  return {
    dietaryRestrictions: Array.from(dietaryRestrictions),
    allergens: Array.from(allergens),
    customAvoidIngredients: Array.from(customAvoidMap.values()),
    likedIngredients: Array.from(liked),
    dislikedIngredients: Array.from(disliked),
  };
}
