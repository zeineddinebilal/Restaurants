import { NextRequest, NextResponse } from "next/server";
import { computeCurrentMonthRestaurantFeeSummary } from "@/lib/billing/invoices";
import { prisma } from "@/lib/db";
import { requireRestaurantOwnerApi } from "@/lib/restaurant/access";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ restaurantId: string }> },
) {
  const { restaurantId } = await context.params;
  const access = await requireRestaurantOwnerApi(restaurantId);
  if (!access.ok) return access.response;

  const [summary, fees, invoices] = await Promise.all([
    computeCurrentMonthRestaurantFeeSummary({ restaurantId }),
    prisma.platformFee.findMany({
      where: { restaurantId },
      orderBy: { recordedAt: "desc" },
      take: 100,
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            table: { select: { tableCode: true } },
          },
        },
        invoice: { select: { invoiceNumber: true, status: true } },
      },
    }),
    prisma.invoice.findMany({
      where: { restaurantId },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      take: 36,
    }),
  ]);

  return NextResponse.json({
    summary,
    fees: fees.map((f) => ({
      id: f.id,
      orderId: f.orderId,
      orderNumber: f.order.orderNumber,
      orderStatus: f.order.status,
      tableCode: f.order.table.tableCode,
      orderSubtotalAed: f.orderSubtotalAed.toFixed(2),
      feePercentageApplied: f.feePercentageApplied.toFixed(2),
      feeCapAppliedAed: f.feeCapAppliedAed.toFixed(2),
      feeAmountAed: f.feeAmountAed.toFixed(2),
      isVoided: f.isVoided,
      recordedAt: f.recordedAt.toISOString(),
      voidedAt: f.voidedAt ? f.voidedAt.toISOString() : null,
      invoiceNumber: f.invoice?.invoiceNumber ?? null,
    })),
    invoices: invoices.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      year: inv.year,
      month: inv.month,
      totalOrders: inv.totalOrders,
      grossSalesAed: inv.grossSalesAed.toFixed(2),
      periodFeesAed: inv.periodFeesAed.toFixed(2),
      adjustmentsAed: inv.adjustmentsAed.toFixed(2),
      totalFeesAed: inv.totalFeesAed.toFixed(2),
      status: inv.status,
      generatedAt: inv.generatedAt.toISOString(),
      paidAt: inv.paidAt ? inv.paidAt.toISOString() : null,
    })),
  });
}
