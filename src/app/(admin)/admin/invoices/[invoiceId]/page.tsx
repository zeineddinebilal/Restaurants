import { notFound } from "next/navigation";
import { PrintableInvoiceSheet } from "@/components/billing/PrintableInvoiceSheet";
import { requirePageRole } from "@/lib/auth/rbac";
import { parseInvoiceSnapshot } from "@/lib/billing/invoices";
import { prisma } from "@/lib/db";
import { getI18nContext } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function AdminInvoicePrintPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const [{ invoiceId }, , { locale }] = await Promise.all([
    params,
    requirePageRole(["ADMIN"]),
    getI18nContext(),
  ]);

  const [invoice, setting] = await Promise.all([
    prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        restaurant: {
          include: {
            branches: { where: { isActive: true }, orderBy: { createdAt: "asc" } },
          },
        },
      },
    }),
    prisma.platformSetting.findUnique({ where: { id: "default" } }),
  ]);

  if (!invoice) {
    notFound();
  }

  return (
    <PrintableInvoiceSheet
      locale={locale}
      backHref="/admin/invoices"
      backLabel={locale === "ar" ? "العودة لقائمة الفواتير" : "Back to Invoices"}
      invoice={{
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        year: invoice.year,
        month: invoice.month,
        status: invoice.status,
        totalOrders: invoice.totalOrders,
        grossSalesAed: invoice.grossSalesAed.toFixed(2),
        periodFeesAed: invoice.periodFeesAed.toFixed(2),
        adjustmentsAed: invoice.adjustmentsAed.toFixed(2),
        totalFeesAed: invoice.totalFeesAed.toFixed(2),
        generatedAtIso: invoice.generatedAt.toISOString(),
        paidAtIso: invoice.paidAt ? invoice.paidAt.toISOString() : null,
        currency: setting?.currency ?? "AED",
        restaurant: {
          nameEn: invoice.restaurant.nameEn,
          nameAr: invoice.restaurant.nameAr,
          slug: invoice.restaurant.slug,
          cuisine: invoice.restaurant.cuisine,
          branches: invoice.restaurant.branches.map((b) => ({
            nameEn: b.nameEn,
            nameAr: b.nameAr,
            addressEn: b.addressEn,
            city: b.city,
          })),
        },
        snapshot: parseInvoiceSnapshot(invoice.lineItemsSnapshot),
      }}
    />
  );
}
