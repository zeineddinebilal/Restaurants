import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRestaurantStaffOrOwnerApi } from "@/lib/ordering/access";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ restaurantId: string }> },
) {
  const { restaurantId } = await context.params;
  const access = await requireRestaurantStaffOrOwnerApi(restaurantId);
  if (!access.ok) return access.response;

  const orders = await prisma.order.findMany({
    where: { restaurantId },
    orderBy: { sentAt: "desc" },
    take: 80,
    include: {
      table: {
        select: { tableCode: true, displayName: true },
      },
      tableSession: {
        include: {
          participants: {
            include: {
              dinerProfile: {
                select: { dietaryRestrictions: true, allergens: true },
              },
            },
          },
        },
      },
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          menuItem: {
            select: { nameEn: true, nameAr: true },
          },
        },
      },
      platformFee: true,
    },
  });

  return NextResponse.json({
    orders: orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      subtotalAed: o.subtotalAed.toFixed(2),
      notes: o.notes,
      cancelReason: o.cancelReason,
      sentAt: o.sentAt,
      acceptedAt: o.acceptedAt,
      preparingAt: o.preparingAt,
      servedAt: o.servedAt,
      cancelledAt: o.cancelledAt,
      table: o.table,
      participants: o.tableSession.participants.map((p) => ({
        id: p.id,
        displayName: p.displayName,
        dietaryRestrictions: p.dinerProfile?.dietaryRestrictions ?? [],
        allergens: p.dinerProfile?.allergens ?? [],
      })),
      items: o.items.map((it) => ({
        id: it.id,
        nameEn: it.menuItem.nameEn,
        nameAr: it.menuItem.nameAr,
        participantName: it.participantName,
        quantity: it.quantity,
        unitPriceAed: it.unitPriceAed.toFixed(2),
        lineTotalAed: it.lineTotalAed.toFixed(2),
        selectedModifiers: it.selectedModifiers,
        specialInstructions: it.specialInstructions,
      })),
      platformFee: o.platformFee
        ? {
            feeAmountAed: o.platformFee.feeAmountAed.toFixed(2),
            isVoided: o.platformFee.isVoided,
          }
        : null,
    })),
  });
}
