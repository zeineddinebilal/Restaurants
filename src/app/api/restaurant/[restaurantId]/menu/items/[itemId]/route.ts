import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  MEAT_TYPES,
  normalizeAllergenList,
  normalizeDietTagList,
  SPICE_LEVELS,
} from "@/lib/menu/taxonomy";
import { resolveUpdatedVerificationStatus } from "@/lib/menu/verification";
import { aedToFils, filsToAedString } from "@/lib/money";
import { requireRestaurantOwnerApi } from "@/lib/restaurant/access";

function exactAedField(allowNegative = false) {
  return z
    .string()
    .trim()
    .refine(
      (val) => {
        try {
          const fils = aedToFils(val);
          return allowNegative ? true : fils >= 0;
        } catch {
          return false;
        }
      },
      { message: "Must be a valid AED decimal up to 2 decimal places" },
    )
    .transform((val) => filsToAedString(aedToFils(val)));
}

// Client-sent modifier verificationStatus is never accepted; modifiers only verify via `reverify: true`
const modifierPatchSchema = z.object({
  nameEn: z.string().trim().min(1).max(160),
  nameAr: z.string().trim().min(1).max(160),
  priceDeltaAed: exactAedField(true).default("0.00"),
  removesAllergens: z.array(z.string()).default([]),
  addsDietTags: z.array(z.string()).default([]),
});

const updateItemSchema = z.object({
  categoryId: z.string().min(1).optional(),
  nameEn: z.string().trim().min(1).max(160).optional(),
  nameAr: z.string().trim().min(1).max(160).optional(),
  descriptionEn: z.string().trim().max(600).nullable().optional(),
  descriptionAr: z.string().trim().max(600).nullable().optional(),
  priceAed: exactAedField(false).optional(),
  portionSize: z.string().trim().max(80).nullable().optional(),
  ingredientsEn: z.array(z.string().trim().min(1)).optional(),
  ingredientsAr: z.array(z.string().trim().min(1)).optional(),
  removableIngredients: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  removableIngredientsVerified: z.boolean().optional(),
  dietTags: z.array(z.string()).optional(),
  allergens: z.array(z.string()).optional(),
  allergenDataProvided: z.boolean().optional(),
  spiceLevel: z.enum(SPICE_LEVELS).optional(),
  meatType: z.enum(MEAT_TYPES).optional(),
  isAvailable: z.boolean().optional(),
  isPopular: z.boolean().optional(),
  isPublished: z.boolean().optional(),
  imageUrl: z.string().trim().max(500).nullable().optional(),
  reverify: z.boolean().optional(),
  modifiers: z.array(modifierPatchSchema).optional(),
});

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ restaurantId: string; itemId: string }> },
) {
  const { restaurantId, itemId } = await context.params;
  const access = await requireRestaurantOwnerApi(restaurantId);
  if (!access.ok) return access.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = updateItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const existing = await prisma.menuItem.findFirst({
    where: { id: itemId, restaurantId },
    include: { modifiers: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Menu item not found" }, { status: 404 });
  }

  if (parsed.data.categoryId && parsed.data.categoryId !== existing.categoryId) {
    const cat = await prisma.menuCategory.findFirst({
      where: { id: parsed.data.categoryId, restaurantId },
    });
    if (!cat) {
      return NextResponse.json({ error: "Invalid category for this restaurant" }, { status: 400 });
    }
  }

  const nextAllergens =
    parsed.data.allergens !== undefined
      ? normalizeAllergenList(parsed.data.allergens)
      : existing.allergens;
  const nextDietTags =
    parsed.data.dietTags !== undefined
      ? normalizeDietTagList(parsed.data.dietTags)
      : existing.dietTags;
  const nextAllergenDataProvided =
    parsed.data.allergenDataProvided !== undefined
      ? parsed.data.allergenDataProvided
      : existing.allergenDataProvided;
  const nextMeatType = parsed.data.meatType ?? existing.meatType;
  const nextIngredientsEn = parsed.data.ingredientsEn ?? existing.ingredientsEn;
  const nextIngredientsAr = parsed.data.ingredientsAr ?? existing.ingredientsAr;

  const statusResolution = resolveUpdatedVerificationStatus({
    previous: {
      verificationStatus: existing.verificationStatus,
      allergenDataProvided: existing.allergenDataProvided,
      allergens: existing.allergens,
      dietTags: existing.dietTags,
      meatType: existing.meatType,
      ingredientsEn: existing.ingredientsEn,
      ingredientsAr: existing.ingredientsAr,
      modifiers: existing.modifiers,
    },
    next: {
      allergenDataProvided: nextAllergenDataProvided,
      allergens: nextAllergens,
      dietTags: nextDietTags,
      meatType: nextMeatType,
      ingredientsEn: nextIngredientsEn,
      ingredientsAr: nextIngredientsAr,
      modifiers: parsed.data.modifiers,
    },
    reverify: parsed.data.reverify,
  });

  if (!statusResolution.ok) {
    return NextResponse.json(
      { error: statusResolution.message, code: statusResolution.code },
      { status: 400 },
    );
  }

  const now = new Date();
  const isNowVerified = statusResolution.verificationStatus === "RESTAURANT_VERIFIED";
  const nextVerifiedAt = isNowVerified
    ? statusResolution.keepVerifiedMetadata
      ? existing.verifiedAt
      : now
    : null;
  const nextVerifiedById = isNowVerified
    ? statusResolution.keepVerifiedMetadata
      ? existing.verifiedById
      : access.user.id
    : null;

  const item = await prisma.$transaction(async (tx) => {
    if (parsed.data.modifiers !== undefined) {
      await tx.menuItemModifier.deleteMany({ where: { menuItemId: existing.id } });
      if (parsed.data.modifiers.length > 0) {
        await tx.menuItemModifier.createMany({
          data: parsed.data.modifiers.map((mod) => ({
            menuItemId: existing.id,
            nameEn: mod.nameEn,
            nameAr: mod.nameAr,
            priceDeltaAed: mod.priceDeltaAed,
            removesAllergens: normalizeAllergenList(mod.removesAllergens),
            addsDietTags: normalizeDietTagList(mod.addsDietTags),
            // Modifiers become verified ONLY when the parent dish passes verification (`isNowVerified`)
            verificationStatus: isNowVerified ? "RESTAURANT_VERIFIED" : "AI_SUGGESTED",
          })),
        });
      }
    } else if (existing.modifiers.length > 0) {
      if (parsed.data.reverify && isNowVerified) {
        await tx.menuItemModifier.updateMany({
          where: { menuItemId: existing.id },
          data: { verificationStatus: "RESTAURANT_VERIFIED" },
        });
      } else if (!isNowVerified) {
        await tx.menuItemModifier.updateMany({
          where: { menuItemId: existing.id },
          data: { verificationStatus: "AI_SUGGESTED" },
        });
      }
    }

    return tx.menuItem.update({
      where: { id: existing.id },
      data: {
        categoryId: parsed.data.categoryId ?? existing.categoryId,
        nameEn: parsed.data.nameEn ?? existing.nameEn,
        nameAr: parsed.data.nameAr ?? existing.nameAr,
        descriptionEn:
          parsed.data.descriptionEn !== undefined
            ? parsed.data.descriptionEn
            : existing.descriptionEn,
        descriptionAr:
          parsed.data.descriptionAr !== undefined
            ? parsed.data.descriptionAr
            : existing.descriptionAr,
        priceAed: parsed.data.priceAed ?? existing.priceAed,
        portionSize:
          parsed.data.portionSize !== undefined ? parsed.data.portionSize : existing.portionSize,
        ingredientsEn: nextIngredientsEn,
        ingredientsAr: nextIngredientsAr,
        removableIngredients:
          parsed.data.removableIngredients !== undefined
            ? parsed.data.removableIngredients.map((r) => r.trim().toLowerCase())
            : existing.removableIngredients,
        removableIngredientsVerified:
          parsed.data.removableIngredientsVerified !== undefined
            ? parsed.data.removableIngredientsVerified
            : parsed.data.reverify && isNowVerified
              ? true
              : existing.removableIngredientsVerified,
        dietTags: nextDietTags,
        allergens: nextAllergens,
        allergenDataProvided: nextAllergenDataProvided,
        spiceLevel: parsed.data.spiceLevel ?? existing.spiceLevel,
        meatType: nextMeatType,
        verificationStatus: statusResolution.verificationStatus,
        verifiedAt: nextVerifiedAt,
        verifiedById: nextVerifiedById,
        isAvailable:
          parsed.data.isAvailable !== undefined ? parsed.data.isAvailable : existing.isAvailable,
        isPopular: parsed.data.isPopular !== undefined ? parsed.data.isPopular : existing.isPopular,
        isPublished:
          parsed.data.isPublished !== undefined ? parsed.data.isPublished : existing.isPublished,
        imageUrl: parsed.data.imageUrl !== undefined ? parsed.data.imageUrl : existing.imageUrl,
      },
      include: { modifiers: { orderBy: { createdAt: "asc" } } },
    });
  });

  return NextResponse.json({ item });
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ restaurantId: string; itemId: string }> },
) {
  const { restaurantId, itemId } = await context.params;
  const access = await requireRestaurantOwnerApi(restaurantId);
  if (!access.ok) return access.response;

  const existing = await prisma.menuItem.findFirst({
    where: { id: itemId, restaurantId },
    include: { _count: { select: { orderItems: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Menu item not found" }, { status: 404 });
  }

  if (existing._count.orderItems > 0) {
    const item = await prisma.menuItem.update({
      where: { id: existing.id },
      data: { isPublished: false, isAvailable: false },
    });
    return NextResponse.json({ item, archivedInsteadOfDeleted: true });
  }

  await prisma.menuItem.delete({ where: { id: existing.id } });
  return NextResponse.json({ deleted: true });
}
