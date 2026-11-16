"use client";

import { Check, Copy, ExternalLink, Plus, Printer, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Locale } from "@/lib/i18n/dictionaries";

export interface SerializedTableWithQr {
  id: string;
  tableCode: string;
  displayName: string;
  capacity: number;
  branchId: string | null;
  branchName: string | null;
  isActive: boolean;
  qrPath: string;
  qrUrl: string;
  qrSvg: string;
}

export function TablesManagerClient({
  locale,
  restaurantId,
  restaurantName,
  branches,
  tables,
}: {
  locale: Locale;
  restaurantId: string;
  restaurantName: string;
  branches: Array<{ id: string; nameEn: string; nameAr: string }>;
  tables: SerializedTableWithQr[];
}) {
  const router = useRouter();
  const isAr = locale === "ar";

  const [tableCode, setTableCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [capacity, setCapacity] = useState(4);
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCreateTable(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const res = await fetch(`/api/restaurant/${restaurantId}/tables`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tableCode,
        displayName,
        capacity,
        branchId: branchId || null,
      }),
    });
    setBusy(false);

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error || "Could not create table");
      return;
    }

    setTableCode("");
    setDisplayName("");
    router.refresh();
  }

  async function handleToggleActive(table: SerializedTableWithQr) {
    await fetch(`/api/restaurant/${restaurantId}/tables`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tableId: table.id,
        isActive: !table.isActive,
      }),
    });
    router.refresh();
  }

  async function handleDeleteTable(tableId: string) {
    await fetch(`/api/restaurant/${restaurantId}/tables?tableId=${encodeURIComponent(tableId)}`, {
      method: "DELETE",
    });
    router.refresh();
  }

  async function copyUrl(table: SerializedTableWithQr) {
    await navigator.clipboard.writeText(table.qrUrl);
    setCopiedId(table.id);
    setTimeout(() => setCopiedId(null), 1800);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            {isAr
              ? `الطاولات ورموز QR — ${restaurantName}`
              : `Tables & QR Codes — ${restaurantName}`}
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {isAr
              ? "أنشئ رموز QR لكل طاولة واطبع ورقة الرموز لتثبيتها على الطاولات."
              : "Create table QR codes (/r/{slug}/t/{code}) and print branded table tent sheets."}
          </p>
        </div>

        <Link
          href={`/dashboard/tables/print?restaurantId=${encodeURIComponent(restaurantId)}`}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--accent-primary)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--accent-hover)]"
        >
          <Printer className="h-4 w-4" />
          <span>{isAr ? "طباعة / تحميل ورقة رموز QR (PDF)" : "Printable QR Sheet (PDF)"}</span>
        </Link>
      </div>

      {/* Add Table Form */}
      <form
        onSubmit={handleCreateTable}
        className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-sm"
      >
        <h2 className="text-base font-bold">{isAr ? "إضافة طاولة جديدة" : "Create New Table"}</h2>
        {error && (
          <p className="mt-2 rounded-xl bg-[var(--accent-soft)] px-3 py-2 text-xs font-semibold text-[var(--accent-primary)]">
            {error}
          </p>
        )}
        <div className="mt-4 grid gap-3 sm:grid-cols-5">
          <input
            required
            placeholder="Code (e.g. T6)"
            value={tableCode}
            onChange={(e) => setTableCode(e.target.value)}
            className="min-h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 font-mono text-sm"
          />
          <input
            required
            placeholder="Table 6 — Garden"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="min-h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm sm:col-span-2"
          />
          <input
            type="number"
            min={1}
            max={30}
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value) || 4)}
            aria-label="Table capacity"
            className="min-h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm"
          />
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="min-h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm"
          >
            <option value="">All / No specific branch</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {isAr ? b.nameAr : b.nameEn}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[var(--accent-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          <Plus className="h-4 w-4" />
          <span>{isAr ? "إنشاء الطاولة" : "Create Table"}</span>
        </button>
      </form>

      {/* QR Cards Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {tables.map((table) => (
          <article
            key={table.id}
            className="flex flex-col justify-between rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-sm"
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="inline-block rounded-lg bg-[var(--accent-soft)] px-2.5 py-0.5 font-mono text-xs font-bold text-[var(--accent-primary)]">
                    {table.tableCode}
                  </span>
                  <h3 className="mt-1.5 font-bold text-[var(--text-primary)]">
                    {table.displayName}
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {table.capacity} seats {table.branchName ? `• ${table.branchName}` : ""}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleToggleActive(table)}
                  className={`min-h-8 rounded-full px-3 py-1 text-xs font-semibold ${
                    table.isActive
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      : "bg-[var(--bg-muted)] text-[var(--text-secondary)]"
                  }`}
                >
                  {table.isActive ? "Active" : "Inactive"}
                </button>
              </div>

              <div
                className="mx-auto my-4 flex h-44 w-44 items-center justify-center rounded-2xl border border-[var(--border-subtle)] bg-white p-2"
                dangerouslySetInnerHTML={{ __html: table.qrSvg }}
              />

              <p className="truncate rounded-lg bg-[var(--bg-canvas)] px-2.5 py-1.5 font-mono text-[11px] text-[var(--text-secondary)]">
                {table.qrPath}
              </p>
            </div>

            <div className="mt-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => copyUrl(table)}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-semibold"
                >
                  {copiedId === table.id ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  <span>{copiedId === table.id ? "Copied" : "Copy Link"}</span>
                </button>
                <Link
                  href={table.qrPath}
                  className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-semibold"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Open</span>
                </Link>
              </div>

              <button
                type="button"
                onClick={() => handleDeleteTable(table.id)}
                aria-label={`Delete ${table.displayName}`}
                className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-xl border border-[var(--border-subtle)] text-red-600 hover:bg-red-500/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
