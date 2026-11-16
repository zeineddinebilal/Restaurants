import { requirePageRole } from "@/lib/auth/rbac";
import { formatDubaiDateTime } from "@/lib/billing/invoices";
import { prisma } from "@/lib/db";
import { pickLocalized } from "@/lib/i18n/dictionaries";
import { getI18nContext } from "@/lib/i18n/server";
import { aedToFils, filsToAedString } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function AdminOrdersAndLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ restaurantId?: string }>;
}) {
  const [, { locale }, sp] = await Promise.all([
    requirePageRole(["ADMIN"]),
    getI18nContext(),
    searchParams,
  ]);
  const isAr = locale === "ar";

  const [restaurants, orders, setting] = await Promise.all([
    prisma.restaurant.findMany({
      orderBy: { nameEn: "asc" },
      select: { id: true, nameEn: true, nameAr: true },
    }),
    prisma.order.findMany({
      where: sp.restaurantId ? { restaurantId: sp.restaurantId } : {},
      orderBy: { sentAt: "desc" },
      take: 150,
      include: {
        restaurant: { select: { nameEn: true, nameAr: true } },
        table: { select: { tableCode: true } },
        platformFee: {
          include: { invoice: { select: { invoiceNumber: true } } },
        },
      },
    }),
    prisma.platformSetting.findUnique({ where: { id: "default" } }),
  ]);

  const currency = setting?.currency ?? "AED";
  let activeFeeTotalFils = 0;
  let voidedCount = 0;

  for (const o of orders) {
    if (o.platformFee) {
      if (o.platformFee.isVoided) voidedCount++;
      else activeFeeTotalFils += aedToFils(o.platformFee.feeAmountAed);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold">
            {isAr ? "جميع الطلبات وسجل رسوم المنصة" : "All Orders & Platform Fee Ledger"}
          </h1>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {isAr
              ? `إجمالي الرسوم النشطة المعروضة: ${currency} ${filsToAedString(activeFeeTotalFils)} • رسوم ملغاة: ${voidedCount}`
              : `Active fees in view: ${currency} ${filsToAedString(activeFeeTotalFils)} • Voided fee rows: ${voidedCount}`}
          </p>
        </div>

        <form method="GET" className="flex items-center gap-2">
          <select
            name="restaurantId"
            defaultValue={sp.restaurantId ?? ""}
            aria-label="Filter by restaurant"
            className="min-h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-semibold"
          >
            <option value="">{isAr ? "جميع المطاعم" : "All Restaurants"}</option>
            {restaurants.map((r) => (
              <option key={r.id} value={r.id}>
                {pickLocalized(r.nameEn, r.nameAr, locale)}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="min-h-10 rounded-xl bg-[var(--accent-primary)] px-4 py-2 text-xs font-bold text-white"
          >
            {isAr ? "تصفية" : "Filter"}
          </button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs">
        <table className="w-full text-start text-xs">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
              <th className="py-2.5 text-start">{isAr ? "الطلب" : "Order"}</th>
              <th className="py-2.5 text-start">
                {isAr ? "المطعم / الطاولة" : "Restaurant / Table"}
              </th>
              <th className="py-2.5 text-start">{isAr ? "الوقت (دبي)" : "Sent (Dubai)"}</th>
              <th className="py-2.5 text-start">{isAr ? "الحالة" : "Status"}</th>
              <th className="py-2.5 text-end">{isAr ? "المبلغ" : "Subtotal"}</th>
              <th className="py-2.5 text-end">{isAr ? "سجل الرسوم" : "PlatformFee Ledger"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {orders.map((o) => (
              <tr key={o.id}>
                <td className="py-2.5 font-mono font-bold">#{o.orderNumber}</td>
                <td className="py-2.5">
                  <span className="font-semibold">
                    {pickLocalized(o.restaurant.nameEn, o.restaurant.nameAr, locale)}
                  </span>{" "}
                  <span className="font-mono text-[var(--text-secondary)]">
                    ({o.table.tableCode})
                  </span>
                </td>
                <td className="py-2.5">{formatDubaiDateTime(o.sentAt, locale)}</td>
                <td className="py-2.5 font-mono font-bold">{o.status}</td>
                <td className="py-2.5 text-end font-mono">
                  {currency} {o.subtotalAed.toFixed(2)}
                </td>
                <td className="py-2.5 text-end font-mono">
                  {!o.platformFee ? (
                    <span className="text-[var(--text-secondary)]">
                      {isAr ? "لم يُقبل بعد" : "Not accepted"}
                    </span>
                  ) : o.platformFee.isVoided ? (
                    <span className="rounded-full bg-red-500/15 px-2.5 py-0.5 font-bold text-red-700 dark:text-red-300">
                      VOIDED ({currency} 0.00)
                    </span>
                  ) : (
                    <span className="font-bold text-emerald-700 dark:text-emerald-300">
                      {currency} {o.platformFee.feeAmountAed.toFixed(2)}
                      {o.platformFee.invoice ? ` [${o.platformFee.invoice.invoiceNumber}]` : ""}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
