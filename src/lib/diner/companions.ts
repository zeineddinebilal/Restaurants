import type { DinerProfile, Prisma, PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  type EngineDinerProfile,
  type EngineDishInput,
  evaluateGroupSharedDishes,
} from "@/lib/engine/menu-engine";
import { parseCustomAvoidIngredientsJson } from "@/lib/menu/ingredient-synonyms";

export const plannedCartItemSchema = z.object({
  menuItemId: z.string().min(1),
  modifierIds: z.array(z.string().min(1)).max(10).default([]),
  quantity: z.number().int().min(1).max(20),
  forSharedTable: z.boolean().default(false),
  specialInstructions: z.string().trim().max(240).optional(),
});

export type PlannedCartItem = z.infer<typeof plannedCartItemSchema>;

export interface PrivacySafeCompanionView {
  profileId: string;
  displayName: string;
  sharesFullProfile: boolean;
  // Populated ONLY when `sharesFullProfile === true`!
  fullProfile?: {
    dietaryRestrictions: string[];
    allergens: string[];
    customAvoids: string[];
    dislikedIngredients: string[];
    maxBudgetAed: string | null;
  };
}

function canonicalPair(a: string, b: string): { profileAId: string; profileBId: string } {
  return a < b ? { profileAId: a, profileBId: b } : { profileAId: b, profileBId: a };
}

function generateShortInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(6);
  let suffix = "";
  for (let i = 0; i < 6; i++) {
    suffix += alphabet[bytes[i]! % alphabet.length];
  }
  return `DINE-${suffix}`;
}

export function serializeCompanionForViewer(profile: DinerProfile): PrivacySafeCompanionView {
  if (!profile.shareFullProfileWithCompanions) {
    return {
      profileId: profile.id,
      displayName: profile.displayName,
      sharesFullProfile: false,
    };
  }

  const customAvoids = parseCustomAvoidIngredientsJson(profile.customAvoidIngredients).map(
    (c) => c.labelEn,
  );
  return {
    profileId: profile.id,
    displayName: profile.displayName,
    sharesFullProfile: true,
    fullProfile: {
      dietaryRestrictions: profile.dietaryRestrictions,
      allergens: profile.allergens,
      customAvoids,
      dislikedIngredients: profile.dislikedIngredients,
      maxBudgetAed: profile.maxBudgetAed ? profile.maxBudgetAed.toFixed(2) : null,
    },
  };
}

/**
 * Builds an anonymized group summary (e.g. ["1 person vegetarian", "1 dislikes tomatoes"])
 * without attributing restrictions to individual companions who did not opt into full sharing.
 */
export function buildPrivacySafeGroupSummary(profiles: readonly DinerProfile[]): {
  en: string[];
  ar: string[];
} {
  const dietCounts = new Map<string, number>();
  const allergenCounts = new Map<string, number>();
  const customAvoidCounts = new Map<string, { ar: string; count: number }>();
  const dislikeCounts = new Map<string, number>();

  for (const p of profiles) {
    for (const d of p.dietaryRestrictions) {
      dietCounts.set(d, (dietCounts.get(d) ?? 0) + 1);
    }
    for (const a of p.allergens) {
      allergenCounts.set(a, (allergenCounts.get(a) ?? 0) + 1);
    }
    for (const c of parseCustomAvoidIngredientsJson(p.customAvoidIngredients)) {
      const prev = customAvoidCounts.get(c.labelEn) ?? { ar: c.labelAr, count: 0 };
      prev.count += 1;
      customAvoidCounts.set(c.labelEn, prev);
    }
    for (const dis of p.dislikedIngredients) {
      const key = dis.trim().toLowerCase();
      if (key) dislikeCounts.set(key, (dislikeCounts.get(key) ?? 0) + 1);
    }
  }

  const en: string[] = [];
  const ar: string[] = [];

  for (const [diet, n] of dietCounts) {
    const label = diet.replace(/_/g, " ");
    en.push(`${n} ${n === 1 ? "person" : "people"} ${label}`);
    ar.push(`${n} بنظام ${label}`);
  }
  for (const [alg, n] of allergenCounts) {
    en.push(`${n} avoids ${alg.replace(/_/g, " ")}`);
    ar.push(`${n} يتجنب ${alg}`);
  }
  for (const [labelEn, info] of customAvoidCounts) {
    en.push(`${info.count} avoids ${labelEn}`);
    ar.push(`${info.count} يتجنب ${info.ar}`);
  }
  for (const [dis, n] of dislikeCounts) {
    en.push(`${n} dislikes ${dis}`);
    ar.push(`${n} لا يفضل ${dis}`);
  }

  return { en, ar };
}

export function dbProfileToEngineProfile(p: DinerProfile): EngineDinerProfile {
  return {
    displayName: p.displayName,
    dietaryRestrictions: p.dietaryRestrictions,
    allergens: p.allergens,
    customAvoidIngredients: parseCustomAvoidIngredientsJson(p.customAvoidIngredients),
    likedIngredients: p.likedIngredients,
    dislikedIngredients: p.dislikedIngredients,
    spiceTolerance: p.spiceTolerance,
    maxBudgetAed: p.maxBudgetAed ? p.maxBudgetAed.toFixed(2) : null,
    preferHighProtein: p.preferHighProtein,
    preferKeto: p.preferKeto,
  };
}

export async function lookupValidCompanionInvite(code: string, db: PrismaClient = prisma) {
  if (!code) return null;
  return db.companionInvite.findFirst({
    where: {
      code: code.trim().toUpperCase(),
      expiresAt: { gt: new Date() },
    },
    include: {
      inviterProfile: { select: { displayName: true } },
    },
  });
}

export async function createOrGetCompanionInvite(
  inviterProfileId: string,
  db: PrismaClient = prisma,
) {
  const now = new Date();
  const existing = await db.companionInvite.findFirst({
    where: {
      inviterProfileId,
      expiresAt: { gt: new Date(now.getTime() + 60 * 60 * 1000) },
    },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    return existing;
  }

  const code = generateShortInviteCode();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  return db.companionInvite.create({
    data: {
      code,
      inviterProfileId,
      expiresAt,
    },
  });
}

export async function acceptCompanionInvite(
  params: {
    accepterProfileId: string;
    code: string;
  },
  db: PrismaClient = prisma,
) {
  const normalizedCode = params.code.trim().toUpperCase();
  const invite = await db.companionInvite.findUnique({
    where: { code: normalizedCode },
    include: { inviterProfile: true },
  });

  if (!invite || invite.expiresAt.getTime() <= Date.now()) {
    return { ok: false as const, status: 404 as const, error: "Invite code not found or expired." };
  }

  if (invite.inviterProfileId === params.accepterProfileId) {
    return {
      ok: false as const,
      status: 400 as const,
      error: "You cannot accept your own invite.",
    };
  }

  const pair = canonicalPair(invite.inviterProfileId, params.accepterProfileId);
  await db.diningCompanion.upsert({
    where: { profileAId_profileBId: pair },
    update: {},
    create: pair,
  });

  return {
    ok: true as const,
    inviterDisplayName: invite.inviterProfile.displayName,
  };
}

export async function listConnectedCompanions(
  viewerProfileId: string,
  db: PrismaClient = prisma,
): Promise<PrivacySafeCompanionView[]> {
  const links = await db.diningCompanion.findMany({
    where: {
      OR: [{ profileAId: viewerProfileId }, { profileBId: viewerProfileId }],
    },
    include: {
      profileA: true,
      profileB: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return links.map((l) => {
    const other = l.profileAId === viewerProfileId ? l.profileB : l.profileA;
    return serializeCompanionForViewer(other);
  });
}

export async function removeDiningCompanion(
  params: {
    viewerProfileId: string;
    companionProfileId: string;
  },
  db: PrismaClient = prisma,
) {
  const pair = canonicalPair(params.viewerProfileId, params.companionProfileId);
  await db.diningCompanion.deleteMany({
    where: pair,
  });
  return { ok: true as const };
}

export async function createGroupMealPlan(
  params: {
    hostProfileId: string;
    companionProfileIds: readonly string[];
    restaurantId: string;
  },
  db: PrismaClient = prisma,
) {
  const uniqueCompanionIds = Array.from(
    new Set(params.companionProfileIds.filter((id) => id && id !== params.hostProfileId)),
  );

  // Verify every companion is genuinely connected to hostProfileId
  if (uniqueCompanionIds.length > 0) {
    const validLinks = await db.diningCompanion.findMany({
      where: {
        OR: uniqueCompanionIds.map((cid) => canonicalPair(params.hostProfileId, cid)),
      },
    });
    if (validLinks.length !== uniqueCompanionIds.length) {
      return {
        ok: false as const,
        status: 403 as const,
        error: "All selected diners must be in your connected Dining Companions list.",
      };
    }
  }

  const restaurant = await db.restaurant.findUnique({
    where: { id: params.restaurantId },
    select: { id: true, status: true },
  });
  if (!restaurant || restaurant.status !== "APPROVED") {
    return { ok: false as const, status: 404 as const, error: "Approved restaurant not found." };
  }

  const allProfileIds = [params.hostProfileId, ...uniqueCompanionIds];

  // Archive any prior ACTIVE meal plan by this host for this restaurant so the newest plan auto-joins cleanly at QR scan
  const created = await db.$transaction(async (tx) => {
    await tx.mealPlan.updateMany({
      where: {
        hostProfileId: params.hostProfileId,
        restaurantId: params.restaurantId,
        status: "ACTIVE",
      },
      data: { status: "ARCHIVED" },
    });

    return tx.mealPlan.create({
      data: {
        hostProfileId: params.hostProfileId,
        restaurantId: params.restaurantId,
        status: "ACTIVE",
        members: {
          create: allProfileIds.map((pid) => ({
            dinerProfileId: pid,
            plannedItems: [],
          })),
        },
      },
    });
  });

  return { ok: true as const, mealPlanId: created.id };
}

export async function loadMealPlanViewForMember(
  params: {
    mealPlanId: string;
    viewerProfileId: string;
  },
  db: PrismaClient = prisma,
) {
  const plan = await db.mealPlan.findUnique({
    where: { id: params.mealPlanId },
    include: {
      restaurant: {
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
      },
      members: {
        orderBy: { createdAt: "asc" },
        include: { dinerProfile: true },
      },
    },
  });

  if (!plan || plan.restaurant.status !== "APPROVED") {
    return null;
  }

  const isMember = plan.members.some((m) => m.dinerProfileId === params.viewerProfileId);
  if (!isMember) {
    return null;
  }

  const engineDishes: EngineDishInput[] = plan.restaurant.categories.flatMap((cat) =>
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
      removableIngredients: item.removableIngredients,
      removableIngredientsVerified: item.removableIngredientsVerified,
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

  const evalResult = evaluateGroupSharedDishes({
    dishes: engineDishes,
    participants: plan.members.map((m) => ({
      id: m.dinerProfileId,
      name: m.dinerProfile.displayName,
      profile: dbProfileToEngineProfile(m.dinerProfile),
    })),
  });

  const groupSummary = buildPrivacySafeGroupSummary(plan.members.map((m) => m.dinerProfile));

  // Privacy: expose full individual menu & restrictions ONLY for the viewer themselves OR members who opted into `shareFullProfileWithCompanions`!
  const membersView = plan.members.map((m) => {
    const canSeeFull =
      m.dinerProfileId === params.viewerProfileId || m.dinerProfile.shareFullProfileWithCompanions;
    const parsedItems = z.array(plannedCartItemSchema).safeParse(m.plannedItems);

    const rawPersonalItems = evalResult.perPersonMenus[m.dinerProfileId]
      ? [
          ...evalResult.perPersonMenus[m.dinerProfileId]!.perfectForYou,
          ...evalResult.perPersonMenus[m.dinerProfileId]!.goodOptions,
        ].slice(0, 12)
      : [];

    const sanitizedPersonalItems = canSeeFull
      ? rawPersonalItems
      : rawPersonalItems.map((item) => ({
          ...item,
          badges: item.badges.filter((b) => b === "BEST_VALUE" || b === "POPULAR" || b === "SPICY"),
          whyForYouEn: "Compatible pick",
          whyForYouAr: "خيار متوافق",
        }));

    return {
      profileId: m.dinerProfileId,
      displayName: m.dinerProfile.displayName,
      isSelf: m.dinerProfileId === params.viewerProfileId,
      sharesFullProfile: canSeeFull,
      fullProfile: canSeeFull
        ? serializeCompanionForViewer({
            ...m.dinerProfile,
            shareFullProfileWithCompanions: true,
          }).fullProfile
        : undefined,
      plannedItems: parsedItems.success ? parsedItems.data : [],
      personalMenu: sanitizedPersonalItems,
    };
  });

  return {
    id: plan.id,
    status: plan.status,
    restaurant: {
      id: plan.restaurant.id,
      slug: plan.restaurant.slug,
      nameEn: plan.restaurant.nameEn,
      nameAr: plan.restaurant.nameAr,
    },
    groupSummary,
    sharedDishes: evalResult.sharedDishes.slice(0, 18),
    members: membersView,
  };
}

export async function updateMealPlanMemberItems(
  params: {
    mealPlanId: string;
    actorProfileId: string;
    targetProfileId: string;
    plannedItems: readonly PlannedCartItem[];
  },
  db: PrismaClient = prisma,
) {
  const plan = await db.mealPlan.findUnique({
    where: { id: params.mealPlanId },
    include: { members: true },
  });

  if (!plan || plan.status !== "ACTIVE") {
    return { ok: false as const, status: 404 as const, error: "Active meal plan not found." };
  }

  const actorIsMember = plan.members.some((m) => m.dinerProfileId === params.actorProfileId);
  const targetMember = plan.members.find((m) => m.dinerProfileId === params.targetProfileId);

  if (!actorIsMember || !targetMember) {
    return { ok: false as const, status: 403 as const, error: "Forbidden meal plan update." };
  }

  // Only edit own picks or host coordinating shared/group picks
  if (
    params.targetProfileId !== params.actorProfileId &&
    plan.hostProfileId !== params.actorProfileId
  ) {
    return {
      ok: false as const,
      status: 403 as const,
      error: "Only the member or plan host can update these planned picks.",
    };
  }

  await db.mealPlanMember.update({
    where: { id: targetMember.id },
    data: {
      plannedItems: params.plannedItems as unknown as Prisma.InputJsonValue,
    },
  });

  return { ok: true as const };
}

/**
 * Automatically seats a planned group and pre-loads their planned picks into `TableParticipant.cartItems`
 * ONLY when a member scans the physical table QR code with a verified table token (`?k={qrToken}`).
 * Never places an order automatically—diners review and tap Send Order at the table.
 */
export async function applyActiveMealPlanToTableSession(
  params: {
    restaurantId: string;
    tableSessionId: string;
    triggerProfileId: string;
  },
  db: PrismaClient = prisma,
): Promise<{ applied: boolean; mealPlanId?: string }> {
  return db.$transaction(async (tx) => {
    const activePlan = await tx.mealPlan.findFirst({
      where: {
        restaurantId: params.restaurantId,
        status: "ACTIVE",
        members: {
          some: { dinerProfileId: params.triggerProfileId },
        },
      },
      orderBy: { createdAt: "desc" },
      include: {
        members: {
          orderBy: { createdAt: "asc" },
          include: { dinerProfile: true },
        },
      },
    });

    if (!activePlan) {
      return { applied: false };
    }

    // CAS update so two companions scanning at the same second only apply the plan once!
    const claimed = await tx.mealPlan.updateMany({
      where: { id: activePlan.id, status: "ACTIVE" },
      data: {
        status: "APPLIED_TO_TABLE",
        appliedTableSessionId: params.tableSessionId,
      },
    });

    if (claimed.count === 0) {
      return { applied: false };
    }

    for (const member of activePlan.members) {
      const parsedItems = z.array(plannedCartItemSchema).safeParse(member.plannedItems);
      const itemsToLoad = parsedItems.success ? parsedItems.data : [];

      const existingPart = await tx.tableParticipant.findFirst({
        where: {
          tableSessionId: params.tableSessionId,
          dinerProfileId: member.dinerProfileId,
        },
      });

      if (existingPart) {
        const currentItems = z.array(plannedCartItemSchema).safeParse(existingPart.cartItems);
        const merged = [...(currentItems.success ? currentItems.data : []), ...itemsToLoad];
        await tx.tableParticipant.update({
          where: { id: existingPart.id },
          data: {
            cartItems: merged as unknown as Prisma.InputJsonValue,
          },
        });
      } else {
        await tx.tableParticipant.create({
          data: {
            tableSessionId: params.tableSessionId,
            dinerProfileId: member.dinerProfileId,
            displayName: member.dinerProfile.displayName,
            cartItems: itemsToLoad as unknown as Prisma.InputJsonValue,
          },
        });
      }
    }

    await tx.tableSession.update({
      where: { id: params.tableSessionId },
      data: {
        cartVersion: { increment: 1 },
        lastCartOrderId: null,
        lastActivityAt: new Date(),
      },
    });

    return { applied: true, mealPlanId: activePlan.id };
  });
}
