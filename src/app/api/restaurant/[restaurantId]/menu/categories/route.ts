import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRestaurantOwnerApi } from "@/lib/restaurant/access";

const createCategorySchema = z.object({
  nameEn: z.string().trim().min(1).max(120),
  nameAr: z.string().trim().min(1).max(120),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

const updateCategorySchema = z.object({
  categoryId: z.string().min(1),
  nameEn: z.string().trim().min(1).max(120).optional(),
  nameAr: z.string().trim().min(1).max(120).optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

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

  const parsed = createCategorySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const count = await prisma.menuCategory.count({ where: { restaurantId } });
  const category = await prisma.menuCategory.create({
    data: {
      restaurantId,
      nameEn: parsed.data.nameEn,
      nameAr: parsed.data.nameAr,
      sortOrder: parsed.data.sortOrder ?? count + 1,
    },
  });

  return NextResponse.json({ category }, { status: 201 });
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

  const parsed = updateCategorySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const existing = await prisma.menuCategory.findFirst({
    where: { id: parsed.data.categoryId, restaurantId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  const category = await prisma.menuCategory.update({
    where: { id: existing.id },
    data: {
      nameEn: parsed.data.nameEn ?? existing.nameEn,
      nameAr: parsed.data.nameAr ?? existing.nameAr,
      sortOrder: parsed.data.sortOrder ?? existing.sortOrder,
    },
  });

  return NextResponse.json({ category });
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ restaurantId: string }> },
) {
  const { restaurantId } = await context.params;
  const access = await requireRestaurantOwnerApi(restaurantId);
  if (!access.ok) return access.response;

  const categoryId = req.nextUrl.searchParams.get("categoryId")?.trim();
  if (!categoryId) {
    return NextResponse.json({ error: "Missing categoryId" }, { status: 400 });
  }

  const existing = await prisma.menuCategory.findFirst({
    where: { id: categoryId, restaurantId },
    include: { _count: { select: { items: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }
  if (existing._count.items > 0) {
    return NextResponse.json(
      { error: "Move or remove dishes inside this category before deleting it." },
      { status: 409 },
    );
  }

  await prisma.menuCategory.delete({ where: { id: existing.id } });
  return NextResponse.json({ deleted: true });
}
