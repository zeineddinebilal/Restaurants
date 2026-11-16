"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { type Locale, pickLocalized } from "@/lib/i18n/dictionaries";

export interface AdminRestaurantRow {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string;
  cuisine: string;
  status: "PENDING" | "APPROVED" | "SUSPENDED";
  isDemo: boolean;
  ownerEmail: string;
  ownerName: string;
  menuItemCount: number;
  orderCount: number;
  createdAtIso: string;
}

export function RestaurantsAdminClient({
  locale,
  initialRestaurants,
}: {
  locale: Locale;
  initialRestaurants: AdminRestaurantRow[];
}) {
  const router = useRouter();
  const isAr = locale === "ar";
  const [rows, setRows] = useState(initialRestaurants);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.nameEn.toLowerCase().includes(q) ||
        r.nameAr.toLowerCase().includes(q) ||
        r.slug.toLowerCase().includes(q) ||
        r.ownerEmail.toLowerCase().includes(q)
      );
    });
  }, [rows, query, statusFilter]);

  async function updateStatus(restaurantId: string, nextStatus: "APPROVED" | "SUSPENDED") {
    setBusyId(restaurantId);
    setError(null);
    const res = await fetch(`/api/admin/restaurants/${restaurantId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusyId(null);

    if (!res.ok) {
      setError(data.error || "Could not update restaurant status");
      return;
    }

    setRows((prev) => prev.map((r) => (r.id === restaurantId ? { ...r, status: nextStatus } : r)));
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-extrabold">
          {isAr ? "إدارة المطاعم (الاعتماد والتعليق)" : "Restaurants Approval & Governance"}
        </h1>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          {isAr
            ? "المطاعم المعلقة (PENDING) غير مرئية للضيوف ولا تستقبل طلبات. التعليق (SUSPENDED) يوقف الطلب فوراً."
            : "PENDING restaurants are hidden from diners and cannot take orders. SUSPENDED blocks ordering immediately."}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={isAr ? "بحث بالاسم أو البريد..." : "Search name, slug, or owner email..."}
          className="min-h-10 flex-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
          className="min-h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-semibold"
        >
          <option value="ALL">{isAr ? "جميع الحالات" : "All Statuses"}</option>
          <option value="PENDING">PENDING</option>
          <option value="APPROVED">APPROVED</option>
          <option value="SUSPENDED">SUSPENDED</option>
        </select>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs font-semibold text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs">
        <table className="w-full text-start text-xs">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
              <th className="py-2.5 text-start">{isAr ? "المطعم" : "Restaurant"}</th>
              <th className="py-2.5 text-start">{isAr ? "المالك" : "Owner"}</th>
              <th className="py-2.5 text-start">{isAr ? "الحالة" : "Status"}</th>
              <th className="py-2.5 text-end">{isAr ? "الأطباق / الطلبات" : "Dishes / Orders"}</th>
              <th className="py-2.5 text-end">{isAr ? "الإجراء" : "Action"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {filtered.map((r) => (
              <tr key={r.id}>
                <td className="py-3">
                  <p className="font-bold text-[var(--text-primary)]">
                    {pickLocalized(r.nameEn, r.nameAr, locale)}{" "}
                    {r.isDemo && (
                      <span className="rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--accent-primary)]">
                        DEMO
                      </span>
                    )}
                  </p>
                  <p className="font-mono text-[11px] text-[var(--text-secondary)]">
                    /{r.slug} • {r.cuisine}
                  </p>
                </td>
                <td className="py-3">
                  <p className="font-semibold">{r.ownerName}</p>
                  <p className="text-[11px] text-[var(--text-secondary)]">{r.ownerEmail}</p>
                </td>
                <td className="py-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                      r.status === "APPROVED"
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        : r.status === "SUSPENDED"
                          ? "bg-red-500/15 text-red-700 dark:text-red-300"
                          : "bg-amber-500/20 text-amber-800 dark:text-amber-300"
                    }`}
                  >
                    {r.status}
                  </span>
                </td>
                <td className="py-3 text-end font-mono">
                  {r.menuItemCount} / {r.orderCount}
                </td>
                <td className="py-3 text-end">
                  <div className="inline-flex gap-2">
                    {r.status !== "APPROVED" && (
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => void updateStatus(r.id, "APPROVED")}
                        className="min-h-8 rounded-lg bg-emerald-600 px-3 py-1 font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {isAr ? "اعتماد" : "Approve"}
                      </button>
                    )}
                    {r.status !== "SUSPENDED" && (
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => void updateStatus(r.id, "SUSPENDED")}
                        className="min-h-8 rounded-lg bg-red-600 px-3 py-1 font-bold text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {isAr ? "تعليق" : "Suspend"}
                      </button>
                    )}
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
