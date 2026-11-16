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
    key: "truffle",
    labelEn: "truffle",
    labelAr: "كمأة",
    terms: [
      "truffle",
      "truffles",
      "truffle oil",
      "black truffle",
      "white truffle",
      "كمأة",
      "ترفل",
      "فقع",
      "زيت الكمأة",
      "زيت ترفل",
    ],
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
 * Deterministic interpreter used whenever AI is unconfigured, over quota, or unavailable
 * so free-text inputs ("no pickles no truffle", "without X", "I don't eat X", "tomato allergy",
 * "that green herb in tabbouleh", "no pork") always produce an accurate structured confirmation preview.
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
  maxBudgetAed?: string | null;
} {
  const dietaryRestrictions = new Set<string>();
  const allergens = new Set<string>();
  const customAvoidMap = new Map<string, CustomAvoidIngredient>();
  const liked = new Set<string>();
  const disliked = new Set<string>();
  let maxBudgetAed: string | null | undefined = undefined;

  function applyCanonicalAllergyOrCustomAvoid(rawItem: string) {
    const cleaned = rawItem
      .replace(
        /\b(i\s+have\s+a[n]?\s+|i\s+am\s+|i'm\s+|i\s+react\s+to|severe|strict|allergic\s+to|allergy\s+to|allergy|intolerant\s+to|intolerance\s+to|intolerance|celiac|avoid|no)\b/gi,
        "",
      )
      .replace(/(حساسية\s*شديدة\s*من|حساسية\s*من|حساسية|عدم\s*تحمل)/g, "")
      .trim();
    if (!cleaned) return;
    const low = cleaned.toLowerCase();
    if (low === "milk" || low === "dairy" || low === "lactose" || low === "حليب" || low === "ألبان")
      allergens.add("milk");
    else if (low === "gluten" || low === "wheat" || low === "celiac" || low === "غلوتين")
      allergens.add("gluten");
    else if (low === "sesame" || low === "tahini" || low === "سمسم" || low === "طحينة")
      allergens.add("sesame");
    else if (low === "peanuts" || low === "peanut" || low === "فول سوداني")
      allergens.add("peanuts");
    else if (low === "nuts" || low === "tree nuts" || low === "tree nut" || low === "مكسرات")
      allergens.add("tree_nuts");
    else if (low === "egg" || low === "eggs" || low === "بيض") allergens.add("eggs");
    else if (low === "fish" || low === "سمك") allergens.add("fish");
    else if (low === "shellfish" || low === "shrimp" || low === "prawns" || low === "crustaceans")
      allergens.add("crustaceans");
    else if (low === "soy" || low === "soya" || low === "صويا") allergens.add("soy");
    else {
      const built = buildCustomAvoidIngredient(cleaned);
      customAvoidMap.set(built.key, built);
    }
  }

  function extractDietsAndStrip(text: string): string {
    let working = text;
    const dietPatterns: ReadonlyArray<{ re: RegExp; tag: string }> = [
      {
        re: /\b(?:i\s+don'?t\s+eat\s+pork|do\s+not\s+eat\s+pork|no\s+pork|without\s+pork|pork[-\s]?free)\b|بدون\s*(?:لحم\s*)?خنزير|لا\s*آكل\s*(?:لحم\s*)?خنزير/gi,
        tag: "no_pork",
      },
      {
        re: /\b(?:i\s+don'?t\s+eat\s+beef|do\s+not\s+eat\s+beef|no\s+beef|without\s+beef|beef[-\s]?free)\b|بدون\s*(?:لحم\s*)?بقر|لا\s*آكل\s*(?:لحم\s*)?بقر/gi,
        tag: "no_beef",
      },
      {
        re: /\b(?:i\s+don'?t\s+eat\s+red\s+meat|no\s+red\s+meat|without\s+red\s+meat|red\s+meat[-\s]?free)\b|بدون\s*لحوم\s*حمراء/gi,
        tag: "no_red_meat",
      },
      {
        re: /\b(?:diabetic(?:[-\s]?friendly)?|low[-\s]?sugar)\b|سكري|قليل\s*السكر/gi,
        tag: "low_sugar",
      },
      { re: /\b(?:keto|low[-\s]?carb)\b|كيتو/gi, tag: "keto" },
      { re: /\b(?:high[-\s]?protein)\b|عالي\s*البروتين/gi, tag: "high_protein" },
      {
        re: /\b(?:gluten[-\s]?free(?:\s+diet|\s+lifestyle)?)\b|بدون\s*غلوتين/gi,
        tag: "gluten_free_lifestyle",
      },
      { re: /\bvegan\b|نباتي\s*صرف|فيغن/gi, tag: "vegan" },
      { re: /\bvegetarian\b|نباتي/gi, tag: "vegetarian" },
      { re: /\bpescatarian\b/gi, tag: "pescatarian" },
      { re: /\bhalal\b|حلال/gi, tag: "halal" },
    ];

    for (const { re, tag } of dietPatterns) {
      if (re.test(working)) {
        dietaryRestrictions.add(tag);
        working = working.replace(re, " , ");
      }
    }
    return working;
  }

  extractDietsAndStrip(params.otherDietText ?? "");

  const allergyChunks = (params.otherAllergyText ?? "")
    .split(/[,،;\n]+|\band\b/i)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const chunk of allergyChunks) {
    applyCanonicalAllergyOrCustomAvoid(chunk);
  }

  let prefWorking = params.freePreferencesText ?? "";

  // Strip structural label prefixes added when combining multiple profile fields
  prefWorking = prefWorking.replace(
    /\b(?:other\s+diet|hard\s+allergies\/intolerances|likes\s*&\s*dislikes\s+in\s+my\s+own\s+words)\s*:/gi,
    " , ",
  );

  // Optional meal budget in free text (e.g. "budget 45 AED" / "under AED 40")
  const budgetMatch =
    /\b(?:budget|under|max)\s*(?:aed\s*)?(\d{1,4}(?:\.\d{1,2})?)\s*(?:aed)?\b/i.exec(prefWorking);
  if (budgetMatch?.[1]) {
    const num = Number.parseFloat(budgetMatch[1]);
    if (Number.isFinite(num) && num > 0) {
      maxBudgetAed = num.toFixed(2);
    }
    prefWorking = prefWorking.replace(budgetMatch[0], " , ");
  }

  // Handle colloquial "green herb in tabbouleh" -> parsley
  if (/green\s+herb\s+in\s+tabbouleh/i.test(prefWorking)) {
    if (/\b(don'?t\s+(?:like|eat|want)|hate|dislike|no|without)\b/i.test(prefWorking)) {
      disliked.add("parsley");
    } else {
      liked.add("parsley");
    }
    prefWorking = prefWorking.replace(/(?:that\s+)?green\s+herb\s+in\s+tabbouleh/gi, " , ");
  }

  // Extract explicit medical allergy/intolerance statements written directly in chatInput/freePreferencesText
  const initialClauses = prefWorking.split(/[,،.;\n]+/);
  const remainingClauses: string[] = [];
  for (const rawClause of initialClauses) {
    const c = rawClause.trim();
    if (!c) continue;
    if (/\b(allerg(?:y|ic)|intoleran(?:t|ce)|celiac|react\s+to)\b|حساسية|عدم\s*تحمل/i.test(c)) {
      applyCanonicalAllergyOrCustomAvoid(c);
    } else if (/\blactose[-\s]?free\b/i.test(c)) {
      allergens.add("milk");
    } else {
      remainingClauses.push(c);
    }
  }

  // Extract diet phrases ("no pork", "no beef", "vegetarian", etc.) so they never pollute soft dislikes
  const afterDietStrip = extractDietsAndStrip(remainingClauses.join(" , "));

  // Split repeated negation/preference openers even without commas (e.g. "no pickles no truffle" -> ["no pickles", "no truffle"])
  const segments = afterDietStrip
    .replace(
      /\s+(?=(?:i\s+(?:really\s+)?(?:don'?t|do\s+not)\s+(?:like|eat|want)|(?:don'?t|do\s+not)\s+(?:like|eat|want)|dislike|hate|without|no|avoid|i\s+(?:really\s+)?(?:love|like))\b)/gi,
      " | ",
    )
    .replace(/\s+(?=(?:لا\s*أحب|لا\s*آكل|ما\s*بحب|بدون|بلا)\s)/g, " | ")
    .split(/[,،.;|\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  function cleanFoodNoun(rawItem: string): string {
    return rawItem
      .replace(/^(?:any|some|the|extra|too\s+much)\s+/i, "")
      .replace(/\s+(?:please|pls|thanks|thank\s+you|at\s+all|on\s+it|in\s+it|either)$/i, "")
      .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
      .trim();
  }

  function splitNounList(listStr: string): string[] {
    return listStr
      .split(/\b(?:and|or|nor)\b|[&+/]|\s+و(?=\p{Script=Arabic})/iu)
      .map(cleanFoodNoun)
      .filter((s) => s.length >= 2 && s.length <= 40);
  }

  let lastIntent: "dislike" | "like" | null = null;

  for (const seg of segments) {
    const dislikeOpener =
      /^(?:i\s+(?:really\s+)?(?:don'?t|do\s+not)\s+(?:like|eat|want)|(?:don'?t|do\s+not)\s+(?:like|eat|want)|dislike|hate|without|no|avoid)\s+(.+)$/i.exec(
        seg,
      ) ?? /^(?:لا\s*أحب|لا\s*آكل|ما\s*بحب|بدون|بلا)\s+(.+)$/u.exec(seg);

    if (dislikeOpener?.[1]) {
      lastIntent = "dislike";
      for (const item of splitNounList(dislikeOpener[1])) {
        const resolved = resolveIngredientSynonyms(item);
        disliked.add(resolved.labelEn);
      }
      continue;
    }

    const likeOpener =
      /^(?:i\s+(?:really\s+)?(?:love|like|enjoy)|love|like|prefer)\s+(.+)$/i.exec(seg) ??
      /^(?:أحب|أفضل|بحب)\s+(.+)$/u.exec(seg);

    if (likeOpener?.[1]) {
      lastIntent = "like";
      for (const item of splitNounList(likeOpener[1])) {
        const resolved = resolveIngredientSynonyms(item);
        liked.add(resolved.labelEn);
      }
      continue;
    }

    // Continuation after comma, e.g. "I don't eat pickles, mushrooms, or truffle" where "mushrooms" / "or truffle" is the next comma segment
    if (lastIntent) {
      for (const item of splitNounList(seg)) {
        const resolved = resolveIngredientSynonyms(item);
        if (lastIntent === "dislike") disliked.add(resolved.labelEn);
        else liked.add(resolved.labelEn);
      }
    }
  }

  return {
    dietaryRestrictions: Array.from(dietaryRestrictions),
    allergens: Array.from(allergens),
    customAvoidIngredients: Array.from(customAvoidMap.values()),
    likedIngredients: Array.from(liked),
    dislikedIngredients: Array.from(disliked),
    ...(maxBudgetAed !== undefined ? { maxBudgetAed } : {}),
  };
}
