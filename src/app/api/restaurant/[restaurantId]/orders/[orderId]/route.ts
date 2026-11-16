import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRestaurantStaffOrOwnerApi } from "@/lib/ordering/access";
import { transitionOrderStatusAtomically } from "@/lib/ordering/lifecycle";

const transitionSchema = z.object({
  status: z.enum(["ACCEPTED", "PREPARING", "SERVED", "CANCELLED"]),
  cancelReason: z.string().trim().max(240).optional(),
});

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ restaurantId: string; orderId: string }> },
) {
  const { restaurantId, orderId } = await context.params;
  const access = await requireRestaurantStaffOrOwnerApi(restaurantId);
  if (!access.ok) return access.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = transitionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid order status transition payload" }, { status: 400 });
  }

  const result = await transitionOrderStatusAtomically({
    db: prisma,
    restaurantId,
    orderId,
    nextStatus: parsed.data.status,
    cancelReason: parsed.data.cancelReason,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    idempotentNoop: result.idempotentNoop,
    order: {
      id: result.order.id,
      orderNumber: result.order.orderNumber,
      status: result.order.status,
      subtotalAed: result.order.subtotalAed.toFixed(2),
      platformFee: result.order.platformFee
        ? {
            feeAmountAed: result.order.platformFee.feeAmountAed.toFixed(2),
            isVoided: result.order.platformFee.isVoided,
          }
        : null,
    },
  });
}
