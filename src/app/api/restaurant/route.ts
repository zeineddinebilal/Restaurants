import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { requireRestaurantOwnerApi, slugifyRestaurantName } from "@/lib/restaurant/access";

const createRestaurantSchema = z.object({
  nameEn: z.string().trim().min(2).max(120),
  nameAr: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/, "Slug may only contain lowercase letters, numbers, and hyphens")
    .min(2)
    .max(70)
    .optional(),
  cuisine: z.string().trim().min(2).max(80).default("Lebanese"),
  descriptionEn: z.string().trim().max(600).optional(),
  descriptionAr: z.string().trim().max(600).optional(),
  initialBranchCity: z.string().trim().min(2).max(80).default("Dubai"),
  initialBranchAddressEn: z.string().trim().max(240).optional(),
  initialBranchAddressAr: z.string().trim().max(240).optional(),
});

const updateRestaurantSchema = z.object({
  restaurantId: z.string().min(1),
  nameEn: z.string().trim().min(2).max(120),
  nameAr: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/)
    .min(2)
    .max(70),
  cuisine: z.string().trim().min(2).max(80),
  descriptionEn: z.string().trim().max(600).optional().nullable(),
  descriptionAr: z.string().trim().max(600).optional().nullable(),
});

export async function GET() {
  const authResult = await requireApiRole(["RESTAURANT_OWNER", "ADMIN"]);
  if (!authResult.ok) return authResult.response;

  const where = authResult.user.role === "ADMIN" ? {} : { ownerId: authResult.user.id };

  const restaurants = await prisma.restaurant.findMany({
    where,
    orderBy: { createdAt: "asc" },
    include: {
      branches: { orderBy: { createdAt: "asc" } },
      tables: { orderBy: { tableCode: "asc" } },
      members: {
        include: {
          user: { select: { id: true, name: true, email: true, role: true, isActive: true } },
        },
      },
      _count: {
        select: { menuItems: true, orders: true },
      },
    },
  });

  return NextResponse.json({ restaurants });
}

export async function POST(req: NextRequest) {
  const authResult = await requireApiRole(["RESTAURANT_OWNER", "ADMIN"]);
  if (!authResult.ok) return authResult.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = createRestaurantSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const baseSlug = parsed.data.slug || slugifyRestaurantName(parsed.data.nameEn);
  let candidateSlug = baseSlug;
  const existingSlug = await prisma.restaurant.findUnique({ where: { slug: candidateSlug } });
  if (existingSlug) {
    if (parsed.data.slug) {
      return NextResponse.json(
        { error: `Slug "${candidateSlug}" is already taken.` },
        { status: 409 },
      );
    }
    candidateSlug = `${baseSlug}-${Math.floor(1000 + Math.random() * 9000)}`;
  }

  const restaurant = await prisma.$transaction(async (tx) => {
    const created = await tx.restaurant.create({
      data: {
        slug: candidateSlug,
        nameEn: parsed.data.nameEn,
        nameAr: parsed.data.nameAr,
        cuisine: parsed.data.cuisine,
        descriptionEn: parsed.data.descriptionEn || null,
        descriptionAr: parsed.data.descriptionAr || null,
        status: authResult.user.role === "ADMIN" ? "APPROVED" : "PENDING",
        ownerId: authResult.user.id,
      },
    });

    const branch = await tx.branch.create({
      data: {
        restaurantId: created.id,
        nameEn: `${parsed.data.initialBranchCity} Main Branch`,
        nameAr: `الفرع الرئيسي - ${parsed.data.initialBranchCity}`,
        city: parsed.data.initialBranchCity,
        addressEn: parsed.data.initialBranchAddressEn || null,
        addressAr: parsed.data.initialBranchAddressAr || null,
        isActive: true,
      },
    });

    await tx.diningTable.create({
      data: {
        restaurantId: created.id,
        branchId: branch.id,
        tableCode: "T1",
        displayName: "Table 1",
        capacity: 4,
        isActive: true,
      },
    });

    return created;
  });

  return NextResponse.json({ restaurant }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = updateRestaurantSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const access = await requireRestaurantOwnerApi(parsed.data.restaurantId);
  if (!access.ok) return access.response;

  const duplicateSlug = await prisma.restaurant.findFirst({
    where: {
      slug: parsed.data.slug,
      NOT: { id: parsed.data.restaurantId },
    },
  });
  if (duplicateSlug) {
    return NextResponse.json(
      { error: `Slug "${parsed.data.slug}" is already used by another restaurant.` },
      { status: 409 },
    );
  }

  const restaurant = await prisma.restaurant.update({
    where: { id: parsed.data.restaurantId },
    data: {
      nameEn: parsed.data.nameEn,
      nameAr: parsed.data.nameAr,
      slug: parsed.data.slug,
      cuisine: parsed.data.cuisine,
      descriptionEn: parsed.data.descriptionEn ?? null,
      descriptionAr: parsed.data.descriptionAr ?? null,
    },
  });

  return NextResponse.json({ restaurant });
}
