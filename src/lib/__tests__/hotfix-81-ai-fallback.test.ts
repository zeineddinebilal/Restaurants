import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyProviderErrorForLog } from "@/lib/agents/gemini";
import { buildDeterministicGroupTableFallback } from "@/lib/agents/group-table";
import { resolveTasteChatWithFallback } from "@/lib/agents/taste-profile";
import {
  parseFreeTextProfileFallback,
  resolveIngredientSynonyms,
  textContainsIngredientSynonyms,
} from "@/lib/menu/ingredient-synonyms";
import { startEphemeralPrismaPostgres } from "@/lib/__tests__/helpers/local-pg";

describe("Hotfix 8.1 — Universal Deterministic Fallback, 'no pickles no truffle', & Provider Error Classification", () => {
  it("parses 'no pickles no truffle' and 'no X, no Y' / 'without X' / 'I don't eat X' as soft dislikes (never allergies)", () => {
    // 1. Exact live-bug phrase: "no pickles no truffle"
    const exact = parseFreeTextProfileFallback({
      freePreferencesText: "no pickles no truffle",
    });
    assert.deepEqual(exact.dislikedIngredients, ["pickles", "truffle"]);
    assert.deepEqual(exact.allergens, []);
    assert.deepEqual(exact.customAvoidIngredients, []);
    assert.deepEqual(exact.dietaryRestrictions, []);

    // 2. Comma-separated "no X, no Y"
    const comma = parseFreeTextProfileFallback({
      freePreferencesText: "no pickles, no truffle",
    });
    assert.deepEqual(comma.dislikedIngredients, ["pickles", "truffle"]);
    assert.deepEqual(comma.allergens, []);
    assert.deepEqual(comma.customAvoidIngredients, []);

    // 3. "without X" and "I don't eat X"
    const withoutAndDontEat = parseFreeTextProfileFallback({
      freePreferencesText: "without pickles. I don't eat truffle",
    });
    assert.deepEqual(withoutAndDontEat.dislikedIngredients, ["pickles", "truffle"]);
    assert.deepEqual(withoutAndDontEat.allergens, []);
    assert.deepEqual(withoutAndDontEat.customAvoidIngredients, []);

    // 4. Arabic truffle synonyms (كمأة / ترفل)
    const arabic = parseFreeTextProfileFallback({
      freePreferencesText: "بدون مخلل بدون ترفل",
    });
    assert.deepEqual(arabic.dislikedIngredients, ["pickles", "truffle"]);

    const truffleSyn = resolveIngredientSynonyms("truffle");
    assert.equal(truffleSyn.key, "truffle");
    assert.equal(truffleSyn.labelEn, "truffle");
    assert.equal(truffleSyn.labelAr, "كمأة");
    assert.equal(
      textContainsIngredientSynonyms(" Fries with truffle oil ", truffleSyn.terms),
      true,
    );
    assert.equal(textContainsIngredientSynonyms("بطاطا مع كمأة سوداء", truffleSyn.terms), true);
    assert.equal(textContainsIngredientSynonyms("صلصة ترفل", truffleSyn.terms), true);

    // 5. Mixed hard restrictions + soft dislikes in a single chat box string
    const mixed = parseFreeTextProfileFallback({
      freePreferencesText: "tomato allergy, no pork, no pickles no truffle",
    });
    assert.deepEqual(mixed.dietaryRestrictions, ["no_pork"]);
    assert.deepEqual(
      mixed.customAvoidIngredients.map((c) => c.key),
      ["tomato"],
    );
    assert.deepEqual(mixed.dislikedIngredients, ["pickles", "truffle"]);
  });

  it("classifies 401/403, 429, 404, and timeout provider errors for AiUsageLog while redacting API keys", () => {
    const authErr = Object.assign(
      new Error(
        "API key not valid. Please pass a valid API key?key=AIzaSySecretKey123456789012345",
      ),
      { status: 403, name: "ApiError" },
    );
    const authLog = classifyProviderErrorForLog(authErr);
    assert.match(authLog, /^\[AUTH_401_403 HTTP 403\]/);
    assert.equal(authLog.includes("AIzaSySecretKey"), false, "Must redact raw API keys");

    const quotaErr = Object.assign(new Error("Resource has been exhausted (e.g. check quota)."), {
      status: 429,
      name: "ApiError",
    });
    assert.match(classifyProviderErrorForLog(quotaErr), /^\[QUOTA_429 HTTP 429\]/);

    const modelErr = Object.assign(new Error("models/unknown-model is not found"), {
      status: 404,
      name: "ApiError",
    });
    assert.match(classifyProviderErrorForLog(modelErr), /^\[MODEL_404 HTTP 404\]/);

    const timeoutErr = Object.assign(new Error("The operation was aborted due to timeout"), {
      name: "TimeoutError",
    });
    assert.match(classifyProviderErrorForLog(timeoutErr), /^\[TIMEOUT\]/);
  });

  it("builds deterministic group table suggestions when AI is unavailable", () => {
    const fallback = buildDeterministicGroupTableFallback({
      locale: "en",
      dishes: [
        {
          id: "d_hummus",
          categoryId: "c1",
          nameEn: "Classic Hummus",
          nameAr: "حمص",
          priceAed: "22.00",
          ingredientsEn: ["chickpeas", "tahini"],
          ingredientsAr: ["حمص", "طحينة"],
          dietTags: ["vegetarian", "vegan", "halal"],
          allergens: ["sesame"],
          allergenDataProvided: true,
          spiceLevel: "NONE",
          meatType: "NONE",
          verificationStatus: "RESTAURANT_VERIFIED",
          isAvailable: true,
          isPopular: true,
          isPublished: true,
          modifiers: [],
        },
      ],
      participants: [
        {
          id: "p1",
          name: "Claude",
          profile: { dietaryRestrictions: ["vegetarian"], allergens: [] },
        },
      ],
    });

    assert.equal(fallback.usedFallback, true);
    assert.match(fallback.summary, /without AI/i);
    assert.equal(fallback.sharedSet.length, 1);
    assert.equal(fallback.personalPicks.length, 1);
  });

  it("falls back deterministically in POST /api/diner/taste-chat on AI_CALL_FAILED (invalid key) and logs error class in AiUsageLog without leaking to diner", async () => {
    const handle = await startEphemeralPrismaPostgres();
    const prevKey = process.env.GEMINI_API_KEY;

    try {
      process.env.GEMINI_API_KEY = "AIzaSyBogusInvalidKeyForHotfix81Test00000";

      const resolved = await resolveTasteChatWithFallback({
        message: "no pickles no truffle",
        locale: "en",
        clientIp: "198.51.100.81",
        db: handle.prisma,
      });

      assert.equal(resolved.ok, true, "Must return ok fallback instead of AI_CALL_FAILED error");
      if (!resolved.ok) throw new Error("Expected fallback success");

      assert.equal(resolved.usedFallback, true);
      assert.match(resolved.reply, /matched without AI/i);
      assert.equal(resolved.reply.includes("AIza"), false);
      assert.equal(resolved.reply.includes("400"), false);
      assert.equal(resolved.reply.includes("403"), false);
      assert.deepEqual(resolved.patch.dislikedIngredients, ["pickles", "truffle"]);
      assert.deepEqual(resolved.patch.allergens, []);
      assert.deepEqual(resolved.patch.customAvoidIngredients, []);

      // Verify AiUsageLog recorded the failed call + classified errorMessage for admins
      const logs = await handle.prisma.aiUsageLog.findMany({
        where: { agentName: "tasteProfileAgent" },
      });
      assert.equal(logs.length, 1);
      assert.equal(logs[0]?.success, false);
      assert.ok(
        logs[0]?.errorMessage?.startsWith("["),
        `Expected classified error prefix in AiUsageLog.errorMessage, got: ${logs[0]?.errorMessage}`,
      );
      assert.equal(
        logs[0]?.errorMessage?.includes("AIzaSyBogusInvalidKey"),
        false,
        "Must never log unredacted API key",
      );
    } finally {
      if (prevKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = prevKey;
      await handle.stop();
    }
  });
});
