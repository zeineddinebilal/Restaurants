import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createSignedGuestCookieValue,
  GUEST_COOKIE_NAME,
  verifySignedGuestCookieValue,
} from "@/lib/auth/guest";
import { prisma } from "@/lib/db";
import { getActiveDinerProfile } from "@/lib/diner/profile";
import { type EngineDishInput, evaluateGroupSharedDishes } from "@/lib/engine/menu-engine";
import { computeTableBillSplit, priceOrderFromDatabase } from "@/lib/ordering/pricing";
import {
  decodeSignedSessionList,
  encodeSignedSessionList,
  getOrCreateOpenTableSession,
  TABLE_ACCESS_COOKIE_NAME,
} from "@/lib/ordering/session";

const cartLineSchema = z.object({
  menuItemId: z.string().min(1),
  modifierIds: z.array(z.string().min(1)).max(10).default([]),
  quantity: z.number().int().min(1).max(20),
  forSharedTable: z.boolean().default(false),
  specialInstructions: z.string().trim().max(240).optional(),
});

const sessionMutationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("join_demo_friends"),
  }),
  z.object({
    action: z.literal("update_cart"),
    participantId: z.string().min(1),
    cartItems: z.array(cartLineSchema).max(30),
  }),
]);

export interface StoredParticipantCartLine {
  menuItemId: string;
  modifierIds: string[];
  quantity: number;
  forSharedTable?: boolean;
  specialInstructions?: string;
}

function parseParticipantCart(raw: unknown): StoredParticipantCartLine[] {
  if (!Array.isArray(raw)) return [];
  const parsed = z.array(cartLineSchema).safeParse(raw);
  return parsed.success ? parsed.data : [];
}

async function resolveRestaurantAndTable(restaurantSlug: string, tableCode: string) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: restaurantSlug },
    include: {
      tables: {
        where: {
          tableCode: { equals: tableCode, mode: "insensitive" },
          isActive: true,
        },
        take: 1,
      },
      categories: {
        orderBy: { sortOrder: "asc" },
        include: {
          items: {
            where: { isPublished: true, isAvailable: true },
            orderBy: { createdAt: "asc" },
            include: { modifiers: { orderBy: { createdAt: "asc" } } },
          },
        },
      },
    },
  });

  if (!restaurant || restaurant.status === "SUSPENDED" || restaurant.tables.length === 0) {
    return null;
  }

  return { restaurant, table: restaurant.tables[0]! };
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ restaurantSlug: string; tableCode: string }> },
) {
  const { restaurantSlug, tableCode } = await context.params;
  const resolved = await resolveRestaurantAndTable(restaurantSlug, tableCode);
  if (!resolved) {
    return NextResponse.json({ error: "Table not found" }, { status: 404 });
  }

  const { restaurant, table } = resolved;
  const session = await getOrCreateOpenTableSession({
    restaurantId: restaurant.id,
    tableId: table.id,
  });

  const activeDiner = await getActiveDinerProfile();
  let newlySignedGuestCookie: string | null = null;
  let guestToken =
    activeDiner.guestToken ??
    verifySignedGuestCookieValue(req.cookies.get(GUEST_COOKIE_NAME)?.value);

  if (!activeDiner.isAuthenticated && !guestToken) {
    newlySignedGuestCookie = createSignedGuestCookieValue();
    guestToken = verifySignedGuestCookieValue(newlySignedGuestCookie)!;
  }

  // Ensure current diner/guest has a participant row on this open TableSession
  let selfParticipant = await prisma.tableParticipant.findFirst({
    where: {
      tableSessionId: session.id,
      ...(activeDiner.profile?.id
        ? { dinerProfileId: activeDiner.profile.id }
        : { guestToken: guestToken! }),
    },
  });

  if (!selfParticipant) {
    selfParticipant = await prisma.tableParticipant.create({
      data: {
        tableSessionId: session.id,
        dinerProfileId: activeDiner.profile?.id ?? null,
        guestToken: activeDiner.isAuthenticated ? null : guestToken,
        displayName: activeDiner.profile?.displayName || "Guest Diner",
        cartItems: [],
      },
    });
  }

  const participants = await prisma.tableParticipant.findMany({
    where: { tableSessionId: session.id },
    orderBy: { joinedAt: "asc" },
    include: { dinerProfile: true },
  });

  // Build dishes map for server-side pricing & group engine
  const allDbDishes = restaurant.categories.flatMap((c) => c.items);
  const dishesById = new Map(allDbDishes.map((d) => [d.id, d]));

  const engineDishes: EngineDishInput[] = restaurant.categories.flatMap((cat) =>
    cat.items.map((item) => ({
      id: item.id,
      categoryId: cat.id,
      categoryNameEn: cat.nameEn,
      categoryNameAr: cat.nameAr,
      nameEn: item.nameEn,
      nameAr: item.nameAr,
      descriptionEn: item.descriptionEn,
      descriptionAr: item.descriptionAr,
      priceAed: item.priceAed.toFixed(2),
      portionSize: item.portionSize,
      ingredientsEn: item.ingredientsEn,
      ingredientsAr: item.ingredientsAr,
      dietTags: item.dietTags,
      allergens: item.allergens,
      allergenDataProvided: item.allergenDataProvided,
      spiceLevel: item.spiceLevel,
      meatType: item.meatType,
      verificationStatus: item.verificationStatus,
      isAvailable: item.isAvailable,
      isPopular: item.isPopular,
      isPublished: item.isPublished,
      cachedBlurbEn: item.cachedBlurbEn,
      cachedBlurbAr: item.cachedBlurbAr,
      imageUrl: item.imageUrl,
      modifiers: item.modifiers.map((m) => ({
        id: m.id,
        nameEn: m.nameEn,
        nameAr: m.nameAr,
        priceDeltaAed: m.priceDeltaAed.toFixed(2),
        removesAllergens: m.removesAllergens,
        addsDietTags: m.addsDietTags,
        verificationStatus: m.verificationStatus,
      })),
    })),
  );

  // Collect all draft cart lines across participants and price them server-side
  const combinedDrafts = participants.flatMap((p) => {
    const cart = parseParticipantCart(p.cartItems);
    return cart.map((line) => ({
      menuItemId: line.menuItemId,
      modifierIds: line.modifierIds,
      quantity: line.quantity,
      participantId: line.forSharedTable ? null : p.id,
      participantName: line.forSharedTable ? "Shared Table" : p.displayName,
      specialInstructions: line.specialInstructions ?? null,
    }));
  });

  const pricedDraft =
    combinedDrafts.length > 0
      ? priceOrderFromDatabase({
          restaurantId: restaurant.id,
          draftLines: combinedDrafts,
          dishesById,
        })
      : null;

  const validPricedLines = pricedDraft && pricedDraft.ok ? pricedDraft.lines : [];
  const billSplit = computeTableBillSplit({
    participants: participants.map((p) => ({ id: p.id, displayName: p.displayName })),
    lines: validPricedLines.map((l) => ({
      participantId: l.participantId,
      lineTotalFils: l.lineTotalFils,
    })),
  });

  // Per-participant personal cart total in fils for remaining-budget engine evaluation
  const personalFilsByParticipant = new Map(
    billSplit.shares.map((s) => [s.participantId, s.totalFils]),
  );

  const groupEngine = evaluateGroupSharedDishes({
    dishes: engineDishes,
    participants: participants.map((p) => ({
      id: p.id,
      name: p.displayName,
      cartTotalFils: personalFilsByParticipant.get(p.id) ?? 0,
      profile: {
        displayName: p.displayName,
        dietaryRestrictions: p.dinerProfile?.dietaryRestrictions ?? [],
        allergens: p.dinerProfile?.allergens ?? [],
        likedIngredients: p.dinerProfile?.likedIngredients ?? [],
        dislikedIngredients: p.dinerProfile?.dislikedIngredients ?? [],
        spiceTolerance: p.dinerProfile?.spiceTolerance ?? "MEDIUM",
        maxBudgetAed: p.dinerProfile?.maxBudgetAed ? p.dinerProfile.maxBudgetAed.toFixed(2) : null,
        preferHighProtein: p.dinerProfile?.preferHighProtein ?? false,
        preferKeto: p.dinerProfile?.preferKeto ?? false,
      },
    })),
  });

  const recentOrders = await prisma.order.findMany({
    where: { tableSessionId: session.id },
    orderBy: { sentAt: "desc" },
    take: 10,
    select: {
      id: true,
      orderNumber: true,
      status: true,
      subtotalAed: true,
      sentAt: true,
    },
  });

  const existingAccessIds = decodeSignedSessionList(
    req.cookies.get(TABLE_ACCESS_COOKIE_NAME)?.value,
  );
  const signedAccessCookie = encodeSignedSessionList([...existingAccessIds, session.id]);

  const res = NextResponse.json({
    tableSession: {
      id: session.id,
      shareCode: session.shareCode,
      tableCode: table.tableCode,
      tableName: table.displayName,
    },
    selfParticipantId: selfParticipant.id,
    canLoadDemoFriends: process.env.DEMO_MODE === "true" && restaurant.isDemo === true,
    participants: participants.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      dietaryRestrictions: p.dinerProfile?.dietaryRestrictions ?? [],
      allergens: p.dinerProfile?.allergens ?? [],
      maxBudgetAed: p.dinerProfile?.maxBudgetAed ? p.dinerProfile.maxBudgetAed.toFixed(2) : null,
      cartItems: parseParticipantCart(p.cartItems),
    })),
    pricedLines: validPricedLines,
    billSplit,
    sharedDishes: groupEngine.sharedDishes.slice(0, 16),
    recentOrders: recentOrders.map((o) => ({
      ...o,
      subtotalAed: o.subtotalAed.toFixed(2),
    })),
  });

  res.cookies.set(TABLE_ACCESS_COOKIE_NAME, signedAccessCookie, {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 24 * 60 * 60,
  });

  if (newlySignedGuestCookie) {
    res.cookies.set(GUEST_COOKIE_NAME, newlySignedGuestCookie, {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60,
    });
  }

  return res;
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ restaurantSlug: string; tableCode: string }> },
) {
  const { restaurantSlug, tableCode } = await context.params;
  const resolved = await resolveRestaurantAndTable(restaurantSlug, tableCode);
  if (!resolved) {
    return NextResponse.json({ error: "Table not found" }, { status: 404 });
  }

  const { restaurant, table } = resolved;
  const session = await getOrCreateOpenTableSession({
    restaurantId: restaurant.id,
    tableId: table.id,
  });

  // Require caller to hold a valid table session grant (or join via GET first)
  const accessIds = new Set(
    decodeSignedSessionList(req.cookies.get(TABLE_ACCESS_COOKIE_NAME)?.value),
  );

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = sessionMutationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  if (parsed.data.action === "join_demo_friends") {
    if (process.env.DEMO_MODE !== "true" || !restaurant.isDemo) {
      return NextResponse.json({ error: "Demo friends are disabled." }, { status: 403 });
    }

    const demoUsers = await prisma.user.findMany({
      where: {
        email: { in: ["claude@example.com", "bilal@example.com", "james@example.com"] },
      },
      include: { dinerProfile: true },
    });

    for (const u of demoUsers) {
      if (!u.dinerProfile) continue;
      const existing = await prisma.tableParticipant.findFirst({
        where: {
          tableSessionId: session.id,
          dinerProfileId: u.dinerProfile.id,
        },
      });
      if (!existing) {
        await prisma.tableParticipant.create({
          data: {
            tableSessionId: session.id,
            dinerProfileId: u.dinerProfile.id,
            displayName: u.dinerProfile.displayName,
            cartItems: [],
          },
        });
      }
    }

    await prisma.tableSession.update({
      where: { id: session.id },
      data: { lastActivityAt: new Date() },
    });

    const res = NextResponse.json({ ok: true });
    res.cookies.set(
      TABLE_ACCESS_COOKIE_NAME,
      encodeSignedSessionList([...Array.from(accessIds), session.id]),
      {
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 24 * 60 * 60,
      },
    );
    return res;
  }

  // action === "update_cart"
  const participant = await prisma.tableParticipant.findFirst({
    where: {
      id: parsed.data.participantId,
      tableSessionId: session.id,
    },
    include: { dinerProfile: true },
  });

  if (!participant) {
    return NextResponse.json({ error: "Participant not found on this table." }, { status: 404 });
  }

  // Verify caller owns this participant OR holds table session access in demo mode for demo friends
  const activeDiner = await getActiveDinerProfile();
  const guestToken = verifySignedGuestCookieValue(req.cookies.get(GUEST_COOKIE_NAME)?.value);
  const ownsParticipant =
    (activeDiner.profile?.id && participant.dinerProfileId === activeDiner.profile.id) ||
    (guestToken && participant.guestToken === guestToken) ||
    (accessIds.has(session.id) && process.env.DEMO_MODE === "true" && restaurant.isDemo);

  if (!ownsParticipant && !accessIds.has(session.id)) {
    return NextResponse.json({ error: "Forbidden participant cart update." }, { status: 403 });
  }

  await prisma.$transaction([
    prisma.tableParticipant.update({
      where: { id: participant.id },
      data: { cartItems: parsed.data.cartItems },
    }),
    prisma.tableSession.update({
      where: { id: session.id },
      data: { lastActivityAt: new Date() },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
