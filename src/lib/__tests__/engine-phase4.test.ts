import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runTasteProfileAgent } from "@/lib/agents/taste-profile";
import { DEMO_LEBANESE_CATEGORIES } from "@/lib/demo/lebanese-menu-data";
import {
  type EngineDishInput,
  evaluateGroupSharedDishes,
  evaluatePersonalizedMenu,
} from "@/lib/engine/menu-engine";
import { parseQrTableTarget } from "@/lib/qr-parse";

function buildDemoEngineDishes(): EngineDishInput[] {
  let dishCounter = 1;
  let modCounter = 1;

  return DEMO_LEBANESE_CATEGORIES.flatMap((cat, catIdx) =>
    cat.items.map((dish) => ({
      id: `dish_${dishCounter++}`,
      categoryId: `cat_${catIdx + 1}`,
      categoryNameEn: cat.nameEn,
      categoryNameAr: cat.nameAr,
      nameEn: dish.nameEn,
      nameAr: dish.nameAr,
      descriptionEn: dish.descriptionEn,
      descriptionAr: dish.descriptionAr,
      priceAed: dish.priceAed,
      portionSize: dish.portionSize,
      ingredientsEn: dish.ingredientsEn,
      ingredientsAr: dish.ingredientsAr,
      dietTags: dish.dietTags,
      allergens: dish.allergens,
      allergenDataProvided: dish.allergenDataProvided,
      spiceLevel: dish.spiceLevel,
      meatType: dish.meatType,
      verificationStatus: dish.verificationStatus,
      isAvailable: true,
      isPopular: Boolean(dish.isPopular),
      isPublished: true,
      modifiers: (dish.modifiers ?? []).map((m) => ({
        id: `mod_${modCounter++}`,
        nameEn: m.nameEn,
        nameAr: m.nameAr,
        priceDeltaAed: m.priceDeltaAed,
        removesAllergens: m.removesAllergens,
        addsDietTags: m.addsDietTags,
        verificationStatus: m.verificationStatus,
      })),
    })),
  );
}

describe("Phase 4 Personalized Menu Engine — Hard Filter, Modifiers, Meal Budget & Group Mode", () => {
  const demoDishes = buildDemoEngineDishes();

  const claudeProfile = {
    displayName: "Claude",
    dietaryRestrictions: ["vegetarian"],
    allergens: [],
    likedIngredients: ["chickpeas", "eggplant", "pomegranate", "olive oil", "mint"],
    spiceTolerance: "MEDIUM" as const,
    maxBudgetAed: null,
  };

  const bilalProfile = {
    displayName: "Bilal",
    dietaryRestrictions: ["halal"],
    allergens: ["milk"],
    likedIngredients: ["garlic", "charcoal chicken", "sumac", "lemon"],
    spiceTolerance: "HOT" as const,
    maxBudgetAed: null,
  };

  const jamesProfile = {
    displayName: "James",
    dietaryRestrictions: [],
    allergens: [],
    likedIngredients: ["grilled meat", "fries", "hummus"],
    dislikedIngredients: ["olives"],
    spiceTolerance: "MILD" as const,
    maxBudgetAed: "40.00",
  };

  it("Claude (Vegetarian): hides all meat/fish/chicken dishes and marks unverified vegetarian dishes as UNVERIFIED_WARNING", () => {
    const res = evaluatePersonalizedMenu({
      dishes: demoDishes,
      profile: claudeProfile,
    });

    const visible = [...res.perfectForYou, ...res.goodOptions, ...res.moreOptions];
    assert.ok(visible.length > 0);

    // Zero meat/chicken/fish/lamb/beef dishes may appear anywhere in visible sections
    for (const item of visible) {
      assert.equal(
        item.dish.meatType,
        "NONE",
        `Meat dish "${item.dish.nameEn}" leaked into vegetarian Claude's menu`,
      );
      assert.ok(item.dish.dietTags.includes("vegetarian"));
    }

    // Meat & fish dishes are hard-hidden with clear explanation
    const hiddenNames = new Set(res.hidden.map((h) => h.dish.nameEn));
    assert.ok(hiddenNames.has("Shish Tawook Platter"));
    assert.ok(hiddenNames.has("Lamb Kafta Meshwi"));
    assert.ok(hiddenNames.has("Grilled Sea Bream (Samakoussa)"));
    assert.ok(hiddenNames.has("Makanek Sausages"));

    // Verified vegetarian dishes get VERIFIED_SAFE
    const hummus = visible.find((i) => i.dish.nameEn === "Classic Hummus");
    assert.ok(hummus);
    assert.equal(hummus.safetyState, "VERIFIED_SAFE");
    assert.ok(hummus.badges.includes("VERIFIED_SAFE"));

    // Unverified vegetarian dish ("Chef's Daily Claypot Stew", allergenDataProvided = false) gets UNVERIFIED_WARNING, NEVER safe
    const claypot = visible.find((i) => i.dish.nameEn === "Chef's Daily Claypot Stew");
    assert.ok(claypot);
    assert.equal(claypot.safetyState, "UNVERIFIED_WARNING");
    assert.ok(claypot.badges.includes("UNVERIFIED_WARNING"));
    assert.ok(!claypot.badges.includes("VERIFIED_SAFE"));
  });

  it("Bilal (Lactose intolerant): hides dairy dishes unless unlocked by a verified dairy-free modifier (pre-selected)", () => {
    const res = evaluatePersonalizedMenu({
      dishes: demoDishes,
      profile: bilalProfile,
    });

    const visible = [...res.perfectForYou, ...res.goodOptions, ...res.moreOptions];
    const hiddenNames = new Set(res.hidden.map((h) => h.dish.nameEn));

    // Dairy dishes WITHOUT a verified dairy-free modifier MUST be hidden
    assert.ok(hiddenNames.has("Labneh bil Toum"));
    assert.ok(hiddenNames.has("Grilled Halloumi Slices"));
    assert.ok(hiddenNames.has("Cheese Rakakat Rolls"));
    assert.ok(hiddenNames.has("Kafta bil Laban"));
    assert.ok(hiddenNames.has("Warm Cheese Kunafa"));
    assert.ok(hiddenNames.has("Chilled Ayran (Laban)"));
    // Unverified AI_SUGGESTED dairy dishes must ALSO be hidden when they conflict with milk
    assert.ok(hiddenNames.has("Shanklish Salad"));
    assert.ok(hiddenNames.has("Pistachio Baklava Selection"));

    // Dairy dishes WITH a verified dairy-free modifier ARE shown with that modifier pre-selected!
    const tawook = visible.find((i) => i.dish.nameEn === "Shish Tawook Platter");
    assert.ok(tawook);
    assert.equal(tawook.safetyState, "SAFE_WITH_MODIFIER");
    assert.equal(tawook.preselectedModifiers.length, 1);
    assert.ok(tawook.preselectedModifiers[0]!.removesAllergens.includes("milk"));

    const manakish = visible.find((i) => i.dish.nameEn === "Manakish Zaatar & Cheese");
    assert.ok(manakish);
    assert.equal(manakish.safetyState, "SAFE_WITH_MODIFIER");
    // Base AED 18.00 + (-2.00) modifier delta = AED 16.00
    assert.equal(manakish.effectivePriceAed, "16.00");
  });

  it("James (Meal budget AED 40.00, no restrictions): shows ZERO safety badges and dynamically updates against remaining meal budget", () => {
    // 1. Empty cart -> AED 40.00 remaining
    const emptyCartRes = evaluatePersonalizedMenu({
      dishes: demoDishes,
      profile: jamesProfile,
      currentCartTotalFils: 0,
    });

    assert.equal(emptyCartRes.hasHardRestrictions, false);
    assert.equal(emptyCartRes.remainingBudgetFils, 4000);
    assert.equal(emptyCartRes.hidden.length, 0);

    const allVisible = [
      ...emptyCartRes.perfectForYou,
      ...emptyCartRes.goodOptions,
      ...emptyCartRes.moreOptions,
    ];

    // No-restriction diner must NEVER see any safety badge
    for (const item of allVisible) {
      assert.equal(item.safetyState, "NO_RESTRICTIONS");
      assert.ok(!item.badges.includes("VERIFIED_SAFE"));
      assert.ok(!item.badges.includes("SAFE_WITH_MODIFIER"));
      assert.ok(!item.badges.includes("UNVERIFIED_WARNING"));
    }

    // Over-budget dishes (> AED 40.00) are placed in moreOptions, while <= AED 40.00 are in perfectForYou/goodOptions
    const inBudgetNames = new Set(
      [...emptyCartRes.perfectForYou, ...emptyCartRes.goodOptions].map((i) => i.dish.nameEn),
    );
    const overBudgetNames = new Set(emptyCartRes.moreOptions.map((i) => i.dish.nameEn));

    assert.ok(inBudgetNames.has("Kafta Wrap")); // AED 28.00
    assert.ok(inBudgetNames.has("Half Charcoal Chicken (Farrouj Meshwi)")); // AED 38.00
    assert.ok(overBudgetNames.has("Shish Tawook Platter")); // AED 44.00
    assert.ok(overBudgetNames.has("Royal Mixed Grill")); // AED 78.00

    // Best value badge appears on affordable dishes
    assert.ok(
      [...emptyCartRes.perfectForYou, ...emptyCartRes.goodOptions].some((i) =>
        i.badges.includes("BEST_VALUE"),
      ),
    );

    // 2. James adds Kafta Wrap (AED 28.00 = 2800 fils) to his cart -> AED 12.00 remaining!
    const afterCartRes = evaluatePersonalizedMenu({
      dishes: demoDishes,
      profile: jamesProfile,
      currentCartTotalFils: 2800,
    });

    assert.equal(afterCartRes.remainingBudgetFils, 1200);
    const remainingInBudget = new Set(
      [...afterCartRes.perfectForYou, ...afterCartRes.goodOptions].map((i) => i.dish.nameEn),
    );
    const nowOverBudget = new Set(afterCartRes.moreOptions.map((i) => i.dish.nameEn));

    // Classic Hummus (AED 22.00) & Homemade Lemon & Mint (AED 16.00) now exceed AED 12.00 remaining!
    assert.ok(nowOverBudget.has("Classic Hummus"));
    assert.ok(nowOverBudget.has("Homemade Lemon & Mint"));
    // Coffee (AED 12.00) & Still Water (AED 8.00) still fit his remaining AED 12.00 meal budget!
    assert.ok(remainingInBudget.has("Cardamom Lebanese Coffee"));
    assert.ok(remainingInBudget.has("Al Ain Still Water (500ml)"));
  });

  it("Group of all three (Claude + Bilal + James): shared dishes are vegetarian AND dairy-safe (with required modifiers)", () => {
    const groupRes = evaluateGroupSharedDishes({
      dishes: demoDishes,
      participants: [
        { id: "p_claude", name: "Claude", profile: claudeProfile },
        { id: "p_bilal", name: "Bilal", profile: bilalProfile },
        { id: "p_james", name: "James", profile: jamesProfile },
      ],
    });

    assert.ok(groupRes.sharedDishes.length >= 12);

    const sharedNames = new Set(groupRes.sharedDishes.map((s) => s.dish.nameEn));
    // Naturally vegetarian + dairy-free mezze are shared
    assert.ok(sharedNames.has("Classic Hummus"));
    assert.ok(sharedNames.has("Warak Enab (Stuffed Vine Leaves)"));
    assert.ok(sharedNames.has("Crispy Falafel Basket"));
    assert.ok(sharedNames.has("Mujadara Beiruti"));

    // Smoky Moutabal is shared WITH Bilal's dairy-free modifier attached!
    const sharedMoutabal = groupRes.sharedDishes.find((s) => s.dish.nameEn === "Smoky Moutabal");
    assert.ok(sharedMoutabal);
    assert.equal(sharedMoutabal.requiredModifiers.length, 1);
    assert.ok(sharedMoutabal.requiredModifiers[0]!.removesAllergens.includes("milk"));

    // Zero meat dishes and zero un-modifiable dairy dishes in sharedDishes
    assert.ok(!sharedNames.has("Shish Tawook Platter"));
    assert.ok(!sharedNames.has("Lamb Kafta Meshwi"));
    assert.ok(!sharedNames.has("Labneh bil Toum"));
    assert.ok(!sharedNames.has("Cheese Rakakat Rolls"));
  });

  it("Diner with TWO allergens (milk + gluten) keeps dish HIDDEN when modifier removes only ONE", () => {
    const dualAllergyProfile = {
      displayName: "Dual Allergy Diner",
      dietaryRestrictions: [],
      allergens: ["milk", "gluten"],
    };

    const res = evaluatePersonalizedMenu({
      dishes: demoDishes,
      profile: dualAllergyProfile,
    });

    const hiddenNames = new Set(res.hidden.map((h) => h.dish.nameEn));
    // Manakish Zaatar & Cheese has [gluten, sesame, milk]; modifier removes only [milk] -> MUST STAY HIDDEN
    assert.ok(hiddenNames.has("Manakish Zaatar & Cheese"));
    // Fattoush with Grilled Halloumi has [milk, gluten]; modifier removes only [milk] -> MUST STAY HIDDEN
    assert.ok(hiddenNames.has("Fattoush with Grilled Halloumi"));

    // Meanwhile Traditional Tabbouleh has ONLY [gluten] and a verified gluten-free quinoa modifier -> SAFE_WITH_MODIFIER!
    const visible = [...res.perfectForYou, ...res.goodOptions, ...res.moreOptions];
    const tabbouleh = visible.find((i) => i.dish.nameEn === "Traditional Tabbouleh");
    assert.ok(tabbouleh);
    assert.equal(tabbouleh.safetyState, "SAFE_WITH_MODIFIER");
  });

  it("Treats missing allergen array (null) as UNVERIFIED_WARNING for restricted diners, never safe", () => {
    const mysteryDish: EngineDishInput = {
      id: "mystery_1",
      categoryId: "cat_1",
      nameEn: "Mystery Herb Salad",
      nameAr: "سلطة أعشاب",
      priceAed: "20.00",
      ingredientsEn: ["herbs"],
      ingredientsAr: ["أعشاب"],
      dietTags: ["vegetarian", "vegan", "halal"],
      allergens: null,
      allergenDataProvided: false,
      spiceLevel: "NONE",
      meatType: "NONE",
      verificationStatus: "RESTAURANT_VERIFIED", // even if flag were mis-set, null allergens / false allergenDataProvided forces UNVERIFIED_WARNING!
      isAvailable: true,
      isPopular: false,
      isPublished: true,
      modifiers: [],
    };

    const res = evaluatePersonalizedMenu({
      dishes: [mysteryDish],
      profile: {
        dietaryRestrictions: [],
        allergens: ["peanuts"],
      },
    });

    const visible = [...res.perfectForYou, ...res.goodOptions, ...res.moreOptions];
    assert.equal(visible.length, 1);
    assert.equal(visible[0]!.safetyState, "UNVERIFIED_WARNING");
    assert.ok(visible[0]!.badges.includes("UNVERIFIED_WARNING"));
    assert.ok(!visible[0]!.badges.includes("VERIFIED_SAFE"));
  });

  it("parses valid table QR URLs/paths and degrades Taste Profile Agent cleanly without API key", async () => {
    assert.equal(
      parseQrTableTarget("https://platefit.onrender.com/r/demo-lebanese-kitchen/t/T1"),
      "/r/demo-lebanese-kitchen/t/T1",
    );
    assert.equal(
      parseQrTableTarget("/r/demo-lebanese-kitchen/t/T2"),
      "/r/demo-lebanese-kitchen/t/T2",
    );
    assert.equal(parseQrTableTarget("https://evil.example/phish"), null);
    assert.equal(parseQrTableTarget("javascript:alert(1)"), null);

    const prev = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const taste = await runTasteProfileAgent({
        message: "I am vegetarian and budget is AED 40",
        locale: "en",
      });
      assert.equal(taste.ok, false);
      if (!taste.ok) {
        assert.equal(taste.reason, "AI_NOT_CONFIGURED");
        assert.equal(taste.message, "AI not configured");
      }
    } finally {
      if (prev !== undefined) process.env.GEMINI_API_KEY = prev;
    }
  });
});
