import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getActiveDinerProfile } from "@/lib/diner/profile";
import { canCurrentCallerViewOrder } from "@/lib/ordering/access";

const ratingSchema = z.object({
  orderId: z.string().min(1),
  menuItemId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(300).optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = ratingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { id: parsed.data.orderId },
    include: { items: { select: { menuItemId: true } } },
  });
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const allowed = await canCurrentCallerViewOrder(order);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!order.items.some((i) => i.menuItemId === parsed.data.menuItemId)) {
    return NextResponse.json({ error: "Dish was not part of this order." }, { status: 400 });
  }

  const { profile } = await getActiveDinerProfile();
  if (!profile?.id) {
    return NextResponse.json(
      { error: "Save a quick food profile first to record dish ratings." },
      { status: 400 },
    );
  }

  const created = await prisma.dishRating.create({
    data: {
      dinerProfileId: profile.id,
      menuItemId: parsed.data.menuItemId,
      orderId: order.id,
      rating: parsed.data.rating,
      comment: parsed.data.comment || null,
    },
  });

  return NextResponse.json({ rating: created }, { status: 201 });
}
