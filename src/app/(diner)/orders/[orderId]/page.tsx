import { notFound, redirect } from "next/navigation";
import {
  OrderStatusClient,
  type SerializedOrderView,
} from "@/app/(diner)/orders/[orderId]/OrderStatusClient";
import { prisma } from "@/lib/db";
import { getI18nContext } from "@/lib/i18n/server";
import { aedToFils } from "@/lib/money";
import { canCurrentCallerViewOrder } from "@/lib/ordering/access";
import { computeTableBillSplit } from "@/lib/ordering/pricing";
import { paymentProvider } from "@/lib/payments";

export const dynamic = "force-dynamic";

export default async function OrderStatusPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const [{ orderId }, { locale }] = await Promise.all([params, getI18nContext()]);

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      restaurant: { select: { id: true, slug: true, nameEn: true, nameAr: true } },
      table: { select: { tableCode: true, displayName: true } },
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
          menuItem: { select: { id: true, nameEn: true, nameAr: true } },
        },
      },
    },
  });

  if (!order) {
    notFound();
  }

  const allowed = await canCurrentCallerViewOrder(order);
  if (!allowed) {
    redirect("/home");
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

  const serialized: SerializedOrderView = {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    subtotalAed: order.subtotalAed.toFixed(2),
    notes: order.notes,
    cancelReason: order.cancelReason,
    restaurant: order.restaurant,
    table: order.table,
    items: order.items.map((it) => ({
      id: it.id,
      menuItemId: it.menuItemId,
      nameEn: it.menuItem.nameEn,
      nameAr: it.menuItem.nameAr,
      participantName: it.participantName,
      quantity: it.quantity,
      unitPriceAed: it.unitPriceAed.toFixed(2),
      lineTotalAed: it.lineTotalAed.toFixed(2),
      selectedModifiers: it.selectedModifiers,
      specialInstructions: it.specialInstructions,
    })),
    billSplit: split,
    settlement,
  };

  return <OrderStatusClient locale={locale} initialOrder={serialized} />;
}
