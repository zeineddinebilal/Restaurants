"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { type Locale, pickLocalized } from "@/lib/i18n/dictionaries";

export interface AdminInvoiceRow {
  id: string;
  invoiceNumber: string;
  restaurantId: string;
  restaurantNameEn: string;
  restaurantNameAr: string;
  year: number;
  month: number;
  totalOrders: number;
  grossSalesAed: string;
  periodFeesAed: string;
  adjustmentsAed: string;
  totalFeesAed: string;
  status: "DRAFT" | "ISSUED" | "PAID";
  generatedAtIso: string;
  paidAtIso: string | null;
}

export function InvoicesAdminClient({
  locale,
  currency,
  defaultYear,
  defaultMonth,
  restaurants,
  initialInvoices,
}: {
  locale: Locale;
  currency: string;
  defaultYear: number;
  defaultMonth: number;
  restaurants: Array<{ id: string; nameEn: string; nameAr: string }>;
  initialInvoices: AdminInvoiceRow[];
}) {
  const router = useRouter();
  const isAr = locale === "ar";

  const [selectedRestaurantId, setSelectedRestaurantId] = useState(restaurants[0]?.id ?? "");
  const [year, setYear] = useState(defaultYear);
  const [month, setMonth] = useState(defaultMonth);
  const [targetStatus, setTargetStatus] = useState<"DRAFT" | "ISSUED">("ISSUED");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedRestaurantId || busy) return;

    setBusy(true);
    setError(null);
    setNotice(null);

    const res = await fetch("/api/admin/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurantId: selectedRestaurantId,
        year,
        month,
        targetStatus,
      }),
    });

    const data = (await res.json().catch(() => ({}))) as {
      idempotentReuse?: boolean;
      invoice?: { invoiceNumber: string; status: string };
      error?: string;
    };
    setBusy(false);

    if (!res.ok || !data.invoice) {
      setError(data.error || "Could not generate invoice");
      return;
    }

    setNotice(
      data.idempotentReuse
        ? `Existing frozen invoice ${data.invoice.invoiceNumber} (${data.invoice.status}) returned unchanged.`
        : `Invoice ${data.invoice.invoiceNumber} (${data.invoice.status}) generated.`,
    );
    router.refresh();
  }

  async function handleTransition(invoiceId: string, nextStatus: "ISSUED" | "PAID") {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/invoices/${invoiceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);

    if (!res.ok) {
      setError(data.error || "Could not update invoice status");
      return;
    }
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-extrabold">
          {isAr ? "الفواتير الشهرية (بتوقيت دبي)" : "Monthly Invoices (Asia/Dubai Time)"}
        </h1>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          {isAr
            ? "الفواتير المصدرة (ISSUED) مجمدة بالكامل؛ أي إلغاء لاحق يظهر كتسوية دائنة في الفاتورة التالية."
            : "Month boundaries use Asia/Dubai (UTC+4) midnight. ISSUED invoices are frozen; later order voids carry forward as credit adjustments on the next invoice."}
        </p>
      </div>

      {/* Generator Form */}
      <form
        onSubmit={handleGenerate}
        className="grid gap-4 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-xs sm:grid-cols-5"
      >
        <div className="sm:col-span-2">
          <label className="block text-xs font-bold">{isAr ? "المطعم" : "Restaurant"}</label>
          <select
            value={selectedRestaurantId}
            onChange={(e) => setSelectedRestaurantId(e.target.value)}
            className="mt-1 min-h-10 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-xs font-semibold"
          >
            {restaurants.map((r) => (
              <option key={r.id} value={r.id}>
                {pickLocalized(r.nameEn, r.nameAr, locale)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold">{isAr ? "السنة" : "Year"}</label>
          <input
            type="number"
            min={2020}
            max={2100}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="mt-1 min-h-10 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 font-mono text-xs"
          />
        </div>

        <div>
          <label className="block text-xs font-bold">{isAr ? "الشهر" : "Month (1–12)"}</label>
          <input
            type="number"
            min={1}
            max={12}
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="mt-1 min-h-10 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 font-mono text-xs"
          />
        </div>

        <div className="flex flex-col justify-end gap-2">
          <select
            value={targetStatus}
            onChange={(e) => setTargetStatus(e.target.value as "DRAFT" | "ISSUED")}
            aria-label="Invoice status"
            className="min-h-9 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 py-1 text-xs font-semibold"
          >
            <option value="ISSUED">Issue Final (ISSUED)</option>
            <option value="DRAFT">Save Draft (DRAFT)</option>
          </select>
          <button
            type="submit"
            disabled={busy || !selectedRestaurantId}
            className="min-h-10 rounded-xl bg-[var(--accent-primary)] px-4 py-2 text-xs font-bold text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {isAr ? "إنشاء الفاتورة" : "Generate Invoice"}
          </button>
        </div>
      </form>

      {notice && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-semibold text-red-700">
          {error}
        </div>
      )}

      {/* Invoices Table */}
      <div className="overflow-x-auto rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs">
        <table className="w-full text-start text-xs">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
              <th className="py-2.5 text-start">Invoice #</th>
              <th className="py-2.5 text-start">{isAr ? "المطعم" : "Restaurant"}</th>
              <th className="py-2.5 text-start">{isAr ? "الشهر" : "Month"}</th>
              <th className="py-2.5 text-start">{isAr ? "الحالة" : "Status"}</th>
              <th className="py-2.5 text-end">{isAr ? "رسوم الفترة" : "Period Fees"}</th>
              <th className="py-2.5 text-end">{isAr ? "التسويات" : "Adjustments"}</th>
              <th className="py-2.5 text-end">{isAr ? "الإجمالي" : "Net Total"}</th>
              <th className="py-2.5 text-end">{isAr ? "إجراءات" : "Actions"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {initialInvoices.map((inv) => (
              <tr key={inv.id}>
                <td className="py-3 font-mono font-bold">{inv.invoiceNumber}</td>
                <td className="py-3 font-semibold">
                  {pickLocalized(inv.restaurantNameEn, inv.restaurantNameAr, locale)}
                </td>
                <td className="py-3 font-mono">
                  {inv.year}-{String(inv.month).padStart(2, "0")}
                </td>
                <td className="py-3 font-mono font-bold">{inv.status}</td>
                <td className="py-3 text-end font-mono">
                  {currency} {inv.periodFeesAed}
                </td>
                <td className="py-3 text-end font-mono text-emerald-700 dark:text-emerald-300">
                  {currency} {inv.adjustmentsAed}
                </td>
                <td className="py-3 text-end font-mono font-extrabold">
                  {currency} {inv.totalFeesAed}
                </td>
                <td className="py-3 text-end">
                  <div className="inline-flex items-center gap-2">
                    {inv.status === "DRAFT" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleTransition(inv.id, "ISSUED")}
                        className="rounded-lg bg-amber-600 px-2.5 py-1 font-bold text-white"
                      >
                        Issue
                      </button>
                    )}
                    {inv.status === "ISSUED" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleTransition(inv.id, "PAID")}
                        className="rounded-lg bg-emerald-600 px-2.5 py-1 font-bold text-white"
                      >
                        Mark Paid
                      </button>
                    )}
                    <Link
                      href={`/admin/invoices/${inv.id}`}
                      className="font-bold text-[var(--accent-primary)] underline"
                    >
                      {isAr ? "طباعة" : "Print"}
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
