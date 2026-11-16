import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { generateTableQrToken } from "@/lib/qr";
import { requireRestaurantOwnerApi } from "@/lib/restaurant/access";

const createTableSchema = z.object({
  tableCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{1,24}$/, "Table code may only contain letters, numbers, - and _"),
  displayName: z.string().trim().min(1).max(80),
  capacity: z.number().int().min(1).max(30).default(4),
  branchId: z.string().optional().nullable(),
});

const updateTableSchema = z.object({
  tableId: z.string().min(1),
  tableCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{1,24}$/)
    .optional(),
  displayName: z.string().trim().min(1).max(80).optional(),
  capacity: z.number().int().min(1).max(30).optional(),
  branchId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  regenerateQrToken: z.boolean().optional(),
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

  const parsed = createTableSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const code = parsed.data.tableCode.toUpperCase();
  const duplicate = await prisma.diningTable.findUnique({
    where: {
      restaurantId_tableCode: {
        restaurantId,
        tableCode: code,
      },
    },
  });
  if (duplicate) {
    return NextResponse.json(
      { error: `Table code "${code}" already exists for this restaurant.` },
      { status: 409 },
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

  const table = await prisma.diningTable.create({
    data: {
      restaurantId,
      branchId: parsed.data.branchId ?? null,
      tableCode: code,
      displayName: parsed.data.displayName,
      capacity: parsed.data.capacity,
      qrToken: generateTableQrToken(),
      isActive: true,
    },
  });

  return NextResponse.json({ table }, { status: 201 });
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

  const parsed = updateTableSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const existing = await prisma.diningTable.findFirst({
    where: { id: parsed.data.tableId, restaurantId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Table not found" }, { status: 404 });
  }

  const nextCode = parsed.data.tableCode ? parsed.data.tableCode.toUpperCase() : existing.tableCode;
  if (nextCode !== existing.tableCode) {
    const duplicate = await prisma.diningTable.findUnique({
      where: {
        restaurantId_tableCode: {
          restaurantId,
          tableCode: nextCode,
        },
      },
    });
    if (duplicate) {
      return NextResponse.json(
        { error: `Table code "${nextCode}" already exists.` },
        { status: 409 },
      );
    }
  }

  if (parsed.data.branchId) {
    const branch = await prisma.branch.findFirst({
      where: { id: parsed.data.branchId, restaurantId },
    });
    if (!branch) {
      return NextResponse.json({ error: "Invalid branch for this restaurant" }, { status: 400 });
    }
  }

  const shouldRotate = Boolean(parsed.data.regenerateQrToken);
  const nextQrToken = shouldRotate ? generateTableQrToken() : existing.qrToken;

  const table = await prisma.$transaction(async (tx) => {
    if (shouldRotate) {
      // Rotating the table QR token also closes any currently open table sessions
      await tx.tableSession.updateMany({
        where: { tableId: existing.id, status: "OPEN" },
        data: { status: "CLOSED", closedAt: new Date() },
      });
    }

    return tx.diningTable.update({
      where: { id: existing.id },
      data: {
        tableCode: nextCode,
        displayName: parsed.data.displayName ?? existing.displayName,
        capacity: parsed.data.capacity ?? existing.capacity,
        branchId: parsed.data.branchId !== undefined ? parsed.data.branchId : existing.branchId,
        isActive: parsed.data.isActive !== undefined ? parsed.data.isActive : existing.isActive,
        qrToken: nextQrToken,
      },
    });
  });

  return NextResponse.json({ table });
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ restaurantId: string }> },
) {
  const { restaurantId } = await context.params;
  const access = await requireRestaurantOwnerApi(restaurantId);
  if (!access.ok) return access.response;

  const tableId = req.nextUrl.searchParams.get("tableId")?.trim();
  if (!tableId) {
    return NextResponse.json({ error: "Missing tableId query parameter" }, { status: 400 });
  }

  const existing = await prisma.diningTable.findFirst({
    where: { id: tableId, restaurantId },
    include: { _count: { select: { orders: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Table not found" }, { status: 404 });
  }

  if (existing._count.orders > 0) {
    const table = await prisma.diningTable.update({
      where: { id: existing.id },
      data: { isActive: false },
    });
    return NextResponse.json({ table, deactivatedInsteadOfDeleted: true });
  }

  await prisma.diningTable.delete({ where: { id: existing.id } });
  return NextResponse.json({ deleted: true });
}
