"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDubaiDateTime } from "@/lib/billing/invoices";
import type { Locale } from "@/lib/i18n/dictionaries";

export interface AuditLogView {
  id: string;
  actorEmail: string;
  action: string;
  targetType: string;
  summary: string;
  createdAtIso: string;
}

export function SettingsAdminClient({
  locale,
  initialSettings,
  auditLogs,
}: {
  locale: Locale;
  initialSettings: {
    feePercentage: string;
    feeCapAed: string;
    currency: string;
    tableSessionTtlHours: number;
  };
  auditLogs: AuditLogView[];
}) {
  const router = useRouter();
  const isAr = locale === "ar";

  const [feePercentage, setFeePercentage] = useState(initialSettings.feePercentage);
  const [feeCapAed, setFeeCapAed] = useState(initialSettings.feeCapAed);
  const [currency, setCurrency] = useState(initialSettings.currency);
  const [ttlHours, setTtlHours] = useState(initialSettings.tableSessionTtlHours);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSavedMsg(null);

    const res = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        feePercentage,
        feeCapAed,
        currency,
        tableSessionTtlHours: Number(ttlHours),
      }),
    });

    const data = (await res.json().catch(() => ({}))) as {
      settings?: {
        feePercentage: string;
        feeCapAed: string;
        currency: string;
        tableSessionTtlHours: number;
      };
      error?: string;
    };
    setSaving(false);

    if (!res.ok || !data.settings) {
      setError(data.error || "Failed to save settings");
      return;
    }

    setFeePercentage(data.settings.feePercentage);
    setFeeCapAed(data.settings.feeCapAed);
    setCurrency(data.settings.currency);
    setTtlHours(data.settings.tableSessionTtlHours);
    setSavedMsg(
      isAr
        ? "تم حفظ الإعدادات وتسجيل العملية في سجل التدقيق."
        : "Settings saved and recorded in the Admin Audit Log.",
    );
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-extrabold">
          {isAr ? "إعدادات رسوم المنصة وسجل التدقيق" : "Platform Settings & Audit Log"}
        </h1>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          {isAr
            ? "أي تعديل على النسبة أو السقف ينطبق فقط على الطلبات المقبولة مستقبلاً (الطلبات السابقة تحتفظ بالقيم وقت القبول)."
            : "Changes to fee % or cap apply strictly to future accepted orders; past PlatformFee rows retain their snapshotted rate and cap."}
        </p>
      </div>

      <form
        onSubmit={handleSave}
        className="space-y-4 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-xs"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="block text-xs font-bold">
              {isAr ? "نسبة الرسوم (0–100%)" : "Fee Percentage (0–100%)"}
            </label>
            <input
              type="text"
              value={feePercentage}
              onChange={(e) => setFeePercentage(e.target.value)}
              className="mt-1 min-h-10 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 font-mono text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold">
              {isAr ? "الحد الأقصى للرسوم (>= 0)" : "Fee Cap (>= 0.00)"}
            </label>
            <input
              type="text"
              value={feeCapAed}
              onChange={(e) => setFeeCapAed(e.target.value)}
              className="mt-1 min-h-10 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 font-mono text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold">{isAr ? "العملة" : "Currency"}</label>
            <input
              type="text"
              maxLength={3}
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              className="mt-1 min-h-10 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 font-mono text-sm uppercase"
            />
          </div>

          <div>
            <label className="block text-xs font-bold">
              {isAr ? "انتهاء جلسة الطاولة (ساعات)" : "Table Session TTL (Hours)"}
            </label>
            <input
              type="number"
              min={1}
              max={24}
              value={ttlHours}
              onChange={(e) => setTtlHours(Number(e.target.value))}
              className="mt-1 min-h-10 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 font-mono text-sm"
            />
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs font-semibold text-red-700">
            {error}
          </div>
        )}
        {savedMsg && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
            {savedMsg}
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="min-h-11 rounded-2xl bg-[var(--accent-primary)] px-6 py-2.5 text-xs font-extrabold text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {saving ? "Saving..." : isAr ? "حفظ الإعدادات" : "Save Settings"}
        </button>
      </form>

      {/* Audit Log History */}
      <section className="space-y-4 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-xs">
        <h2 className="text-lg font-extrabold">
          {isAr ? "سجل التدقيق الكامل (من غيّر ماذا ومتى)" : "Audit Log (Who Changed What & When)"}
        </h2>
        {auditLogs.length === 0 ? (
          <p className="text-xs text-[var(--text-secondary)]">No audit entries recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-xs">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
                  <th className="py-2 text-start">Time (Dubai)</th>
                  <th className="py-2 text-start">Actor</th>
                  <th className="py-2 text-start">Action</th>
                  <th className="py-2 text-start">Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="py-2.5 font-mono text-[var(--text-secondary)]">
                      {formatDubaiDateTime(log.createdAtIso, locale)}
                    </td>
                    <td className="py-2.5 font-mono">{log.actorEmail}</td>
                    <td className="py-2.5 font-mono font-bold">{log.action}</td>
                    <td className="py-2.5">{log.summary}</td>
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
