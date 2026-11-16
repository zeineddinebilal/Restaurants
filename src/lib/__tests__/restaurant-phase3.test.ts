import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runDishTaggingAgent } from "@/lib/agents/dish-tagging";
import { normalizeAiPriceToAed, runMenuIngestionAgent } from "@/lib/agents/menu-ingestion";
import { DEMO_LEBANESE_CATEGORIES } from "@/lib/demo/lebanese-menu-data";
import { normalizeAllergenList, normalizeDietTagList } from "@/lib/menu/taxonomy";
import {
  resolveUpdatedVerificationStatus,
  validateDishForVerification,
} from "@/lib/menu/verification";
import { aedToFils } from "@/lib/money";
import { buildTableQrPath, buildTableQrUrl, generateQrCodeSvg } from "@/lib/qr";

describe("Phase 3 Restaurant Side — Verification Rules, AI Agents, QR Codes & 42-Dish Demo Seed", () => {
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
    // Vegetarian with CHICKEN meatType -> rejected
    const vegMeat = validateDishForVerification({
      allergenDataProvided: true,
      allergens: [],
      dietTags: ["vegetarian"],
      meatType: "CHICKEN",
    });
    assert.equal(vegMeat.ok, false);

    // Vegan with milk allergen -> rejected
    const veganDairy = validateDishForVerification({
      allergenDataProvided: true,
      allergens: ["dairy"],
      dietTags: ["vegan"],
      meatType: "NONE",
    });
    assert.equal(veganDairy.ok, false);

    // Pescatarian with LAMB -> rejected; with FISH -> accepted
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

  it("downgrades RESTAURANT_VERIFIED back to AI_SUGGESTED when safety fields change without reverify", () => {
    const baseSafety = {
      allergenDataProvided: true,
      allergens: ["sesame"],
      dietTags: ["vegetarian", "vegan", "halal"],
      meatType: "NONE" as const,
      ingredientsEn: ["chickpeas", "tahini"],
      ingredientsAr: ["حمص", "طحينة"],
    };

    // Unchanged safety fields (e.g. only price updated) -> stays RESTAURANT_VERIFIED
    const unchanged = resolveUpdatedVerificationStatus({
      previous: { verificationStatus: "RESTAURANT_VERIFIED", ...baseSafety },
      next: { ...baseSafety },
    });
    assert.deepEqual(unchanged, {
      ok: true,
      verificationStatus: "RESTAURANT_VERIFIED",
      keepVerifiedMetadata: true,
    });

    // Ingredient or allergen edited without reverify -> resets to AI_SUGGESTED
    const editedIngredients = resolveUpdatedVerificationStatus({
      previous: { verificationStatus: "RESTAURANT_VERIFIED", ...baseSafety },
      next: { ...baseSafety, ingredientsEn: ["chickpeas", "tahini", "yogurt"] },
    });
    assert.deepEqual(editedIngredients, {
      ok: true,
      verificationStatus: "AI_SUGGESTED",
      keepVerifiedMetadata: false,
    });

    // Explicit reverify stamps fresh RESTAURANT_VERIFIED after validation
    const reverified = resolveUpdatedVerificationStatus({
      previous: { verificationStatus: "RESTAURANT_VERIFIED", ...baseSafety },
      next: {
        ...baseSafety,
        allergens: ["sesame", "milk"],
        dietTags: ["vegetarian", "halal"],
        ingredientsEn: ["chickpeas", "tahini", "yogurt"],
      },
      reverify: true,
    });
    assert.deepEqual(reverified, {
      ok: true,
      verificationStatus: "RESTAURANT_VERIFIED",
      keepVerifiedMetadata: false,
    });
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

  it("validates all ~40 dishes in DEMO_LEBANESE_CATEGORIES for bilingual, price, and safety consistency", () => {
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
        });
        assert.equal(
          check.ok,
          true,
          `Seeded verified dish "${dish.nameEn}" failed safety check: ${!check.ok ? check.message : ""}`,
        );
      } else {
        aiSuggestedCount++;
      }

      for (const mod of dish.modifiers ?? []) {
        // Verify modifier priceDeltaAed parses cleanly (supports negative or zero deltas too)
        assert.equal(typeof aedToFils(mod.priceDeltaAed), "number");
        if (mod.removesAllergens.includes("milk")) {
          dairyFreeModifierCount++;
        }
      }
    }

    assert.ok(verifiedCount >= 35);
    assert.ok(aiSuggestedCount >= 2);
    assert.ok(dairyFreeModifierCount >= 4);
  });
});
