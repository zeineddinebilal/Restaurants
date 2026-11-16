import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRestaurantOwnerApi } from "@/lib/restaurant/access";

const addStaffSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(160),
  password: z.string().min(8).max(128),
  branchId: z.string().optional().nullable(),
});

const toggleStaffSchema = z.object({
  memberId: z.string().min(1),
  isActive: z.boolean(),
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

  const parsed = addStaffSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  if (parsed.data.branchId) {
    const branch = await prisma.branch.findFirst({
      where: { id: parsed.data.branchId, restaurantId },
    });
    if (!branch) {
      return NextResponse.json({ error: "Invalid branch for this restaurant" }, { status: 400 });
    }
  }

  const email = parsed.data.email.toLowerCase();
  const existingUser = await prisma.user.findUnique({ where: { email } });

  if (existingUser && existingUser.role === "ADMIN") {
    return NextResponse.json(
      { error: "Cannot assign an administrator account as restaurant staff." },
      { status: 400 },
    );
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  const member = await prisma.$transaction(async (tx) => {
    const staffUser = existingUser
      ? existingUser
      : await tx.user.create({
          data: {
            name: parsed.data.name,
            email,
            passwordHash,
            role: "RESTAURANT_STAFF",
            locale: "en",
            isActive: true,
          },
        });

    return tx.restaurantMember.upsert({
      where: {
        restaurantId_userId: {
          restaurantId,
          userId: staffUser.id,
        },
      },
      update: {
        branchId: parsed.data.branchId ?? null,
        isActive: true,
      },
      create: {
        restaurantId,
        branchId: parsed.data.branchId ?? null,
        userId: staffUser.id,
        role: "RESTAURANT_STAFF",
        isActive: true,
      },
      include: {
        user: { select: { id: true, name: true, email: true, role: true, isActive: true } },
      },
    });
  });

  return NextResponse.json({ member }, { status: 201 });
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

  const parsed = toggleStaffSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const existing = await prisma.restaurantMember.findFirst({
    where: { id: parsed.data.memberId, restaurantId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
  }

  const member = await prisma.restaurantMember.update({
    where: { id: existing.id },
    data: { isActive: parsed.data.isActive },
    include: {
      user: { select: { id: true, name: true, email: true, role: true, isActive: true } },
    },
  });

  return NextResponse.json({ member });
}
