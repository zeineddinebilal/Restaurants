import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createSignedGuestCookieValue,
  GUEST_COOKIE_NAME,
  verifySignedGuestCookieValue,
} from "@/lib/auth/guest";
import { prisma } from "@/lib/db";
import { getActiveDinerProfile } from "@/lib/diner/profile";
import { submitSharedTableCartAtomically } from "@/lib/ordering/cart-submit";
import { emitOrderChanged } from "@/lib/ordering/lifecycle";
import { type OrderDraftLineInput, priceOrderFromDatabase } from "@/lib/ordering/pricing";
import {
  buildKitchenDietarySafetyNote,
  buildTableAccessGrant,
  decodeSignedSessionList,
  encodeSignedSessionList,
  getOrCreateOpenTableSession,
  isAuthorizedForTableOrdering,
  TABLE_ACCESS_COOKIE_NAME,
} from "@/lib/ordering/session";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

// Client prices/totals are intentionally excluded from the schema and never trusted.
const createOrderSchema = z.object({
  k: z.string().optional(),
  notes: z.string().trim().max(400).optional(),
  lines: z
    .array(
      z.object({
        menuItemId: z.string().min(1),
        modifierIds: z.array(z.string().min(1)).max(10).default([]),
        quantity: z.number().int().min(1).max(20),
        participantId: z.string().nullable().optional(),
        participantName: z.string().trim().max(60).nullable().optional(),
        specialInstructions: z.string().trim().max(240).nullable().optional(),
      }),
    )
    .max(50)
    .optional(),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ restaurantSlug: string; tableCode: string }> },
) {
  const { restaurantSlug, tableCode } = await context.params;

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
    },
  });

  if (!restaurant || restaurant.status === "SUSPENDED" || restaurant.tables.length === 0) {
    return NextResponse.json({ error: "Restaurant or table not found." }, { status: 404 });
  }

  const table = restaurant.tables[0]!;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = createOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const session = await getOrCreateOpenTableSession({
    restaurantId: restaurant.id,
    tableId: table.id,
  });

  const cookieEntries = decodeSignedSessionList(req.cookies.get(TABLE_ACCESS_COOKIE_NAME)?.value);
  const providedK = parsed.data.k || req.nextUrl.searchParams.get("k");

  // Require valid per-table secret `k` OR valid signed `pf_table_access` cookie bound to `(session.id, table.qrToken)`
  if (
    !isAuthorizedForTableOrdering({
      providedToken: providedK,
      expectedTableQrToken: table.qrToken,
      cookieEntries,
      sessionId: session.id,
    })
  ) {
    return NextResponse.json({ error: "Scan the QR at your table to order." }, { status: 403 });
  }

  const clientIp = getClientIp(req.headers);
  const activeDiner = await getActiveDinerProfile();

  let newlySignedGuestCookie: string | null = null;
  let guestToken =
    activeDiner.guestToken ??
    verifySignedGuestCookieValue(req.cookies.get(GUEST_COOKIE_NAME)?.value);
  if (!activeDiner.isAuthenticated && !guestToken) {
    newlySignedGuestCookie = createSignedGuestCookieValue();
    guestToken = verifySignedGuestCookieValue(newlySignedGuestCookie)!;
  }

  const callerKey = activeDiner.userId ? `user:${activeDiner.userId}` : `guest:${guestToken}`;

  const callerLimit = checkRateLimit({
    key: `order:caller:${callerKey}`,
    limit: 8,
    windowMs: 10 * 60 * 1000,
  });
  const tableLimit = checkRateLimit({
    key: `order:table:${table.id}`,
    limit: 12,
    windowMs: 10 * 60 * 1000,
  });
  const ipLimit = checkRateLimit({
    key: `order:ip:${clientIp}`,
    limit: 15,
    windowMs: 10 * 60 * 1000,
  });

  if (!callerLimit.allowed || !tableLimit.allowed || !ipLimit.allowed) {
    return NextResponse.json(
      { error: "Too many orders sent in a short period. Please check with your server." },
      { status: 429 },
    );
  }

  const grant = buildTableAccessGrant(session.id, table.qrToken);
  const signedAccessCookie = encodeSignedSessionList([...cookieEntries, grant]);

  function attachCookies(res: NextResponse): NextResponse {
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

  // Path A: Shared table cart submission (no explicit `lines` array) -> atomic CAS double-submit protection!
  if (!parsed.data.lines || parsed.data.lines.length === 0) {
    const cartResult = await submitSharedTableCartAtomically({
      db: prisma,
      restaurantId: restaurant.id,
      tableId: table.id,
      tableSessionId: session.id,
      placedByProfileId: activeDiner.profile?.id ?? null,
      placedByGuestToken: activeDiner.isAuthenticated ? null : guestToken,
      callerFallbackAllergens: activeDiner.profile?.allergens ?? [],
      callerFallbackDiets: activeDiner.profile?.dietaryRestrictions ?? [],
      notes: parsed.data.notes || null,
    });

    if (!cartResult.ok) {
      return NextResponse.json(
        { error: cartResult.error, code: cartResult.code },
        { status: cartResult.status },
      );
    }

    return attachCookies(
      NextResponse.json(
        {
          alreadySent: cartResult.alreadySent,
          message: cartResult.message,
          order: cartResult.order,
        },
        { status: cartResult.alreadySent ? 200 : 201 },
      ),
    );
  }

  // Path B: Explicit `lines` submission (reloaded & priced strictly from DB)
  const participants = await prisma.tableParticipant.findMany({
    where: { tableSessionId: session.id },
    include: { dinerProfile: true },
  });
  const participantById = new Map(participants.map((p) => [p.id, p]));

  const draftLines: OrderDraftLineInput[] = parsed.data.lines.map((l) => {
    const matchedPart = l.participantId ? participantById.get(l.participantId) : undefined;
    return {
      menuItemId: l.menuItemId,
      modifierIds: l.modifierIds,
      quantity: l.quantity,
      participantId: matchedPart ? matchedPart.id : null,
      participantName:
        matchedPart?.displayName ||
        l.participantName ||
        activeDiner.profile?.displayName ||
        "Guest Diner",
      specialInstructions: l.specialInstructions ?? null,
    };
  });

  const uniqueDishIds = Array.from(new Set(draftLines.map((l) => l.menuItemId)));
  const dbDishes = await prisma.menuItem.findMany({
    where: { id: { in: uniqueDishIds } },
    include: { modifiers: true },
  });
  const dishesById = new Map(dbDishes.map((d) => [d.id, d]));

  const priced = priceOrderFromDatabase({
    restaurantId: restaurant.id,
    draftLines,
    dishesById,
  });

  if (!priced.ok) {
    return NextResponse.json({ error: priced.message, code: priced.code }, { status: 400 });
  }

  const now = new Date();
  const createdOrder = await prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        restaurantId: restaurant.id,
        tableSessionId: session.id,
        tableId: table.id,
        placedByProfileId: activeDiner.profile?.id ?? null,
        placedByGuestToken: activeDiner.isAuthenticated ? null : guestToken,
        status: "SENT",
        subtotalAed: priced.subtotalAed,
        notes: parsed.data.notes || null,
        sentAt: now,
        items: {
          create: priced.lines.map((line) => {
            const part = line.participantId ? participantById.get(line.participantId) : undefined;
            const allergens =
              part?.dinerProfile?.allergens ??
              (!line.participantId ? [] : (activeDiner.profile?.allergens ?? []));
            const diets =
              part?.dinerProfile?.dietaryRestrictions ??
              (!line.participantId ? [] : (activeDiner.profile?.dietaryRestrictions ?? []));

            const kitchenSafetyNote = buildKitchenDietarySafetyNote({
              participantName: line.participantName,
              allergens,
              dietaryRestrictions: diets,
              selectedModifierNamesEn: line.selectedModifiers.map((m) => m.nameEn),
              manualNote: line.specialInstructions,
            });

            return {
              menuItemId: line.menuItemId,
              participantId: line.participantId,
              participantName: line.participantName,
              quantity: line.quantity,
              unitPriceAed: line.unitPriceAed,
              lineTotalAed: line.lineTotalAed,
              selectedModifiers: line.selectedModifiers as unknown as Prisma.InputJsonValue,
              specialInstructions: kitchenSafetyNote,
            };
          }),
        },
      },
    });

    await tx.tableSession.update({
      where: { id: session.id },
      data: { lastActivityAt: now },
    });

    return order;
  });

  emitOrderChanged({
    restaurantId: restaurant.id,
    orderId: createdOrder.id,
    status: "SENT",
  });

  return attachCookies(
    NextResponse.json(
      {
        order: {
          id: createdOrder.id,
          orderNumber: createdOrder.orderNumber,
          status: createdOrder.status,
          subtotalAed: createdOrder.subtotalAed.toFixed(2),
        },
      },
      { status: 201 },
    ),
  );
}
