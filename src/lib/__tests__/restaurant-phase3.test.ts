import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runDishTaggingAgent } from "@/lib/agents/dish-tagging";
import { normalizeAiPriceToAed, runMenuIngestionAgent } from "@/lib/agents/menu-ingestion";
import { DEMO_LEBANESE_CATEGORIES } from "@/lib/demo/lebanese-menu-data";
import { normalizeAllergenList, normalizeDietTagList } from "@/lib/menu/taxonomy";
import {
  evaluateBatchImportVerification,
  resolveUpdatedVerificationStatus,
  validateDishForVerification,
  validateModifierForVerification,
} from "@/lib/menu/verification";
import { aedToFils } from "@/lib/money";
import { buildTableQrPath, buildTableQrUrl, generateQrCodeSvg } from "@/lib/qr";

describe("Phase 3 Restaurant Side — Verification Rules, Modifiers, AI Agents, QR & 42-Dish Seed", () => {
  it("rejects verifying dishes when allergenDataProvided is false (missing data = never safe)", () => {
    const res = validateDishForVerification({
      allergenDataProvided: false,
      allergens: [],
      dietTags: ["vegetarian", "vegan"],
      meatType: "NONE",
    });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.code, "MISSING_ALLERGEN_DATA");
    }
  });

  it("allows verifying a 0-allergen dish once allergenDataProvided is explicitly true", () => {
    const res = validateDishForVerification({
      allergenDataProvided: true,
      allergens: [],
      dietTags: ["vegetarian", "vegan", "halal"],
      meatType: "NONE",
    });
    assert.equal(res.ok, true);
  });

  it("blocks contradictory diet/meat/allergen combinations from being verified", () => {
    const vegMeat = validateDishForVerification({
      allergenDataProvided: true,
      allergens: [],
      dietTags: ["vegetarian"],
      meatType: "CHICKEN",
    });
    assert.equal(vegMeat.ok, false);

    const veganDairy = validateDishForVerification({
      allergenDataProvided: true,
      allergens: ["dairy"],
      dietTags: ["vegan"],
      meatType: "NONE",
    });
    assert.equal(veganDairy.ok, false);

    const pescLamb = validateDishForVerification({
      allergenDataProvided: true,
      allergens: [],
      dietTags: ["pescatarian"],
      meatType: "LAMB",
    });
    assert.equal(pescLamb.ok, false);

    const pescFish = validateDishForVerification({
      allergenDataProvided: true,
      allergens: ["fish"],
      dietTags: ["pescatarian", "halal"],
      meatType: "FISH",
    });
    assert.equal(pescFish.ok, true);
  });

  it("validates modifiers against parent dish meatType and remaining milk/egg allergens", () => {
    // 1. Invalid: modifier claims to add vegetarian/vegan to a LAMB dish
    const meatMod = validateModifierForVerification(
      { allergens: ["milk"], dietTags: ["halal"], meatType: "LAMB" },
      {
        nameEn: "Without yogurt",
        removesAllergens: ["milk"],
        addsDietTags: ["vegetarian"],
      },
    );
    assert.equal(meatMod.ok, false);
    if (!meatMod.ok) {
      assert.equal(meatMod.code, "MODIFIER_MEAT_CONFLICT");
    }

    // 2. Invalid: modifier claims to add vegan, removes milk, but base dish still has eggs
    const veganLeavesEggs = validateModifierForVerification(
      { allergens: ["milk", "eggs"], dietTags: ["vegetarian"], meatType: "NONE" },
      {
        nameEn: "Without cheese",
        removesAllergens: ["milk"],
        addsDietTags: ["vegan"],
      },
    );
    assert.equal(veganLeavesEggs.ok, false);
    if (!veganLeavesEggs.ok) {
      assert.equal(veganLeavesEggs.code, "MODIFIER_VEGAN_DAIRY_EGG_CONFLICT");
    }

    // 3. Valid: vegetarian dish with milk, modifier removes milk and adds vegan
    const validVeganMod = validateModifierForVerification(
      { allergens: ["sesame", "milk"], dietTags: ["vegetarian", "halal"], meatType: "NONE" },
      {
        nameEn: "Without yogurt swirl",
        removesAllergens: ["milk"],
        addsDietTags: ["vegan"],
      },
    );
    assert.equal(validVeganMod.ok, true);
  });

  it("batch import falls back to AI_SUGGESTED with warnings when verifyNow fails safety checks", () => {
    const invalidBatchItem = evaluateBatchImportVerification({
      nameEn: "Invalid Vegetarian Lamb",
      verifyNow: true,
      allergenDataProvided: true,
      allergens: [],
      dietTags: ["vegetarian"],
      meatType: "LAMB",
    });
    assert.equal(invalidBatchItem.verified, false);
    assert.ok(invalidBatchItem.warning);
    assert.equal(invalidBatchItem.warning.code, "DIET_MEAT_CONFLICT");

    const unconfirmedBatchItem = evaluateBatchImportVerification({
      nameEn: "Unconfirmed AI Dish",
      verifyNow: true,
      allergenDataProvided: false,
      allergens: ["sesame"],
      dietTags: ["vegan"],
      meatType: "NONE",
    });
    assert.equal(unconfirmedBatchItem.verified, false);
    assert.equal(unconfirmedBatchItem.warning?.code, "MISSING_ALLERGEN_DATA");
  });

  it("downgrades RESTAURANT_VERIFIED back to AI_SUGGESTED when safety fields OR modifiers change without reverify", () => {
    const baseSafety = {
      allergenDataProvided: true,
      allergens: ["sesame", "milk"],
      dietTags: ["vegetarian", "halal"],
      meatType: "NONE" as const,
      ingredientsEn: ["eggplant", "tahini", "yogurt"],
      ingredientsAr: ["باذنجان", "طحينة", "لبن"],
      modifiers: [
        {
          nameEn: "Without yogurt",
          nameAr: "بدون لبن",
          removesAllergens: ["milk"],
          addsDietTags: ["vegan"],
        },
      ],
    };

    // Unchanged safety fields & modifiers -> stays RESTAURANT_VERIFIED
    const unchanged = resolveUpdatedVerificationStatus({
      previous: { verificationStatus: "RESTAURANT_VERIFIED", ...baseSafety },
      next: { ...baseSafety },
    });
    assert.deepEqual(unchanged, {
      ok: true,
      verificationStatus: "RESTAURANT_VERIFIED",
      keepVerifiedMetadata: true,
    });

    // Editing modifier removesAllergens without reverify -> downgrades to AI_SUGGESTED
    const editedModifiers = resolveUpdatedVerificationStatus({
      previous: { verificationStatus: "RESTAURANT_VERIFIED", ...baseSafety },
      next: {
        ...baseSafety,
        modifiers: [
          {
            nameEn: "Without yogurt",
            nameAr: "بدون لبن",
            removesAllergens: [],
            addsDietTags: [],
          },
        ],
      },
    });
    assert.deepEqual(editedModifiers, {
      ok: true,
      verificationStatus: "AI_SUGGESTED",
      keepVerifiedMetadata: false,
    });

    // Editing ingredients without reverify -> downgrades to AI_SUGGESTED
    const editedIngredients = resolveUpdatedVerificationStatus({
      previous: { verificationStatus: "RESTAURANT_VERIFIED", ...baseSafety },
      next: { ...baseSafety, ingredientsEn: ["eggplant", "tahini", "yogurt", "walnuts"] },
    });
    assert.deepEqual(editedIngredients, {
      ok: true,
      verificationStatus: "AI_SUGGESTED",
      keepVerifiedMetadata: false,
    });

    // Explicit reverify validates both dish & modifiers before granting RESTAURANT_VERIFIED
    const invalidReverify = resolveUpdatedVerificationStatus({
      previous: { verificationStatus: "RESTAURANT_VERIFIED", ...baseSafety },
      next: {
        ...baseSafety,
        modifiers: [
          {
            nameEn: "Broken vegan modifier",
            nameAr: "تعديل خاطئ",
            removesAllergens: [], // leaves milk in base dish while claiming vegan!
            addsDietTags: ["vegan"],
          },
        ],
      },
      reverify: true,
    });
    assert.equal(invalidReverify.ok, false);
  });

  it("normalizes allergen aliases, diet tags, and AI decimal prices without floats", () => {
    assert.deepEqual(normalizeAllergenList(["Dairy", "Wheat", "tahini", "unknown_tag"]), [
      "milk",
      "gluten",
      "sesame",
    ]);
    assert.deepEqual(normalizeDietTagList(["Vegetarian", "High-Protein", "invalid"]), [
      "vegetarian",
      "high_protein",
    ]);
    assert.equal(normalizeAiPriceToAed("35"), "35.00");
    assert.equal(normalizeAiPriceToAed("AED 42.5"), "42.50");
    assert.equal(normalizeAiPriceToAed(29.99), "29.99");
  });

  it("handles missing GEMINI_API_KEY gracefully in Menu Ingestion & Dish Tagging agents", async () => {
    const prev = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const ingestRes = await runMenuIngestionAgent({ pastedText: "Hummus AED 22" });
      assert.equal(ingestRes.ok, false);
      if (!ingestRes.ok) {
        assert.equal(ingestRes.reason, "AI_NOT_CONFIGURED");
        assert.equal(ingestRes.message, "AI not configured");
      }

      const tagRes = await runDishTaggingAgent({ dishes: [{ nameEn: "Hummus" }] });
      assert.equal(tagRes.ok, false);
      if (!tagRes.ok) {
        assert.equal(tagRes.reason, "AI_NOT_CONFIGURED");
      }
    } finally {
      if (prev !== undefined) process.env.GEMINI_API_KEY = prev;
    }
  });

  it("builds table QR paths/URLs and generates valid SVG QR markup", async () => {
    const qrPath = buildTableQrPath("demo-lebanese-kitchen", "T1");
    assert.equal(qrPath, "/r/demo-lebanese-kitchen/t/T1");
    const qrUrl = buildTableQrUrl("https://platefit.onrender.com/", "demo-lebanese-kitchen", "T1");
    assert.equal(qrUrl, "https://platefit.onrender.com/r/demo-lebanese-kitchen/t/T1");

    const svg = await generateQrCodeSvg(qrUrl);
    assert.ok(svg.includes("<svg"));
  });

  it("validates all 42 dishes & modifiers in DEMO_LEBANESE_CATEGORIES for safety consistency", () => {
    const allDishes = DEMO_LEBANESE_CATEGORIES.flatMap((c) => c.items);
    assert.ok(allDishes.length >= 40, `Expected >= 40 demo dishes, found ${allDishes.length}`);

    let verifiedCount = 0;
    let aiSuggestedCount = 0;
    let dairyFreeModifierCount = 0;

    for (const dish of allDishes) {
      assert.ok(dish.nameEn.length > 0);
      assert.ok(dish.nameAr.length > 0);
      assert.ok(aedToFils(dish.priceAed) > 0);

      if (dish.verificationStatus === "RESTAURANT_VERIFIED") {
        verifiedCount++;
        const check = validateDishForVerification({
          allergenDataProvided: dish.allergenDataProvided,
          allergens: dish.allergens,
          dietTags: dish.dietTags,
          meatType: dish.meatType,
          modifiers: dish.modifiers,
        });
        assert.equal(
          check.ok,
          true,
          `Seeded verified dish "${dish.nameEn}" failed safety check: ${!check.ok ? check.message : ""}`,
        );
      } else {
        aiSuggestedCount++;
        assert.equal(
          dish.allergenDataProvided,
          false,
          `AI_SUGGESTED seed dish "${dish.nameEn}" must have allergenDataProvided = false`,
        );
      }

      for (const mod of dish.modifiers ?? []) {
        assert.equal(typeof aedToFils(mod.priceDeltaAed), "number");
        if (mod.removesAllergens.includes("milk")) {
          dairyFreeModifierCount++;
        }
      }
    }

    assert.ok(verifiedCount >= 35);
    assert.ok(aiSuggestedCount >= 3);
    assert.ok(dairyFreeModifierCount >= 4);
  });
});
