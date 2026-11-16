import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { httpStatusForAgentError } from "@/lib/agents/gemini";
import { runMenuAssistantAgent } from "@/lib/agents/menu-assistant";
import { getVerifiedGuestToken } from "@/lib/auth/guest";
import { prisma } from "@/lib/db";
import { getActiveDinerProfile } from "@/lib/diner/profile";
import type { EngineDinerProfile, EngineDishInput } from "@/lib/engine/menu-engine";
import { normalizeAllergenList, normalizeDietTagList, SPICE_LEVELS } from "@/lib/menu/taxonomy";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const profileOverrideSchema = z
  .object({
    displayName: z.string().trim().max(80).optional(),
    dietaryRestrictions: z.array(z.string()).max(10).default([]),
    allergens: z.array(z.string()).max(20).default([]),
    likedIngredients: z.array(z.string().max(50)).max(20).default([]),
    dislikedIngredients: z.array(z.string().max(50)).max(20).default([]),
    spiceTolerance: z.enum(SPICE_LEVELS).default("MEDIUM"),
    maxBudgetAed: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/)
      .nullable()
      .optional(),
    preferHighProtein: z.boolean().default(false),
    preferKeto: z.boolean().default(false),
  })
  .optional();

const assistantRequestSchema = z.object({
  question: z.string().trim().min(2).max(600),
  locale: z.enum(["en", "ar"]).default("en"),
  tableCode: z.string().trim().max(32).optional(),
  currentCartTotalFils: z.number().int().min(0).max(10_000_000).default(0),
  profileOverride: profileOverrideSchema,
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ restaurantSlug: string }> },
) {
  const { restaurantSlug } = await context.params;

  const clientIp = getClientIp(req.headers);
  const ipLimit = checkRateLimit({
    key: `ai:assistant:ip:${clientIp}`,
    limit: 15,
    windowMs: 10 * 60 * 1000,
  });
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "Too many Menu Assistant questions. Please wait a moment and try again." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = assistantRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please enter a valid question." }, { status: 400 });
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: restaurantSlug },
    include: {
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

  if (!restaurant || restaurant.status !== "APPROVED") {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  const [activeDiner, guestToken] = await Promise.all([
    getActiveDinerProfile(),
    getVerifiedGuestToken(),
  ]);

  const callerKey = activeDiner.userId
    ? `user:${activeDiner.userId}`
    : guestToken
      ? `guest:${guestToken}`
      : null;

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
      modifiers: item.modifiers.map((mod) => ({
        id: mod.id,
        nameEn: mod.nameEn,
        nameAr: mod.nameAr,
        priceDeltaAed: mod.priceDeltaAed.toFixed(2),
        removesAllergens: mod.removesAllergens,
        addsDietTags: mod.addsDietTags,
        verificationStatus: mod.verificationStatus,
      })),
    })),
  );

  const override = parsed.data.profileOverride;
  const effectiveProfile: EngineDinerProfile = override
    ? {
        displayName: override.displayName || activeDiner.profile?.displayName || "Guest",
        dietaryRestrictions: normalizeDietTagList(override.dietaryRestrictions),
        allergens: normalizeAllergenList(override.allergens),
        likedIngredients: override.likedIngredients,
        dislikedIngredients: override.dislikedIngredients,
        spiceTolerance: override.spiceTolerance,
        maxBudgetAed: override.maxBudgetAed ?? null,
        preferHighProtein: override.preferHighProtein,
        preferKeto: override.preferKeto,
        pastRatingsByDishId: activeDiner.profile?.pastRatingsByDishId ?? {},
      }
    : {
        displayName: activeDiner.profile?.displayName ?? "Guest",
        dietaryRestrictions: activeDiner.profile?.dietaryRestrictions ?? [],
        allergens: activeDiner.profile?.allergens ?? [],
        likedIngredients: activeDiner.profile?.likedIngredients ?? [],
        dislikedIngredients: activeDiner.profile?.dislikedIngredients ?? [],
        spiceTolerance: activeDiner.profile?.spiceTolerance ?? "MEDIUM",
        maxBudgetAed: activeDiner.profile?.maxBudgetAed ?? null,
        preferHighProtein: activeDiner.profile?.preferHighProtein ?? false,
        preferKeto: activeDiner.profile?.preferKeto ?? false,
        pastRatingsByDishId: activeDiner.profile?.pastRatingsByDishId ?? {},
      };

  const result = await runMenuAssistantAgent({
    question: parsed.data.question,
    locale: parsed.data.locale,
    restaurantId: restaurant.id,
    restaurantSlug: restaurant.slug,
    tableCode: parsed.data.tableCode,
    dishes: engineDishes,
    profile: effectiveProfile,
    currentCartTotalFils: parsed.data.currentCartTotalFils,
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
