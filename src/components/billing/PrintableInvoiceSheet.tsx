"use client";

import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import { BRAND } from "@/config/brand";
import { formatDubaiDateTime, type InvoiceLineItemsSnapshot } from "@/lib/billing/invoices";
import { type Locale, pickLocalized } from "@/lib/i18n/dictionaries";

export interface PrintableInvoiceData {
  id: string;
  invoiceNumber: string;
  year: number;
  month: number;
  status: string;
  totalOrders: number;
  grossSalesAed: string;
  periodFeesAed: string;
  adjustmentsAed: string;
  totalFeesAed: string;
  generatedAtIso: string;
  paidAtIso: string | null;
  currency: string;
  restaurant: {
    nameEn: string;
    nameAr: string;
    slug: string;
    cuisine: string;
    branches: Array<{ nameEn: string; nameAr: string; addressEn: string | null; city: string }>;
  };
  snapshot: InvoiceLineItemsSnapshot;
}

export function PrintableInvoiceSheet({
  locale,
  backHref,
  backLabel,
  invoice,
}: {
  locale: Locale;
  backHref: string;
  backLabel: string;
  invoice: PrintableInvoiceData;
}) {
  const isAr = locale === "ar";
  const ymLabel = `${invoice.year}-${String(invoice.month).padStart(2, "0")}`;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6 print:max-w-none print:p-0">
      {/* Top toolbar (hidden when printing) */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={backHref}
          className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-[var(--accent-primary)] hover:underline"
        >
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
          <span>{backLabel}</span>
        </Link>

        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[var(--accent-primary)] px-4 py-2 text-xs font-bold text-white hover:bg-[var(--accent-hover)]"
        >
          <Printer className="h-4 w-4" />
          <span>{isAr ? "طباعة / حفظ كملف PDF" : "Print / Save as PDF"}</span>
        </button>
      </div>

      {/* Printable Invoice Sheet */}
      <div className="space-y-8 rounded-3xl border border-[var(--border-subtle)] bg-white p-6 text-neutral-900 shadow-sm sm:p-10 print:rounded-none print:border-0 print:shadow-none">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-6 border-b border-neutral-200 pb-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-amber-700">
              {isAr ? BRAND.nameAr : BRAND.nameEn} —{" "}
              {isAr ? "فاتورة رسوم المنصة" : "Platform Fee Invoice"}
            </p>
            <h1 className="mt-1 font-mono text-3xl font-extrabold">{invoice.invoiceNumber}</h1>
            <p className="mt-1 text-xs text-neutral-600">
              {isAr ? "فترة الفوترة (توقيت دبي Asia/Dubai):" : "Billing Period (Asia/Dubai UTC+4):"}{" "}
              <strong className="font-mono">{ymLabel}</strong>
            </p>
          </div>

          <div className="text-end">
            <span
              className={`inline-block rounded-full px-3 py-1 text-xs font-extrabold uppercase ${
                invoice.status === "PAID"
                  ? "bg-emerald-100 text-emerald-800"
                  : invoice.status === "ISSUED"
                    ? "bg-amber-100 text-amber-900"
                    : "bg-neutral-200 text-neutral-800"
              }`}
            >
              {invoice.status}
            </span>
            <p className="mt-2 text-xs text-neutral-600">
              {isAr ? "تاريخ الإصدار:" : "Generated:"}{" "}
              {formatDubaiDateTime(invoice.generatedAtIso, locale)}
            </p>
            {invoice.paidAtIso && (
              <p className="text-xs font-semibold text-emerald-700">
                {isAr ? "تاريخ السداد:" : "Paid:"} {formatDubaiDateTime(invoice.paidAtIso, locale)}
              </p>
            )}
          </div>
        </div>

        {/* Billed To Restaurant */}
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase text-neutral-500">
              {isAr ? "فاتورة إلى المطعم" : "Billed To Restaurant"}
            </p>
            <p className="mt-1 text-lg font-extrabold">
              {pickLocalized(invoice.restaurant.nameEn, invoice.restaurant.nameAr, locale)}
            </p>
            <p className="text-xs text-neutral-600">
              Slug: <span className="font-mono">{invoice.restaurant.slug}</span> •{" "}
              {invoice.restaurant.cuisine}
            </p>
            {invoice.restaurant.branches.map((b, idx) => (
              <p key={idx} className="mt-0.5 text-xs text-neutral-600">
                {pickLocalized(b.nameEn, b.nameAr, locale)} — {b.addressEn || b.city} ({b.city})
              </p>
            ))}
          </div>

          <div className="rounded-2xl bg-neutral-50 p-4 text-xs">
            <p className="font-bold uppercase text-neutral-500">
              {isAr ? "ملخص الفترة" : "Period Summary"}
            </p>
            <div className="mt-2 space-y-1">
              <div className="flex justify-between">
                <span>{isAr ? "الطلبات المقبولة:" : "Accepted Orders:"}</span>
                <span className="font-mono font-bold">{invoice.totalOrders}</span>
              </div>
              <div className="flex justify-between">
                <span>{isAr ? "إجمالي مبيعات الطلبات:" : "Gross Order Sales:"}</span>
                <span className="font-mono font-bold">
                  {invoice.currency} {invoice.grossSalesAed}
                </span>
              </div>
              <div className="flex justify-between">
                <span>{isAr ? "رسوم الفترة:" : "Period Platform Fees:"}</span>
                <span className="font-mono font-bold">
                  {invoice.currency} {invoice.periodFeesAed}
                </span>
              </div>
              {invoice.adjustmentsAed !== "0.00" && (
                <div className="flex justify-between text-emerald-700">
                  <span>{isAr ? "تسويات إلغاءات سابقة:" : "Prior-Invoice Void Credits:"}</span>
                  <span className="font-mono font-bold">
                    {invoice.currency} {invoice.adjustmentsAed}
                  </span>
                </div>
              )}
              <div className="flex justify-between border-t border-neutral-200 pt-1.5 text-sm font-extrabold">
                <span>{isAr ? "صافي المبلغ المستحق:" : "Net Amount Due:"}</span>
                <span className="font-mono">
                  {invoice.currency} {invoice.totalFeesAed}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Itemized Order Fee Lines */}
        <div className="space-y-2">
          <h2 className="text-sm font-extrabold uppercase text-neutral-700">
            {isAr
              ? `تفاصيل رسوم الطلبات (${invoice.snapshot.feeLines.length})`
              : `Itemized Accepted Orders (${invoice.snapshot.feeLines.length})`}
          </h2>

          {invoice.snapshot.feeLines.length === 0 ? (
            <p className="rounded-xl border border-neutral-200 p-4 text-xs text-neutral-500">
              {isAr
                ? "لا توجد طلبات مقبولة خلال هذا الشهر بتوقيت دبي."
                : "No accepted orders recorded during this Asia/Dubai calendar month."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-start text-xs">
                <thead>
                  <tr className="border-b border-neutral-200 text-neutral-500">
                    <th className="py-2 text-start">{isAr ? "رقم الطلب" : "Order #"}</th>
                    <th className="py-2 text-start">{isAr ? "الطاولة" : "Table"}</th>
                    <th className="py-2 text-start">
                      {isAr ? "وقت القبول (دبي)" : "Accepted (Dubai)"}
                    </th>
                    <th className="py-2 text-end">{isAr ? "قيمة الطلب" : "Subtotal"}</th>
                    <th className="py-2 text-end">{isAr ? "النسبة / السقف" : "Rule"}</th>
                    <th className="py-2 text-end">{isAr ? "رسوم المنصة" : "Fee"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {invoice.snapshot.feeLines.map((line) => (
                    <tr key={line.feeId}>
                      <td className="py-2 font-mono font-bold">#{line.orderNumber}</td>
                      <td className="py-2 font-mono">{line.tableCode}</td>
                      <td className="py-2">{formatDubaiDateTime(line.recordedAtIso, locale)}</td>
                      <td className="py-2 text-end font-mono">
                        {invoice.currency} {line.orderSubtotalAed}
                      </td>
                      <td className="py-2 text-end font-mono text-neutral-500">
                        min({invoice.currency} {line.feeCapAppliedAed}, {line.feePercentageApplied}
                        %)
                      </td>
                      <td className="py-2 text-end font-mono font-bold">
                        {invoice.currency} {line.feeAmountAed}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Post-Invoice Void Credit Adjustments (if any) */}
        {invoice.snapshot.adjustmentLines.length > 0 && (
          <div className="space-y-2 border-t border-neutral-200 pt-4">
            <h2 className="text-sm font-extrabold uppercase text-emerald-800">
              {isAr
                ? "تسويات طلبات ملغاة بعد إصدار فواتير سابقة"
                : "Credit Adjustments for Orders Voided After Prior Issued Invoices"}
            </h2>
            <table className="w-full border-collapse text-start text-xs">
              <thead>
                <tr className="border-b border-neutral-200 text-neutral-500">
                  <th className="py-2 text-start">{isAr ? "رقم الطلب" : "Order #"}</th>
                  <th className="py-2 text-start">
                    {isAr ? "الفاتورة الأصلية" : "Original Invoice"}
                  </th>
                  <th className="py-2 text-start">
                    {isAr ? "تاريخ الإلغاء" : "Voided At (Dubai)"}
                  </th>
                  <th className="py-2 text-end">{isAr ? "قيمة الخصم" : "Credit Adjustment"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {invoice.snapshot.adjustmentLines.map((adj) => (
                  <tr key={adj.feeId}>
                    <td className="py-2 font-mono font-bold">#{adj.orderNumber}</td>
                    <td className="py-2 font-mono">
                      {adj.originalInvoiceNumber} ({adj.originalYear}-
                      {String(adj.originalMonth).padStart(2, "0")})
                    </td>
                    <td className="py-2">{formatDubaiDateTime(adj.voidedAtIso, locale)}</td>
                    <td className="py-2 text-end font-mono font-bold text-emerald-700">
                      {invoice.currency} {adj.creditAmountAed}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer Totals */}
        <div className="flex justify-end border-t border-neutral-300 pt-6">
          <div className="w-full max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between text-neutral-600">
              <span>{isAr ? "رسوم الفترة:" : "Period Fees:"}</span>
              <span className="font-mono">
                {invoice.currency} {invoice.periodFeesAed}
              </span>
            </div>
            <div className="flex justify-between text-neutral-600">
              <span>{isAr ? "التسويات:" : "Adjustments:"}</span>
              <span className="font-mono">
                {invoice.currency} {invoice.adjustmentsAed}
              </span>
            </div>
            <div className="flex justify-between border-t border-neutral-300 pt-2 text-base font-extrabold">
              <span>{isAr ? "الإجمالي المستحق:" : "Total Due:"}</span>
              <span className="font-mono">
                {invoice.currency} {invoice.totalFeesAed}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
