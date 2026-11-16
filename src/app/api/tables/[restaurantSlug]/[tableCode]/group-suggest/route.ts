import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { httpStatusForAgentError } from "@/lib/agents/gemini";
import { runGroupTableAgent } from "@/lib/agents/group-table";
import { verifySignedGuestCookieValue, GUEST_COOKIE_NAME } from "@/lib/auth/guest";
import { prisma } from "@/lib/db";
import { getActiveDinerProfile } from "@/lib/diner/profile";
import type { EngineDishInput } from "@/lib/engine/menu-engine";
import {
  decodeSignedSessionList,
  getOrCreateOpenTableSession,
  isAuthorizedForTableOrdering,
  TABLE_ACCESS_COOKIE_NAME,
} from "@/lib/ordering/session";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const requestSchema = z.object({
  locale: z.enum(["en", "ar"]).default("en"),
  k: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ restaurantSlug: string; tableCode: string }> },
) {
  const { restaurantSlug, tableCode } = await context.params;

  const clientIp = getClientIp(req.headers);
  const ipLimit = checkRateLimit({
    key: `ai:group:ip:${clientIp}`,
    limit: 10,
    windowMs: 10 * 60 * 1000,
  });
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "Too many group suggestion requests. Please wait a moment." },
      { status: 429 },
    );
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }

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

  if (!restaurant || restaurant.status !== "APPROVED" || restaurant.tables.length === 0) {
    return NextResponse.json({ error: "Table not found" }, { status: 404 });
  }

  const table = restaurant.tables[0]!;
  const session = await getOrCreateOpenTableSession({
    restaurantId: restaurant.id,
    tableId: table.id,
  });

  const cookieEntries = decodeSignedSessionList(req.cookies.get(TABLE_ACCESS_COOKIE_NAME)?.value);
  const providedK = parsed.data.k || req.nextUrl.searchParams.get("k");

  if (
    !isAuthorizedForTableOrdering({
      providedToken: providedK,
      expectedTableQrToken: table.qrToken,
      cookieEntries,
      sessionId: session.id,
    })
  ) {
    return NextResponse.json(
      { error: "Scan the QR at your table to request group table suggestions." },
      { status: 403 },
    );
  }

  const activeDiner = await getActiveDinerProfile();
  const guestToken = verifySignedGuestCookieValue(req.cookies.get(GUEST_COOKIE_NAME)?.value);
  const callerKey = activeDiner.userId
    ? `user:${activeDiner.userId}`
    : guestToken
      ? `guest:${guestToken}`
      : null;

  const participants = await prisma.tableParticipant.findMany({
    where: { tableSessionId: session.id },
    orderBy: { joinedAt: "asc" },
    include: { dinerProfile: true },
  });

  if (participants.length === 0) {
    return NextResponse.json(
      { error: "No diners have joined this table session yet." },
      { status: 400 },
    );
  }

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

  const result = await runGroupTableAgent({
    restaurantId: restaurant.id,
    locale: parsed.data.locale,
    dishes: engineDishes,
    participants: participants.map((p) => ({
      id: p.id,
      name: p.displayName,
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
    userId: activeDiner.userId,
    callerKey,
    clientIp,
  });

  if (!result.ok) {
    const status = httpStatusForAgentError(result.reason);
    return NextResponse.json({ error: result.message, reason: result.reason }, { status });
  }

  return NextResponse.json(result.data);
}
