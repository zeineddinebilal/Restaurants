import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRestaurantOwnerApi } from "@/lib/restaurant/access";

const createBranchSchema = z.object({
  nameEn: z.string().trim().min(2).max(120),
  nameAr: z.string().trim().min(2).max(120),
  city: z.string().trim().min(2).max(80).default("Dubai"),
  addressEn: z.string().trim().max(240).optional(),
  addressAr: z.string().trim().max(240).optional(),
});

const updateBranchSchema = z.object({
  branchId: z.string().min(1),
  nameEn: z.string().trim().min(2).max(120).optional(),
  nameAr: z.string().trim().min(2).max(120).optional(),
  city: z.string().trim().min(2).max(80).optional(),
  addressEn: z.string().trim().max(240).nullable().optional(),
  addressAr: z.string().trim().max(240).nullable().optional(),
  isActive: z.boolean().optional(),
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

  const parsed = createBranchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const branch = await prisma.branch.create({
    data: {
      restaurantId,
      nameEn: parsed.data.nameEn,
      nameAr: parsed.data.nameAr,
      city: parsed.data.city,
      addressEn: parsed.data.addressEn || null,
      addressAr: parsed.data.addressAr || null,
      isActive: true,
    },
  });

  return NextResponse.json({ branch }, { status: 201 });
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

  const parsed = updateBranchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const existing = await prisma.branch.findFirst({
    where: { id: parsed.data.branchId, restaurantId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Branch not found" }, { status: 404 });
  }

  const branch = await prisma.branch.update({
    where: { id: existing.id },
    data: {
      nameEn: parsed.data.nameEn ?? existing.nameEn,
      nameAr: parsed.data.nameAr ?? existing.nameAr,
      city: parsed.data.city ?? existing.city,
      addressEn: parsed.data.addressEn !== undefined ? parsed.data.addressEn : existing.addressEn,
      addressAr: parsed.data.addressAr !== undefined ? parsed.data.addressAr : existing.addressAr,
      isActive: parsed.data.isActive !== undefined ? parsed.data.isActive : existing.isActive,
    },
  });

  return NextResponse.json({ branch });
}
