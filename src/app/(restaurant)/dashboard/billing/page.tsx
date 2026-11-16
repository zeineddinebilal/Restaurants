import { CreditCard, FileText, Receipt } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePageRole } from "@/lib/auth/rbac";
import {
  computeCurrentMonthRestaurantFeeSummary,
  formatDubaiDateTime,
} from "@/lib/billing/invoices";
import { prisma } from "@/lib/db";
import { pickLocalized } from "@/lib/i18n/dictionaries";
import { getI18nContext } from "@/lib/i18n/server";
import { loadManagedRestaurants } from "@/lib/restaurant/loader";

export const dynamic = "force-dynamic";

export default async function RestaurantBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ restaurantId?: string }>;
}) {
  const [user, { locale }, sp] = await Promise.all([
    requirePageRole(["RESTAURANT_OWNER", "ADMIN"]),
    getI18nContext(),
    searchParams,
  ]);

  const { activeRestaurant } = await loadManagedRestaurants(user, sp.restaurantId);
  if (!activeRestaurant) {
    redirect("/dashboard");
  }

  const isAr = locale === "ar";
  const [summary, fees, invoices, platformSetting] = await Promise.all([
    computeCurrentMonthRestaurantFeeSummary({ restaurantId: activeRestaurant.id }),
    prisma.platformFee.findMany({
      where: { restaurantId: activeRestaurant.id },
      orderBy: { recordedAt: "desc" },
      take: 80,
      include: {
        order: {
          select: {
            orderNumber: true,
            status: true,
            table: { select: { tableCode: true } },
          },
        },
        invoice: { select: { invoiceNumber: true } },
      },
    }),
    prisma.invoice.findMany({
      where: { restaurantId: activeRestaurant.id },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      take: 24,
    }),
    prisma.platformSetting.findUnique({ where: { id: "default" } }),
  ]);

  const currency = platformSetting?.currency ?? "AED";
  const ymLabel = `${summary.year}-${String(summary.month).padStart(2, "0")}`;

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-bold text-[var(--accent-primary)]">
          <CreditCard className="h-3.5 w-3.5" />
          <span>{pickLocalized(activeRestaurant.nameEn, activeRestaurant.nameAr, locale)}</span>
        </span>
        <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">
          {isAr ? "الفوترة وسجل رسوم المنصة" : "Billing & Platform Fee Ledger"}
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {isAr
            ? "تدفع المطاعم فقط عند قبول طلب عبر المنصة (١٠٪ بحد أقصى ١.٠٠ درهم لكل طلب مقبول، صفر على الطلبات الملغاة)."
            : "Pay nothing unless an order is accepted via the app — min(AED 1.00, 10% × subtotal), AED 0.00 on cancelled orders."}
        </p>
      </div>

      {/* Current Asia/Dubai Month KPI Cards */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-xs">
          <p className="text-xs font-bold uppercase text-[var(--text-secondary)]">
            {isAr ? `الرسوم المستحقة (${ymLabel})` : `Fees This Month (${ymLabel})`}
          </p>
          <p className="mt-2 font-mono text-3xl font-extrabold text-[var(--accent-primary)]">
            {currency} {summary.netEstimatedDueAed}
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {isAr ? "بتوقيت دبي (Asia/Dubai)" : "Asia/Dubai month boundaries"}
          </p>
        </div>

        <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-xs">
          <p className="text-xs font-bold uppercase text-[var(--text-secondary)]">
            {isAr ? "الطلبات المقبولة هذا الشهر" : "Accepted Orders (Month)"}
          </p>
          <p className="mt-2 font-mono text-3xl font-extrabold">{summary.activeOrderCount}</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {summary.voidedOrderCount} {isAr ? "ملغاة (بدون رسوم)" : "voided (AED 0.00 fee)"}
          </p>
        </div>

        <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-xs">
          <p className="text-xs font-bold uppercase text-[var(--text-secondary)]">
            {isAr ? "مبيعات الشهر عبر المنصة" : "Month Gross Sales"}
          </p>
          <p className="mt-2 font-mono text-3xl font-extrabold">
            {currency} {summary.grossSalesAed}
          </p>
        </div>

        <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-xs">
          <p className="text-xs font-bold uppercase text-[var(--text-secondary)]">
            {isAr ? "تسويات معلقة للفاتورة القادمة" : "Pending Void Credits"}
          </p>
          <p className="mt-2 font-mono text-3xl font-extrabold text-emerald-700 dark:text-emerald-300">
            {currency} {summary.pendingAdjustmentsAed}
          </p>
        </div>
      </section>

      {/* Monthly Invoices */}
      <section className="space-y-4 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-xs">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-[var(--accent-primary)]" />
          <h2 className="text-lg font-extrabold">
            {isAr ? "الفواتير الشهرية" : "Monthly Invoices"}
          </h2>
        </div>

        {invoices.length === 0 ? (
          <p className="text-xs text-[var(--text-secondary)]">
            {isAr ? "لم يتم إصدار فواتير شهرية بعد." : "No monthly invoices issued yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-xs">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
                  <th className="py-2 text-start">{isAr ? "رقم الفاتورة" : "Invoice #"}</th>
                  <th className="py-2 text-start">{isAr ? "الشهر" : "Period"}</th>
                  <th className="py-2 text-start">{isAr ? "الحالة" : "Status"}</th>
                  <th className="py-2 text-end">{isAr ? "الطلبات" : "Orders"}</th>
                  <th className="py-2 text-end">{isAr ? "الإجمالي المستحق" : "Total Due"}</th>
                  <th className="py-2 text-end">{isAr ? "عرض / طباعة" : "Print"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="py-2.5 font-mono font-bold">{inv.invoiceNumber}</td>
                    <td className="py-2.5 font-mono">
                      {inv.year}-{String(inv.month).padStart(2, "0")}
                    </td>
                    <td className="py-2.5">
                      <span className="rounded-full bg-[var(--bg-muted)] px-2.5 py-0.5 font-bold">
                        {inv.status}
                      </span>
                    </td>
                    <td className="py-2.5 text-end font-mono">{inv.totalOrders}</td>
                    <td className="py-2.5 text-end font-mono font-bold">
                      {currency} {inv.totalFeesAed.toFixed(2)}
                    </td>
                    <td className="py-2.5 text-end">
                      <Link
                        href={`/dashboard/billing/invoices/${inv.id}`}
                        className="font-bold text-[var(--accent-primary)] underline"
                      >
                        {isAr ? "فتح الفاتورة" : "View & Print"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Per-Order Fee Ledger */}
      <section className="space-y-4 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-xs">
        <div className="flex items-center gap-2">
          <Receipt className="h-5 w-5 text-[var(--accent-primary)]" />
          <h2 className="text-lg font-extrabold">
            {isAr ? "سجل رسوم الطلبات" : "Per-Order Fee Ledger"}
          </h2>
        </div>

        {fees.length === 0 ? (
          <p className="text-xs text-[var(--text-secondary)]">
            {isAr ? "لا توجد رسوم مسجلة بعد." : "No accepted order fees recorded yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-xs">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
                  <th className="py-2 text-start">{isAr ? "الطلب" : "Order"}</th>
                  <th className="py-2 text-start">{isAr ? "الطاولة" : "Table"}</th>
                  <th className="py-2 text-start">
                    {isAr ? "وقت القبول (دبي)" : "Recorded (Dubai)"}
                  </th>
                  <th className="py-2 text-end">{isAr ? "قيمة الطلب" : "Order Subtotal"}</th>
                  <th className="py-2 text-end">{isAr ? "الرسوم" : "Fee"}</th>
                  <th className="py-2 text-end">{isAr ? "الحالة" : "Ledger Status"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {fees.map((f) => (
                  <tr key={f.id}>
                    <td className="py-2.5 font-mono font-bold">#{f.order.orderNumber}</td>
                    <td className="py-2.5 font-mono">{f.order.table.tableCode}</td>
                    <td className="py-2.5">{formatDubaiDateTime(f.recordedAt, locale)}</td>
                    <td className="py-2.5 text-end font-mono">
                      {currency} {f.orderSubtotalAed.toFixed(2)}
                    </td>
                    <td className="py-2.5 text-end font-mono font-bold">
                      {f.isVoided ? `${currency} 0.00` : `${currency} ${f.feeAmountAed.toFixed(2)}`}
                    </td>
                    <td className="py-2.5 text-end">
                      {f.isVoided ? (
                        <span className="rounded-full bg-red-500/15 px-2.5 py-0.5 font-semibold text-red-700 dark:text-red-300">
                          {isAr ? "ملغى (صفر)" : "Voided (Cancelled)"}
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 font-semibold text-emerald-700 dark:text-emerald-300">
                          {f.invoice
                            ? `Invoiced (${f.invoice.invoiceNumber})`
                            : isAr
                              ? "نشط"
                              : "Active"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
