import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { aedToFils } from "@/lib/money";
import { canCurrentCallerViewOrder } from "@/lib/ordering/access";
import { computeTableBillSplit } from "@/lib/ordering/pricing";
import { paymentProvider } from "@/lib/payments";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      restaurant: {
        select: { id: true, slug: true, nameEn: true, nameAr: true },
      },
      table: {
        select: { tableCode: true, displayName: true },
      },
      tableSession: {
        include: {
          participants: {
            orderBy: { joinedAt: "asc" },
            select: { id: true, displayName: true },
          },
        },
      },
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          menuItem: {
            select: { id: true, nameEn: true, nameAr: true },
          },
        },
      },
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const allowed = await canCurrentCallerViewOrder(order);
  if (!allowed) {
    return NextResponse.json(
      { error: "Forbidden: you do not have access to this table's order." },
      { status: 403 },
    );
  }

  const split = computeTableBillSplit({
    participants: order.tableSession.participants,
    lines: order.items.map((item) => ({
      participantId: item.participantId,
      lineTotalFils: aedToFils(item.lineTotalAed.toFixed(2)),
    })),
  });

  const settlement = await paymentProvider.prepareOrderSettlement({
    orderId: order.id,
    amountAed: order.subtotalAed.toFixed(2),
    currency: "AED",
  });

  return NextResponse.json({
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      subtotalAed: order.subtotalAed.toFixed(2),
      notes: order.notes,
      cancelReason: order.cancelReason,
      sentAt: order.sentAt,
      acceptedAt: order.acceptedAt,
      preparingAt: order.preparingAt,
      servedAt: order.servedAt,
      cancelledAt: order.cancelledAt,
      restaurant: order.restaurant,
      table: order.table,
      items: order.items.map((it) => ({
        id: it.id,
        menuItemId: it.menuItemId,
        nameEn: it.menuItem.nameEn,
        nameAr: it.menuItem.nameAr,
        participantId: it.participantId,
        participantName: it.participantName,
        quantity: it.quantity,
        unitPriceAed: it.unitPriceAed.toFixed(2),
        lineTotalAed: it.lineTotalAed.toFixed(2),
        selectedModifiers: it.selectedModifiers,
        specialInstructions: it.specialInstructions,
      })),
      billSplit: split,
      settlement,
    },
  });
}
