import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/lib/auth/rbac";
import { generateMonthlyInvoice } from "@/lib/billing/invoices";
import { prisma } from "@/lib/db";

const generateInvoiceSchema = z.object({
  restaurantId: z.string().min(1),
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  targetStatus: z.enum(["DRAFT", "ISSUED"]).default("ISSUED"),
});

export async function GET() {
  const authCheck = await requireApiRole(["ADMIN"]);
  if (!authCheck.ok) return authCheck.response;

  const invoices = await prisma.invoice.findMany({
    orderBy: [{ year: "desc" }, { month: "desc" }, { sequenceNumber: "desc" }],
    take: 200,
    include: {
      restaurant: {
        select: { id: true, nameEn: true, nameAr: true, slug: true },
      },
    },
  });

  return NextResponse.json({
    invoices: invoices.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      restaurantId: inv.restaurantId,
      restaurantNameEn: inv.restaurant.nameEn,
      restaurantNameAr: inv.restaurant.nameAr,
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

export async function POST(req: NextRequest) {
  const authCheck = await requireApiRole(["ADMIN"]);
  if (!authCheck.ok) return authCheck.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = generateInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid invoice parameters" }, { status: 400 });
  }

  try {
    const result = await generateMonthlyInvoice({
      restaurantId: parsed.data.restaurantId,
      year: parsed.data.year,
      month: parsed.data.month,
      targetStatus: parsed.data.targetStatus,
      actorUserId: authCheck.user.id,
      actorEmail: authCheck.user.email ?? "admin",
    });

    return NextResponse.json({
      idempotentReuse: result.idempotentReuse,
      invoice: {
        id: result.invoice.id,
        invoiceNumber: result.invoice.invoiceNumber,
        restaurantId: result.invoice.restaurantId,
        year: result.invoice.year,
        month: result.invoice.month,
        totalOrders: result.invoice.totalOrders,
        grossSalesAed: result.invoice.grossSalesAed.toFixed(2),
        periodFeesAed: result.invoice.periodFeesAed.toFixed(2),
        adjustmentsAed: result.invoice.adjustmentsAed.toFixed(2),
        totalFeesAed: result.invoice.totalFeesAed.toFixed(2),
        status: result.invoice.status,
        generatedAt: result.invoice.generatedAt.toISOString(),
        paidAt: result.invoice.paidAt ? result.invoice.paidAt.toISOString() : null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not generate invoice";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
