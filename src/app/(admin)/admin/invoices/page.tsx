import {
  type AdminInvoiceRow,
  InvoicesAdminClient,
} from "@/app/(admin)/admin/invoices/InvoicesAdminClient";
import { requirePageRole } from "@/lib/auth/rbac";
import { getCurrentDubaiYearMonth } from "@/lib/billing/invoices";
import { prisma } from "@/lib/db";
import { getI18nContext } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function AdminInvoicesPage() {
  const [, { locale }, restaurants, invoices, setting] = await Promise.all([
    requirePageRole(["ADMIN"]),
    getI18nContext(),
    prisma.restaurant.findMany({
      orderBy: { nameEn: "asc" },
      select: { id: true, nameEn: true, nameAr: true },
    }),
    prisma.invoice.findMany({
      orderBy: [{ year: "desc" }, { month: "desc" }, { sequenceNumber: "desc" }],
      take: 200,
      include: {
        restaurant: { select: { nameEn: true, nameAr: true } },
      },
    }),
    prisma.platformSetting.findUnique({ where: { id: "default" } }),
  ]);

  const dubaiNow = getCurrentDubaiYearMonth();
  const rows: AdminInvoiceRow[] = invoices.map((inv) => ({
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
    generatedAtIso: inv.generatedAt.toISOString(),
    paidAtIso: inv.paidAt ? inv.paidAt.toISOString() : null,
  }));

  return (
    <InvoicesAdminClient
      locale={locale}
      currency={setting?.currency ?? "AED"}
      defaultYear={dubaiNow.year}
      defaultMonth={dubaiNow.month}
      restaurants={restaurants}
      initialInvoices={rows}
    />
  );
}
