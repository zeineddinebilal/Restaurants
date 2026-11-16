import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { startEphemeralPrismaPostgres } from "@/lib/__tests__/helpers/local-pg";
import { submitSharedTableCartAtomically } from "@/lib/ordering/cart-submit";
import {
  transitionOrderStatusAtomically,
  validateOrderStatusTransition,
} from "@/lib/ordering/lifecycle";
import {
  computeTableBillSplit,
  type DbDishForPricing,
  priceOrderFromDatabase,
} from "@/lib/ordering/pricing";
import {
  buildKitchenDietarySafetyNote,
  buildTableAccessGrant,
  decodeSignedSessionList,
  encodeSignedSessionList,
  isAuthorizedForTableOrdering,
  isTableSessionExpired,
} from "@/lib/ordering/session";
import { generateTableQrToken } from "@/lib/qr";

describe("Phase 5 Ordering — Server Pricing, Bill Split, Transitions, Atomic Fee Ledger & Safety Notes", () => {
  it("computes prices strictly from DB, ignores tampered client assumptions, and rejects invalid dishes/modifiers", () => {
    const dishesById = new Map<string, DbDishForPricing>([
      [
        "dish_hummus",
        {
          id: "dish_hummus",
          restaurantId: "rest_1",
          nameEn: "Classic Hummus",
          nameAr: "حمص",
          priceAed: "22.00",
          isPublished: true,
          isAvailable: true,
          modifiers: [],
        },
      ],
      [
        "dish_manakish",
        {
          id: "dish_manakish",
          restaurantId: "rest_1",
          nameEn: "Manakish Zaatar & Cheese",
          nameAr: "منقوشة",
          priceAed: "18.00",
          isPublished: true,
          isAvailable: true,
          modifiers: [
            {
              id: "mod_no_cheese",
              menuItemId: "dish_manakish",
              nameEn: "Without cheese",
              nameAr: "بدون جبنة",
              priceDeltaAed: "-2.00",
              removesAllergens: ["milk"],
              addsDietTags: ["vegan"],
            },
          ],
        },
      ],
      [
        "dish_other_rest",
        {
          id: "dish_other_rest",
          restaurantId: "rest_2",
          nameEn: "Foreign Dish",
          nameAr: "طبق آخر",
          priceAed: "10.00",
          isPublished: true,
          isAvailable: true,
          modifiers: [],
        },
      ],
      [
        "dish_draft",
        {
          id: "dish_draft",
          restaurantId: "rest_1",
          nameEn: "Unpublished Dish",
          nameAr: "مسودة",
          priceAed: "15.00",
          isPublished: false,
          isAvailable: true,
          modifiers: [],
        },
      ],
    ]);

    // Valid pricing: 2x Hummus (44.00) + 1x Manakish without cheese (16.00) = AED 60.00
    const valid = priceOrderFromDatabase({
      restaurantId: "rest_1",
      dishesById,
      draftLines: [
        { menuItemId: "dish_hummus", modifierIds: [], quantity: 2, participantId: null },
        {
          menuItemId: "dish_manakish",
          modifierIds: ["mod_no_cheese"],
          quantity: 1,
          participantId: "p_bilal",
          participantName: "Bilal",
        },
      ],
    });

    assert.equal(valid.ok, true);
    if (valid.ok) {
      assert.equal(valid.subtotalAed, "60.00");
      assert.equal(valid.lines[0]!.lineTotalAed, "44.00");
      assert.equal(valid.lines[1]!.unitPriceAed, "16.00");
    }

    // Reject dish belonging to another restaurant
    const wrongRest = priceOrderFromDatabase({
      restaurantId: "rest_1",
      dishesById,
      draftLines: [{ menuItemId: "dish_other_rest", modifierIds: [], quantity: 1 }],
    });
    assert.equal(wrongRest.ok, false);
    if (!wrongRest.ok) assert.equal(wrongRest.code, "DISH_WRONG_RESTAURANT");

    // Reject unpublished dish
    const unpublished = priceOrderFromDatabase({
      restaurantId: "rest_1",
      dishesById,
      draftLines: [{ menuItemId: "dish_draft", modifierIds: [], quantity: 1 }],
    });
    assert.equal(unpublished.ok, false);
    if (!unpublished.ok) assert.equal(unpublished.code, "DISH_UNAVAILABLE");

    // Reject modifier belonging to a different dish
    const wrongMod = priceOrderFromDatabase({
      restaurantId: "rest_1",
      dishesById,
      draftLines: [{ menuItemId: "dish_hummus", modifierIds: ["mod_no_cheese"], quantity: 1 }],
    });
    assert.equal(wrongMod.ok, false);
    if (!wrongMod.ok) assert.equal(wrongMod.code, "MODIFIER_INVALID");
  });

  it("splits shared table dishes evenly in integer fils without losing a single fil", () => {
    const split = computeTableBillSplit({
      participants: [
        { id: "p1", displayName: "Claude" },
        { id: "p2", displayName: "Bilal" },
        { id: "p3", displayName: "James" },
      ],
      lines: [
        { participantId: null, lineTotalFils: 2500 }, // AED 25.00 shared -> 834 + 833 + 833
        { participantId: "p1", lineTotalFils: 2900 }, // Claude personal AED 29.00
        { participantId: "p2", lineTotalFils: 4400 }, // Bilal personal AED 44.00
        { participantId: "p3", lineTotalFils: 2800 }, // James personal AED 28.00
      ],
    });

    assert.equal(split.totalAed, "126.00");
    assert.equal(split.sharedPoolFils, 2500);
    assert.equal(split.shares[0]!.totalAed, "37.34"); // 2900 + 834
    assert.equal(split.shares[1]!.totalAed, "52.33"); // 4400 + 833
    assert.equal(split.shares[2]!.totalAed, "36.33"); // 2800 + 833
    assert.equal(
      split.shares.reduce((s, x) => s + x.totalFils, 0),
      12600,
    );
  });

  it("enforces valid status transitions and rejects illegal state jumps", () => {
    assert.deepEqual(validateOrderStatusTransition("SENT", "ACCEPTED"), {
      ok: true,
      idempotentNoop: false,
    });
    assert.deepEqual(validateOrderStatusTransition("ACCEPTED", "ACCEPTED"), {
      ok: true,
      idempotentNoop: true,
    });
    assert.deepEqual(validateOrderStatusTransition("ACCEPTED", "PREPARING"), {
      ok: true,
      idempotentNoop: false,
    });
    assert.deepEqual(validateOrderStatusTransition("PREPARING", "SERVED"), {
      ok: true,
      idempotentNoop: false,
    });
    assert.deepEqual(validateOrderStatusTransition("PREPARING", "CANCELLED"), {
      ok: true,
      idempotentNoop: false,
    });

    // Reject illegal transitions
    assert.equal(validateOrderStatusTransition("SERVED", "SENT").ok, false);
    assert.equal(validateOrderStatusTransition("SERVED", "CANCELLED").ok, false);
    assert.equal(validateOrderStatusTransition("CANCELLED", "ACCEPTED").ok, false);
    assert.equal(validateOrderStatusTransition("SENT", "SERVED").ok, false);
  });

  it("formats kitchen dietary safety notes, verifies session TTL, and signs table access cookies", () => {
    const note = buildKitchenDietarySafetyNote({
      participantName: "Bilal",
      allergens: ["milk"],
      dietaryRestrictions: ["halal"],
      selectedModifierNamesEn: ["Without yogurt"],
    });
    assert.equal(note, "Bilal: no milk, halal — modifier 'Without yogurt' selected");

    const now = Date.now();
    assert.equal(isTableSessionExpired(new Date(now - 3 * 3600_000), 4, now), false);
    assert.equal(isTableSessionExpired(new Date(now - 5 * 3600_000), 4, now), true);

    const secret = "unit-test-secret-at-least-32-characters!";
    const cookie = encodeSignedSessionList(["sess_1", "sess_2"], secret);
    assert.deepEqual(decodeSignedSessionList(cookie, secret), ["sess_1", "sess_2"]);
    assert.deepEqual(decodeSignedSessionList(`${cookie}tamper`, secret), []);

    // Per-table 128-bit QR token authorization & immediate revocation on token rotation
    const tokenA = generateTableQrToken();
    const tokenB = generateTableQrToken();
    assert.equal(tokenA.length, 32);
    assert.equal(
      isAuthorizedForTableOrdering({
        providedToken: null,
        expectedTableQrToken: tokenA,
        cookieEntries: [],
        sessionId: "sess_1",
      }),
      false,
    );
    assert.equal(
      isAuthorizedForTableOrdering({
        providedToken: tokenA,
        expectedTableQrToken: tokenA,
        cookieEntries: [],
        sessionId: "sess_1",
      }),
      true,
    );
    const grantA = buildTableAccessGrant("sess_1", tokenA);
    assert.equal(
      isAuthorizedForTableOrdering({
        providedToken: null,
        expectedTableQrToken: tokenA,
        cookieEntries: [grantA],
        sessionId: "sess_1",
      }),
      true,
    );
    // Once table QR token rotates to tokenB, old cookie grantA is immediately rejected!
    assert.equal(
      isAuthorizedForTableOrdering({
        providedToken: null,
        expectedTableQrToken: tokenB,
        cookieEntries: [grantA],
        sessionId: "sess_1",
      }),
      false,
    );
  });

  it("records atomic idempotent PlatformFee on ACCEPTED, skips fee on cancel-before-accept, and voids fee on cancel-after-accept", async () => {
    const env = await startEphemeralPrismaPostgres();

    try {
      await env.prisma.platformSetting.create({
        data: {
          id: "default",
          feePercentage: "10.00",
          feeCapAed: "1.00",
          currency: "AED",
          tableSessionTtlHours: 4,
        },
      });

      const owner = await env.prisma.user.create({
        data: {
          email: "owner@example.com",
          name: "Owner",
          role: "RESTAURANT_OWNER",
        },
      });

      const rest = await env.prisma.restaurant.create({
        data: {
          slug: "test-kitchen",
          nameEn: "Test Kitchen",
          nameAr: "مطبخ اختبار",
          status: "APPROVED",
          ownerId: owner.id,
        },
      });

      const table = await env.prisma.diningTable.create({
        data: {
          restaurantId: rest.id,
          tableCode: "T1",
          displayName: "Table 1",
        },
      });

      const session = await env.prisma.tableSession.create({
        data: {
          restaurantId: rest.id,
          tableId: table.id,
          shareCode: "share_test_1",
        },
      });

      // Case 1: AED 5.00 order -> ACCEPTED -> fee = AED 0.50; double-accept creates ONLY 1 fee and returns ok
      const order5 = await env.prisma.order.create({
        data: {
          restaurantId: rest.id,
          tableSessionId: session.id,
          tableId: table.id,
          status: "SENT",
          subtotalAed: "5.00",
        },
      });

      const accept1 = await transitionOrderStatusAtomically({
        db: env.prisma,
        restaurantId: rest.id,
        orderId: order5.id,
        nextStatus: "ACCEPTED",
      });
      assert.equal(accept1.ok, true);
      if (accept1.ok) {
        assert.equal(accept1.idempotentNoop, false);
        assert.equal(accept1.order.platformFee?.feeAmountAed.toFixed(2), "0.50");
        assert.equal(accept1.order.platformFee?.isVoided, false);
      }

      // Double-click / second staff clicking Accept: idempotent no-op, no duplicate fee, no error!
      const accept2 = await transitionOrderStatusAtomically({
        db: env.prisma,
        restaurantId: rest.id,
        orderId: order5.id,
        nextStatus: "ACCEPTED",
      });
      assert.equal(accept2.ok, true);
      if (accept2.ok) {
        assert.equal(accept2.idempotentNoop, true);
      }
      assert.equal(await env.prisma.platformFee.count({ where: { orderId: order5.id } }), 1);

      // Progress order5 -> PREPARING -> SERVED, then verify SERVED -> CANCELLED is rejected
      await transitionOrderStatusAtomically({
        db: env.prisma,
        restaurantId: rest.id,
        orderId: order5.id,
        nextStatus: "PREPARING",
      });
      await transitionOrderStatusAtomically({
        db: env.prisma,
        restaurantId: rest.id,
        orderId: order5.id,
        nextStatus: "SERVED",
      });
      const illegalCancelAfterServed = await transitionOrderStatusAtomically({
        db: env.prisma,
        restaurantId: rest.id,
        orderId: order5.id,
        nextStatus: "CANCELLED",
      });
      assert.equal(illegalCancelAfterServed.ok, false);

      // Case 2: AED 80.00 order -> ACCEPTED -> fee capped at AED 1.00 -> then CANCELLED -> fee isVoided = true!
      const order80 = await env.prisma.order.create({
        data: {
          restaurantId: rest.id,
          tableSessionId: session.id,
          tableId: table.id,
          status: "SENT",
          subtotalAed: "80.00",
        },
      });

      const accept80 = await transitionOrderStatusAtomically({
        db: env.prisma,
        restaurantId: rest.id,
        orderId: order80.id,
        nextStatus: "ACCEPTED",
      });
      assert.equal(accept80.ok, true);
      if (accept80.ok) {
        assert.equal(accept80.order.platformFee?.feeAmountAed.toFixed(2), "1.00");
        assert.equal(accept80.order.platformFee?.isVoided, false);
      }

      const cancelAfterAccept = await transitionOrderStatusAtomically({
        db: env.prisma,
        restaurantId: rest.id,
        orderId: order80.id,
        nextStatus: "CANCELLED",
        cancelReason: "Guest changed mind",
      });
      assert.equal(cancelAfterAccept.ok, true);
      if (cancelAfterAccept.ok) {
        assert.equal(cancelAfterAccept.order.status, "CANCELLED");
        assert.equal(cancelAfterAccept.order.platformFee?.isVoided, true);
        assert.ok(cancelAfterAccept.order.platformFee?.voidedAt);
      }

      // Case 3: Cancel BEFORE accept (SENT -> CANCELLED) -> ZERO PlatformFee row created!
      const orderCancelledEarly = await env.prisma.order.create({
        data: {
          restaurantId: rest.id,
          tableSessionId: session.id,
          tableId: table.id,
          status: "SENT",
          subtotalAed: "45.00",
        },
      });

      const cancelEarly = await transitionOrderStatusAtomically({
        db: env.prisma,
        restaurantId: rest.id,
        orderId: orderCancelledEarly.id,
        nextStatus: "CANCELLED",
        cancelReason: "Spam guest order",
      });
      assert.equal(cancelEarly.ok, true);
      assert.equal(
        await env.prisma.platformFee.count({ where: { orderId: orderCancelledEarly.id } }),
        0,
      );

      // Case 4: Shared table double-submit protection — two members pressing Send on the same carts
      // create ONLY 1 order; the second gets "Order already sent" with the same order id!
      const cat = await env.prisma.menuCategory.create({
        data: { restaurantId: rest.id, nameEn: "Mezze", nameAr: "مقبلات" },
      });
      const hummus = await env.prisma.menuItem.create({
        data: {
          restaurantId: rest.id,
          categoryId: cat.id,
          nameEn: "Hummus",
          nameAr: "حمص",
          priceAed: "22.00",
          isPublished: true,
          isAvailable: true,
        },
      });
      await env.prisma.tableParticipant.create({
        data: {
          tableSessionId: session.id,
          displayName: "Claude",
          cartItems: [{ menuItemId: hummus.id, modifierIds: [], quantity: 2 }],
        },
      });

      const orderCountBefore = await env.prisma.order.count({
        where: { tableSessionId: session.id },
      });

      const firstSubmit = await submitSharedTableCartAtomically({
        db: env.prisma,
        restaurantId: rest.id,
        tableId: table.id,
        tableSessionId: session.id,
        placedByProfileId: null,
        placedByGuestToken: "gst_claude",
      });
      assert.equal(firstSubmit.ok, true);
      if (firstSubmit.ok) {
        assert.equal(firstSubmit.alreadySent, false);
        assert.equal(firstSubmit.order.subtotalAed, "44.00");
      }

      const secondSubmit = await submitSharedTableCartAtomically({
        db: env.prisma,
        restaurantId: rest.id,
        tableId: table.id,
        tableSessionId: session.id,
        placedByProfileId: null,
        placedByGuestToken: "gst_bilal",
      });
      assert.equal(secondSubmit.ok, true);
      if (firstSubmit.ok && secondSubmit.ok) {
        assert.equal(secondSubmit.alreadySent, true);
        assert.equal(secondSubmit.message, "Order already sent");
        assert.equal(secondSubmit.order.id, firstSubmit.order.id);
      }

      const orderCountAfter = await env.prisma.order.count({
        where: { tableSessionId: session.id },
      });
      assert.equal(orderCountAfter - orderCountBefore, 1);
    } finally {
      await env.stop();
    }
  });
});
