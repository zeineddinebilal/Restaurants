import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  MEAT_TYPES,
  normalizeAllergenList,
  normalizeDietTagList,
  SPICE_LEVELS,
} from "@/lib/menu/taxonomy";
import {
  evaluateBatchImportVerification,
  validateDishForVerification,
} from "@/lib/menu/verification";
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
      { message: "Must be a valid AED decimal up to 2 decimal places (e.g. 24.00)" },
    )
    .transform((val) => filsToAedString(aedToFils(val)));
}

// Client-sent modifier verification status is never accepted; modifiers only verify with parent dish
const modifierInputSchema = z.object({
  nameEn: z.string().trim().min(1).max(160),
  nameAr: z.string().trim().min(1).max(160),
  priceDeltaAed: exactAedField(true).default("0.00"),
  removesAllergens: z.array(z.string()).default([]),
  addsDietTags: z.array(z.string()).default([]),
});

const singleItemInputSchema = z.object({
  categoryId: z.string().min(1),
  nameEn: z.string().trim().min(1).max(160),
  nameAr: z.string().trim().min(1).max(160),
  descriptionEn: z.string().trim().max(600).optional().nullable(),
  descriptionAr: z.string().trim().max(600).optional().nullable(),
  priceAed: exactAedField(false),
  portionSize: z.string().trim().max(80).optional().nullable(),
  caloriesKcal: z.number().int().min(0).max(10000).optional().nullable(),
  ingredientsEn: z.array(z.string().trim().min(1)).default([]),
  ingredientsAr: z.array(z.string().trim().min(1)).default([]),
  removableIngredients: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  removableIngredientsVerified: z.boolean().default(false),
  dietTags: z.array(z.string()).default([]),
  allergens: z.array(z.string()).default([]),
  allergenDataProvided: z.boolean().default(false),
  spiceLevel: z.enum(SPICE_LEVELS).default("NONE"),
  meatType: z.enum(MEAT_TYPES).default("NONE"),
  aiConfidence: z.string().optional().nullable(),
  isPopular: z.boolean().default(false),
  isPublished: z.boolean().default(false),
  imageUrl: z.string().trim().max(500).optional().nullable(),
  verifyNow: z.boolean().default(false),
  modifiers: z.array(modifierInputSchema).default([]),
});

const batchImportSchema = z.object({
  mode: z.literal("batch"),
  publishImmediately: z.boolean().default(false),
  categories: z
    .array(
      z.object({
        nameEn: z.string().trim().min(1).max(120),
        nameAr: z.string().trim().min(1).max(120),
        items: z.array(singleItemInputSchema.omit({ categoryId: true })).min(1),
      }),
    )
    .min(1),
});

const bulkActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("bulk_verify"),
    itemIds: z.array(z.string().min(1)).min(1, "Select at least one dish to bulk verify."),
  }),
  z.object({
    action: z.enum(["bulk_publish", "bulk_unpublish"]),
    itemIds: z.array(z.string().min(1)).optional(),
  }),
]);

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ restaurantId: string }> },
) {
  const { restaurantId } = await context.params;
  const access = await requireRestaurantOwnerApi(restaurantId);
  if (!access.ok) return access.response;

  const categories = await prisma.menuCategory.findMany({
    where: { restaurantId },
    orderBy: { sortOrder: "asc" },
    include: {
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          modifiers: { orderBy: { createdAt: "asc" } },
        },
      },
    },
  });

  return NextResponse.json({ categories });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ restaurantId: string }> },
) {
  const { restaurantId } = await context.params;
  const access = await requireRestaurantOwnerApi(restaurantId);
  if (!access.ok) return access.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  // Mode A: Batch import from AI Menu Ingestion editable review table
  if (typeof body === "object" && body !== null && "mode" in body && body.mode === "batch") {
    const parsedBatch = batchImportSchema.safeParse(body);
    if (!parsedBatch.success) {
      return NextResponse.json(
        { error: "Invalid batch menu payload", details: parsedBatch.error.flatten() },
        { status: 400 },
      );
    }

    const now = new Date();
    const existingCount = await prisma.menuCategory.count({ where: { restaurantId } });
    const validationWarnings: Array<{ nameEn: string; code: string; message: string }> = [];
    let verifiedCount = 0;

    const importedCount = await prisma.$transaction(async (tx) => {
      let createdDishes = 0;
      let sortIdx = existingCount + 1;

      for (const cat of parsedBatch.data.categories) {
        const category = await tx.menuCategory.create({
          data: {
            restaurantId,
            nameEn: cat.nameEn,
            nameAr: cat.nameAr,
            sortOrder: sortIdx++,
          },
        });

        for (const item of cat.items) {
          const normalizedAllergens = normalizeAllergenList(item.allergens);
          const normalizedDietTags = normalizeDietTagList(item.dietTags);
          const check = evaluateBatchImportVerification({
            nameEn: item.nameEn,
            verifyNow: item.verifyNow,
            allergenDataProvided: item.allergenDataProvided,
            allergens: normalizedAllergens,
            dietTags: normalizedDietTags,
            meatType: item.meatType,
            modifiers: item.modifiers,
          });

          if (check.warning) {
            validationWarnings.push(check.warning);
          }
          if (check.verified) {
            verifiedCount++;
          }

          await tx.menuItem.create({
            data: {
              restaurantId,
              categoryId: category.id,
              nameEn: item.nameEn,
              nameAr: item.nameAr,
              descriptionEn: item.descriptionEn || null,
              descriptionAr: item.descriptionAr || null,
              priceAed: item.priceAed,
              portionSize: item.portionSize || null,
              caloriesKcal: item.caloriesKcal ?? null,
              ingredientsEn: item.ingredientsEn,
              ingredientsAr: item.ingredientsAr,
              removableIngredients: item.removableIngredients.map((r) => r.trim().toLowerCase()),
              removableIngredientsVerified: check.verified || item.removableIngredientsVerified,
              dietTags: normalizedDietTags,
              allergens: normalizedAllergens,
              allergenDataProvided: item.allergenDataProvided,
              spiceLevel: item.spiceLevel,
              meatType: item.meatType,
              aiConfidence: item.aiConfidence || null,
              verificationStatus: check.verified ? "RESTAURANT_VERIFIED" : "AI_SUGGESTED",
              verifiedAt: check.verified ? now : null,
              verifiedById: check.verified ? access.user.id : null,
              isAvailable: true,
              isPopular: item.isPopular,
              isPublished: parsedBatch.data.publishImmediately || item.isPublished,
              modifiers: item.modifiers.length
                ? {
                    create: item.modifiers.map((mod) => ({
                      nameEn: mod.nameEn,
                      nameAr: mod.nameAr,
                      priceDeltaAed: mod.priceDeltaAed,
                      removesAllergens: normalizeAllergenList(mod.removesAllergens),
                      addsDietTags: normalizeDietTagList(mod.addsDietTags),
                      verificationStatus: check.verified ? "RESTAURANT_VERIFIED" : "AI_SUGGESTED",
                    })),
                  }
                : undefined,
            },
          });
          createdDishes++;
        }
      }

      return createdDishes;
    });

    return NextResponse.json({ importedCount, verifiedCount, validationWarnings }, { status: 201 });
  }

  // Mode B: Single dish creation
  const parsed = singleItemInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const category = await prisma.menuCategory.findFirst({
    where: { id: parsed.data.categoryId, restaurantId },
  });
  if (!category) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  const normalizedAllergens = normalizeAllergenList(parsed.data.allergens);
  const normalizedDietTags = normalizeDietTagList(parsed.data.dietTags);

  if (parsed.data.verifyNow) {
    const check = validateDishForVerification({
      allergenDataProvided: parsed.data.allergenDataProvided,
      allergens: normalizedAllergens,
      dietTags: normalizedDietTags,
      meatType: parsed.data.meatType,
      modifiers: parsed.data.modifiers,
    });
    if (!check.ok) {
      return NextResponse.json({ error: check.message, code: check.code }, { status: 400 });
    }
  }

  const now = new Date();
  const isVerified = parsed.data.verifyNow;

  const item = await prisma.menuItem.create({
    data: {
      restaurantId,
      categoryId: category.id,
      nameEn: parsed.data.nameEn,
      nameAr: parsed.data.nameAr,
      descriptionEn: parsed.data.descriptionEn || null,
      descriptionAr: parsed.data.descriptionAr || null,
      priceAed: parsed.data.priceAed,
      portionSize: parsed.data.portionSize || null,
      caloriesKcal: parsed.data.caloriesKcal ?? null,
      ingredientsEn: parsed.data.ingredientsEn,
      ingredientsAr: parsed.data.ingredientsAr,
      removableIngredients: parsed.data.removableIngredients.map((r) => r.trim().toLowerCase()),
      removableIngredientsVerified: isVerified || parsed.data.removableIngredientsVerified,
      dietTags: normalizedDietTags,
      allergens: normalizedAllergens,
      allergenDataProvided: parsed.data.allergenDataProvided,
      spiceLevel: parsed.data.spiceLevel,
      meatType: parsed.data.meatType,
      verificationStatus: isVerified ? "RESTAURANT_VERIFIED" : "AI_SUGGESTED",
      verifiedAt: isVerified ? now : null,
      verifiedById: isVerified ? access.user.id : null,
      isAvailable: true,
      isPopular: parsed.data.isPopular,
      isPublished: parsed.data.isPublished,
      imageUrl: parsed.data.imageUrl || null,
      modifiers: parsed.data.modifiers.length
        ? {
            create: parsed.data.modifiers.map((mod) => ({
              nameEn: mod.nameEn,
              nameAr: mod.nameAr,
              priceDeltaAed: mod.priceDeltaAed,
              removesAllergens: normalizeAllergenList(mod.removesAllergens),
              addsDietTags: normalizeDietTagList(mod.addsDietTags),
              verificationStatus: isVerified ? "RESTAURANT_VERIFIED" : "AI_SUGGESTED",
            })),
          }
        : undefined,
    },
    include: { modifiers: true },
  });

  return NextResponse.json({ item }, { status: 201 });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ restaurantId: string }> },
) {
  const { restaurantId } = await context.params;
  const access = await requireRestaurantOwnerApi(restaurantId);
  if (!access.ok) return access.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = bulkActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  if (parsed.data.action === "bulk_publish" || parsed.data.action === "bulk_unpublish") {
    const whereClause = parsed.data.itemIds?.length
      ? { restaurantId, id: { in: parsed.data.itemIds } }
      : { restaurantId };
    const isPublished = parsed.data.action === "bulk_publish";
    const updated = await prisma.menuItem.updateMany({
      where: whereClause,
      data: { isPublished },
    });
    return NextResponse.json({ updatedCount: updated.count });
  }

  // bulk_verify requires an explicit non-empty itemIds list and validates dish + modifiers
  const candidates = await prisma.menuItem.findMany({
    where: { restaurantId, id: { in: parsed.data.itemIds } },
    include: { modifiers: true },
  });

  let verifiedCount = 0;
  const skipped: Array<{ id: string; nameEn: string; reason: string }> = [];
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    for (const item of candidates) {
      const check = validateDishForVerification({
        allergenDataProvided: item.allergenDataProvided,
        allergens: item.allergens,
        dietTags: item.dietTags,
        meatType: item.meatType,
        modifiers: item.modifiers,
      });

      if (!check.ok) {
        skipped.push({ id: item.id, nameEn: item.nameEn, reason: check.message });
        continue;
      }

      await tx.menuItem.update({
        where: { id: item.id },
        data: {
          allergens: check.normalizedAllergens,
          dietTags: check.normalizedDietTags,
          removableIngredientsVerified: true,
          verificationStatus: "RESTAURANT_VERIFIED",
          verifiedAt: now,
          verifiedById: access.user.id,
        },
      });

      if (item.modifiers.length > 0) {
        await tx.menuItemModifier.updateMany({
          where: { menuItemId: item.id },
          data: { verificationStatus: "RESTAURANT_VERIFIED" },
        });
      }
      verifiedCount++;
    }
  });

  return NextResponse.json({ verifiedCount, skipped });
}
