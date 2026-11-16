import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  acceptCompanionInvite,
  applyActiveMealPlanToTableSession,
  createGroupMealPlan,
  createOrGetCompanionInvite,
  listConnectedCompanions,
  loadMealPlanViewForMember,
  removeDiningCompanion,
  updateMealPlanMemberItems,
} from "@/lib/diner/companions";
import { type EngineDishInput, evaluatePersonalizedMenu } from "@/lib/engine/menu-engine";
import {
  buildCustomAvoidIngredient,
  parseFreeTextProfileFallback,
} from "@/lib/menu/ingredient-synonyms";
import { computeTableBillSplit } from "@/lib/ordering/pricing";
import {
  buildKitchenDietarySafetyNote,
  isAuthorizedForTableOrdering,
} from "@/lib/ordering/session";
import { startEphemeralPrismaPostgres } from "@/lib/__tests__/helpers/local-pg";

const SHAWARMA_DISH: EngineDishInput = {
  id: "dish_shawarma",
  categoryId: "cat_wraps",
  nameEn: "Chicken Shawarma Sandwich",
  nameAr: "شاورما دجاج",
  descriptionEn: "Roasted chicken shawarma with garlic toum and pickles in Arabic bread",
  descriptionAr: "شاورما دجاج مع ثوم ومخلل بالخبز العربي",
  priceAed: "24.00",
  ingredientsEn: ["chicken", "garlic toum", "pickles", "arabic bread"],
  ingredientsAr: ["دجاج", "ثوم", "مخلل", "خبز عربي"],
  removableIngredients: ["pickles", "garlic"],
  removableIngredientsVerified: true,
  dietTags: ["halal", "high_protein"],
  allergens: ["gluten"],
  allergenDataProvided: true,
  spiceLevel: "MILD",
  meatType: "CHICKEN",
  verificationStatus: "RESTAURANT_VERIFIED",
  isAvailable: true,
  isPopular: true,
  isPublished: true,
  modifiers: [],
};

const PICKLE_PLATTER_DISH: EngineDishInput = {
  id: "dish_pickles_core",
  categoryId: "cat_mezze",
  nameEn: "Mixed Lebanese Pickles Platter",
  nameAr: "صحن مخلل مشكل",
  descriptionEn: "House-cured pickled cucumbers, turnips, and olives",
  descriptionAr: "مخلل خيار ولفت وزيتون",
  priceAed: "14.00",
  ingredientsEn: ["pickles", "turnips", "olives"],
  ingredientsAr: ["مخلل", "لفت", "زيتون"],
  removableIngredients: [],
  removableIngredientsVerified: true,
  dietTags: ["vegetarian", "vegan", "halal"],
  allergens: [],
  allergenDataProvided: true,
  spiceLevel: "NONE",
  meatType: "NONE",
  verificationStatus: "RESTAURANT_VERIFIED",
  isAvailable: true,
  isPopular: false,
  isPublished: true,
  modifiers: [],
};

const UNKNOWN_REMOVABLE_WRAP: EngineDishInput = {
  id: "dish_unknown_removable",
  categoryId: "cat_wraps",
  nameEn: "Beef Kafta Roll",
  nameAr: "ساندويش كفتة لحم",
  descriptionEn: "Charcoal beef kafta with pickles and biwaz",
  descriptionAr: "كفتة لحم بقري مع مخلل وبيواز",
  priceAed: "28.00",
  ingredientsEn: ["beef", "pickles", "parsley", "onion"],
  ingredientsAr: ["لحم بقري", "مخلل", "بقدونس", "بصل"],
  removableIngredients: [], // Removability NOT confirmed by restaurant!
  removableIngredientsVerified: false,
  dietTags: ["halal"],
  allergens: ["gluten"],
  allergenDataProvided: true,
  spiceLevel: "MILD",
  meatType: "BEEF",
  verificationStatus: "RESTAURANT_VERIFIED",
  isAvailable: true,
  isPopular: false,
  isPublished: true,
  modifiers: [],
};

describe("Phase 7.5 — Custom Hard Restrictions, Bilingual Synonyms & Free-Text Parsing", () => {
  it("enforces customAvoidIngredients across EN/AR synonyms and treats missing ingredient data as UNVERIFIED_WARNING", () => {
    const arabicTomatoDish: EngineDishInput = {
      id: "dish_ar_tomato",
      categoryId: "cat_salads",
      nameEn: "Village Salad",
      nameAr: "سلطة الضيعة",
      priceAed: "20.00",
      // English uses generic "garden vegetables", while Arabic specifies "بندورة" (Levantine Arabic for tomato)!
      ingredientsEn: ["garden vegetables", "lemon"],
      ingredientsAr: ["خيار", "بندورة", "ليمون"],
      removableIngredients: ["tomato"],
      removableIngredientsVerified: true,
      dietTags: ["vegetarian", "vegan", "halal"],
      allergens: [],
      allergenDataProvided: true,
      spiceLevel: "NONE",
      meatType: "NONE",
      verificationStatus: "RESTAURANT_VERIFIED",
      isAvailable: true,
      isPopular: false,
      isPublished: true,
      modifiers: [],
    };

    const missingIngredientsDish: EngineDishInput = {
      id: "dish_no_ing",
      categoryId: "cat_mezze",
      nameEn: "House Dip",
      nameAr: "تغميسة البيت",
      priceAed: "18.00",
      ingredientsEn: [],
      ingredientsAr: [],
      dietTags: ["vegetarian", "vegan", "halal"],
      allergens: [],
      allergenDataProvided: true,
      spiceLevel: "NONE",
      meatType: "NONE",
      verificationStatus: "RESTAURANT_VERIFIED",
      isAvailable: true,
      isPopular: false,
      isPublished: true,
      modifiers: [],
    };

    const safeHummus: EngineDishInput = {
      id: "dish_safe_hummus",
      categoryId: "cat_mezze",
      nameEn: "Classic Hummus",
      nameAr: "حمص",
      priceAed: "22.00",
      ingredientsEn: ["chickpeas", "tahini", "lemon", "olive oil"],
      ingredientsAr: ["حمص", "طحينة", "ليمون", "زيت زيتون"],
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
    };

    const tomatoAvoid = buildCustomAvoidIngredient("tomato");
    const evalRes = evaluatePersonalizedMenu({
      dishes: [arabicTomatoDish, missingIngredientsDish, safeHummus, UNKNOWN_REMOVABLE_WRAP],
      profile: {
        displayName: "Sami",
        dietaryRestrictions: ["no_beef"],
        allergens: [],
        customAvoidIngredients: [tomatoAvoid],
      },
    });

    const hiddenIds = new Set(evalRes.hidden.map((h) => h.dish.id));
    // Arabic "بندورة" matched tomato synonym and HARD HID the dish despite removableIngredients: ["tomato"]!
    assert.ok(hiddenIds.has("dish_ar_tomato"));
    // "no_beef" hard diet hid Beef Kafta Roll
    assert.ok(hiddenIds.has("dish_unknown_removable"));

    const visible = [...evalRes.perfectForYou, ...evalRes.goodOptions];
    const noIngEval = visible.find((v) => v.dish.id === "dish_no_ing");
    const hummusEval = visible.find((v) => v.dish.id === "dish_safe_hummus");

    // Missing ingredient list => UNVERIFIED_WARNING, never VERIFIED_SAFE!
    assert.equal(noIngEval?.safetyState, "UNVERIFIED_WARNING");
    assert.ok(!noIngEval?.badges.includes("VERIFIED_SAFE"));
    // Complete ingredient list with zero tomato => VERIFIED_SAFE
    assert.equal(hummusEval?.safetyState, "VERIFIED_SAFE");

    // Free-text fallback parser maps colloquial descriptions accurately
    const parsed = parseFreeTextProfileFallback({
      otherDietText: "no pork, diabetic-friendly",
      otherAllergyText: "tomato allergy, I react to MSG",
      freePreferencesText: "I don't like that green herb in tabbouleh, I dislike pickles",
    });
    assert.ok(parsed.dietaryRestrictions.includes("no_pork"));
    assert.ok(parsed.dietaryRestrictions.includes("low_sugar"));
    assert.ok(parsed.customAvoidIngredients.some((c) => c.key === "tomato"));
    assert.ok(parsed.customAvoidIngredients.some((c) => c.key === "msg"));
    assert.ok(parsed.dislikedIngredients.includes("parsley"));
    assert.ok(parsed.dislikedIngredients.includes("pickles"));
  });
});

describe("Phase 7.5 — Soft Dislikes ('Without X'), Core Downrank, Unknown Removability & Allergy Safety", () => {
  it("handles pickles/shawarma as normal rank + auto 'No pickles' note, downranks core pickle platter, prompts on unknown removability, and NEVER unlocks allergies", () => {
    const baselineEval = evaluatePersonalizedMenu({
      dishes: [SHAWARMA_DISH, PICKLE_PLATTER_DISH, UNKNOWN_REMOVABLE_WRAP],
      profile: {
        displayName: "Neutral",
        dietaryRestrictions: [],
        allergens: [],
        dislikedIngredients: [],
      },
    });
    const baselineShawarmaScore = [...baselineEval.perfectForYou, ...baselineEval.goodOptions].find(
      (i) => i.dish.id === "dish_shawarma",
    )!.score;
    const baselinePicklePlatterScore = [
      ...baselineEval.perfectForYou,
      ...baselineEval.goodOptions,
    ].find((i) => i.dish.id === "dish_pickles_core")!.score;
    const baselineUnknownScore = [...baselineEval.perfectForYou, ...baselineEval.goodOptions].find(
      (i) => i.dish.id === "dish_unknown_removable",
    )!.score;

    const dislikePicklesEval = evaluatePersonalizedMenu({
      dishes: [SHAWARMA_DISH, PICKLE_PLATTER_DISH, UNKNOWN_REMOVABLE_WRAP],
      profile: {
        displayName: "Pickle Hater",
        dietaryRestrictions: [],
        allergens: [],
        dislikedIngredients: ["pickles"],
      },
    });

    // Zero dishes hidden for soft dislikes!
    assert.equal(dislikePicklesEval.hidden.length, 0);

    const visible = [...dislikePicklesEval.perfectForYou, ...dislikePicklesEval.goodOptions];
    const shawarma = visible.find((i) => i.dish.id === "dish_shawarma")!;
    const platter = visible.find((i) => i.dish.id === "dish_pickles_core")!;
    const unknownWrap = visible.find((i) => i.dish.id === "dish_unknown_removable")!;

    // 1. Confirmed removable garnish on Shawarma: ranked normally (0 penalty), "Comes with pickles...", auto "No pickles"
    assert.equal(shawarma.score, baselineShawarmaScore);
    assert.deepEqual(shawarma.autoOrderNotesEn, ["No pickles"]);
    assert.ok(shawarma.dislikeNoticesEn[0]?.includes("Comes with pickles"));

    // Kitchen order line note includes "No pickles" automatically
    const kitchenNote = buildKitchenDietarySafetyNote({
      participantName: "Bilal",
      allergens: [],
      dietaryRestrictions: [],
      selectedModifierNamesEn: [],
      manualNote: shawarma.autoOrderNotesEn.join(", "),
    });
    assert.ok(kitchenNote?.includes("No pickles"));

    // 2. Core ingredient ("Mixed Lebanese Pickles Platter"): downranked by 25 pts, NO "No pickles" note
    assert.equal(platter.score, baselinePicklePlatterScore - 25);
    assert.deepEqual(platter.autoOrderNotesEn, []);

    // 3. Unknown removability ("Beef Kafta Roll"): light downrank (-6 pts) + "Ask your server..."
    assert.equal(unknownWrap.score, baselineUnknownScore - 6);
    assert.ok(unknownWrap.dislikeNoticesEn[0]?.includes("Ask your server"));

    // 4. Allergy is NEVER "fixed" by removableIngredients (even though Shawarma has gluten and removableIngredients!)
    const glutenAllergyEval = evaluatePersonalizedMenu({
      dishes: [SHAWARMA_DISH],
      profile: {
        displayName: "Celiac Diner",
        dietaryRestrictions: [],
        allergens: ["gluten"],
        dislikedIngredients: ["pickles"],
      },
    });
    assert.equal(glutenAllergyEval.hidden.length, 1);
    assert.equal(glutenAllergyEval.hidden[0]!.dish.id, "dish_shawarma");
  });
});

describe("Phase 7.5 — Dining Companions, Privacy, Meal Planner Auto-Join at Scan & Payment Modes", () => {
  it("connects companions, enforces profile privacy, plans shared meal (James vegetarian + Bilal dislikes tomatoes), blocks ordering without k, and auto-loads at QR scan", async () => {
    const env = await startEphemeralPrismaPostgres();
    try {
      const [owner, jamesUser, bilalUser] = await Promise.all([
        env.prisma.user.create({
          data: { email: "owner75@test.local", name: "Owner", role: "RESTAURANT_OWNER" },
        }),
        env.prisma.user.create({
          data: { email: "james75@test.local", name: "James", role: "DINER" },
        }),
        env.prisma.user.create({
          data: { email: "bilal75@test.local", name: "Bilal", role: "DINER" },
        }),
      ]);

      const [jamesProfile, bilalProfile] = await Promise.all([
        env.prisma.dinerProfile.create({
          data: {
            userId: jamesUser.id,
            displayName: "James",
            dietaryRestrictions: ["vegetarian"],
            allergens: [],
            shareFullProfileWithCompanions: false, // Private!
          },
        }),
        env.prisma.dinerProfile.create({
          data: {
            userId: bilalUser.id,
            displayName: "Bilal",
            dietaryRestrictions: ["halal"],
            dislikedIngredients: ["tomatoes"],
            shareFullProfileWithCompanions: false, // Private!
          },
        }),
      ]);

      const restaurant = await env.prisma.restaurant.create({
        data: {
          slug: "beirut-garden-75",
          nameEn: "Beirut Garden",
          nameAr: "حديقة بيروت",
          status: "APPROVED",
          ownerId: owner.id,
        },
      });

      const cat = await env.prisma.menuCategory.create({
        data: { restaurantId: restaurant.id, nameEn: "Mezze & Grills", nameAr: "مقبلات ومشاوي" },
      });

      const [fattoush, lambKafta] = await Promise.all([
        env.prisma.menuItem.create({
          data: {
            restaurantId: restaurant.id,
            categoryId: cat.id,
            nameEn: "Garden Fattoush",
            nameAr: "فتوش",
            priceAed: "24.00",
            ingredientsEn: ["lettuce", "cucumber", "tomatoes", "radish", "sumac"],
            ingredientsAr: ["خس", "خيار", "طماطم", "فجل", "سماق"],
            removableIngredients: ["tomato"],
            removableIngredientsVerified: true,
            dietTags: ["vegetarian", "vegan", "halal"],
            allergens: [],
            allergenDataProvided: true,
            meatType: "NONE",
            verificationStatus: "RESTAURANT_VERIFIED",
            isPublished: true,
            isAvailable: true,
          },
        }),
        env.prisma.menuItem.create({
          data: {
            restaurantId: restaurant.id,
            categoryId: cat.id,
            nameEn: "Lamb Kafta",
            nameAr: "كفتة غنم",
            priceAed: "42.00",
            ingredientsEn: ["lamb", "parsley", "onion"],
            ingredientsAr: ["غنم", "بقدونس", "بصل"],
            removableIngredients: ["onion"],
            removableIngredientsVerified: true,
            dietTags: ["halal"],
            allergens: [],
            allergenDataProvided: true,
            meatType: "LAMB",
            verificationStatus: "RESTAURANT_VERIFIED",
            isPublished: true,
            isAvailable: true,
          },
        }),
      ]);

      const table = await env.prisma.diningTable.create({
        data: {
          restaurantId: restaurant.id,
          tableCode: "T5",
          displayName: "Table 5",
          qrToken: "secret_token_t5_128bit",
        },
      });

      // 1. Invite & connect James <-> Bilal
      const invite = await createOrGetCompanionInvite(jamesProfile.id, env.prisma);
      const accepted = await acceptCompanionInvite(
        { accepterProfileId: bilalProfile.id, code: invite.code },
        env.prisma,
      );
      assert.equal(accepted.ok, true);

      // 2. Privacy check: neither opted into `shareFullProfileWithCompanions`, so raw profile is hidden!
      const bilalCompanions = await listConnectedCompanions(bilalProfile.id, env.prisma);
      assert.equal(bilalCompanions.length, 1);
      assert.equal(bilalCompanions[0]!.displayName, "James");
      assert.equal(bilalCompanions[0]!.sharesFullProfile, false);
      assert.equal(bilalCompanions[0]!.fullProfile, undefined);

      // 3. Create MealPlan for James (vegetarian) + Bilal (dislikes tomatoes)
      const planCreated = await createGroupMealPlan(
        {
          hostProfileId: jamesProfile.id,
          companionProfileIds: [bilalProfile.id],
          restaurantId: restaurant.id,
        },
        env.prisma,
      );
      assert.equal(planCreated.ok, true);
      if (!planCreated.ok) return;

      const planViewForJames = await loadMealPlanViewForMember(
        { mealPlanId: planCreated.mealPlanId, viewerProfileId: jamesProfile.id },
        env.prisma,
      );
      assert.ok(planViewForJames);

      // Privacy-safe group summary shows counts, while Bilal's individual fullProfile stays hidden from James!
      assert.ok(planViewForJames.groupSummary.en.some((s) => s.includes("vegetarian")));
      assert.ok(planViewForJames.groupSummary.en.some((s) => s.includes("dislikes tomatoes")));
      const bilalMemberView = planViewForJames.members.find(
        (m) => m.profileId === bilalProfile.id,
      )!;
      assert.equal(bilalMemberView.sharesFullProfile, false);
      assert.equal(bilalMemberView.fullProfile, undefined);

      // Shared view excludes Lamb Kafta (James is vegetarian) and includes Garden Fattoush with "No tomato"!
      assert.deepEqual(
        planViewForJames.sharedDishes.map((s) => s.dish.id),
        [fattoush.id],
      );
      assert.deepEqual(planViewForJames.sharedDishes[0]!.autoOrderNotesEn, ["No tomato"]);

      // Save planned picks (shared Fattoush with "No tomato" + Bilal's Lamb Kafta)
      await updateMealPlanMemberItems(
        {
          mealPlanId: planCreated.mealPlanId,
          actorProfileId: jamesProfile.id,
          targetProfileId: jamesProfile.id,
          plannedItems: [
            {
              menuItemId: fattoush.id,
              modifierIds: [],
              quantity: 1,
              forSharedTable: true,
              specialInstructions: "No tomato",
            },
          ],
        },
        env.prisma,
      );
      await updateMealPlanMemberItems(
        {
          mealPlanId: planCreated.mealPlanId,
          actorProfileId: bilalProfile.id,
          targetProfileId: bilalProfile.id,
          plannedItems: [
            {
              menuItemId: lambKafta.id,
              modifierIds: [],
              quantity: 1,
              forSharedTable: false,
            },
          ],
        },
        env.prisma,
      );

      // 4. Planning remotely NEVER authorizes ordering without table QR token `k`
      const tableSession = await env.prisma.tableSession.create({
        data: {
          restaurantId: restaurant.id,
          tableId: table.id,
          shareCode: "SHARE-T5",
        },
      });
      assert.equal(
        isAuthorizedForTableOrdering({
          providedToken: null,
          expectedTableQrToken: table.qrToken,
          cookieEntries: [],
          sessionId: tableSession.id,
        }),
        false,
      );
      assert.equal(
        isAuthorizedForTableOrdering({
          providedToken: "wrong_token",
          expectedTableQrToken: table.qrToken,
          cookieEntries: [],
          sessionId: tableSession.id,
        }),
        false,
      );

      // 5. At the restaurant: valid QR token `k` authorizes session & auto-joins both companions with planned picks!
      assert.equal(
        isAuthorizedForTableOrdering({
          providedToken: table.qrToken,
          expectedTableQrToken: table.qrToken,
          cookieEntries: [],
          sessionId: tableSession.id,
        }),
        true,
      );

      const applied = await applyActiveMealPlanToTableSession(
        {
          restaurantId: restaurant.id,
          tableSessionId: tableSession.id,
          triggerProfileId: jamesProfile.id,
        },
        env.prisma,
      );
      assert.equal(applied.applied, true);

      const seatedParticipants = await env.prisma.tableParticipant.findMany({
        where: { tableSessionId: tableSession.id },
        orderBy: { displayName: "asc" },
      });
      assert.equal(seatedParticipants.length, 2); // Bilal & James both auto-joined!
      const jamesSeated = seatedParticipants.find((p) => p.displayName === "James")!;
      assert.ok(JSON.stringify(jamesSeated.cartItems).includes("No tomato"));

      // 6. Paying together: Split by person vs One person pays for all
      const splitByPerson = computeTableBillSplit({
        participants: [
          { id: "p_james", displayName: "James" },
          { id: "p_bilal", displayName: "Bilal" },
        ],
        lines: [
          { participantId: null, lineTotalFils: 2400 }, // Shared Fattoush AED 24.00 -> 12.00 each
          { participantId: "p_bilal", lineTotalFils: 4200 }, // Bilal Lamb Kafta AED 42.00
        ],
        paymentMode: "SPLIT_BY_PERSON",
      });
      assert.equal(splitByPerson.shares[0]!.totalAed, "12.00");
      assert.equal(splitByPerson.shares[1]!.totalAed, "54.00");

      const onePaysAll = computeTableBillSplit({
        participants: [
          { id: "p_james", displayName: "James" },
          { id: "p_bilal", displayName: "Bilal" },
        ],
        lines: [
          { participantId: null, lineTotalFils: 2400 },
          { participantId: "p_bilal", lineTotalFils: 4200 },
        ],
        paymentMode: "ONE_PERSON_PAYS_ALL",
        payerParticipantId: "p_bilal",
      });
      assert.equal(onePaysAll.shares[0]!.totalAed, "0.00");
      assert.equal(onePaysAll.shares[1]!.totalAed, "66.00");

      // 7. Companion can be removed anytime
      await removeDiningCompanion(
        { viewerProfileId: jamesProfile.id, companionProfileId: bilalProfile.id },
        env.prisma,
      );
      const afterRemove = await listConnectedCompanions(jamesProfile.id, env.prisma);
      assert.equal(afterRemove.length, 0);
    } finally {
      await env.stop();
    }
  });
});
