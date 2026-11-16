"use client";

import { BarChart3, CheckCircle2, RefreshCw, Sparkles, TrendingUp, Users } from "lucide-react";
import { useState } from "react";
import type {
  AnonymousRestaurantAggregateInput,
  RestaurantInsightsOutput,
} from "@/lib/agents/restaurant-insights";
import { type Locale, pickLocalized } from "@/lib/i18n/dictionaries";
import { ALLERGEN_LABELS, DIET_TAG_LABELS } from "@/lib/menu/taxonomy";

export interface HighAllergenDishView {
  id: string;
  nameEn: string;
  nameAr: string;
  allergens: string[];
}

export function AnalyticsClient({
  locale,
  restaurantId,
  restaurantName,
  initialAggregates,
  initialHighAllergenDishes,
  initialInsights,
  initialAiConfigured,
  initialAiNotice,
}: {
  locale: Locale;
  restaurantId: string;
  restaurantName: string;
  initialAggregates: AnonymousRestaurantAggregateInput;
  initialHighAllergenDishes: HighAllergenDishView[];
  initialInsights: RestaurantInsightsOutput | null;
  initialAiConfigured: boolean;
  initialAiNotice: string | null;
}) {
  const isAr = locale === "ar";
  const [aggregates, setAggregates] = useState(initialAggregates);
  const [insights, setInsights] = useState<RestaurantInsightsOutput | null>(initialInsights);
  const [aiConfigured, setAiConfigured] = useState(initialAiConfigured);
  const [aiNotice, setAiNotice] = useState<string | null>(initialAiNotice);
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefreshInsights() {
    setRefreshing(true);
    setAiNotice(null);
    try {
      const res = await fetch(`/api/restaurant/${restaurantId}/insights`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as {
        aggregates?: AnonymousRestaurantAggregateInput;
        insights?: RestaurantInsightsOutput;
        aiConfigured?: boolean;
        error?: string;
        reason?: string;
      };

      if (!res.ok) {
        if (res.status === 503 || data.reason === "AI_NOT_CONFIGURED") {
          setAiConfigured(false);
        } else {
          setAiNotice(data.error || "Could not refresh AI insights.");
        }
        setRefreshing(false);
        return;
      }

      if (data.aggregates) setAggregates(data.aggregates);
      if (data.insights) setInsights(data.insights);
      setAiConfigured(true);
    } catch {
      setAiNotice(isAr ? "خطأ في الاتصال بالشبكة." : "Network error refreshing insights.");
    } finally {
      setRefreshing(false);
    }
  }

  const dietEntries = Object.entries(aggregates.dietaryScanCounts).sort((a, b) => b[1] - a[1]);
  const allergenEntries = Object.entries(aggregates.allergenScanCounts).sort((a, b) => b[1] - a[1]);

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-bold text-[var(--accent-primary)]">
            <BarChart3 className="h-3.5 w-3.5" />
            <span>{restaurantName}</span>
          </span>
          <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">
            {isAr ? "التحليلات ورؤى الذكاء الاصطناعي" : "Analytics & Dietary Insights"}
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {isAr
              ? "إحصائيات مجمّعة ومجهولة الهوية لعمليات مسح رمز QR والقيود الغذائية والطلبات عبر المنصة."
              : "Anonymous aggregate QR scan demand, menu diet coverage, and orders placed via the platform."}
          </p>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-xs">
          <p className="text-xs font-bold uppercase text-[var(--text-secondary)]">
            {isAr ? "عمليات مسح القائمة" : "Total Menu Scans"}
          </p>
          <p className="mt-2 font-mono text-3xl font-extrabold">{aggregates.totalScans}</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {aggregates.budgetConsciousScans}{" "}
            {isAr ? "بميزانية وجبة محددة" : "with meal budget set"}
          </p>
        </div>

        <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-xs">
          <p className="text-xs font-bold uppercase text-[var(--text-secondary)]">
            {isAr ? "الطلبات المقبولة" : "Accepted Platform Orders"}
          </p>
          <p className="mt-2 font-mono text-3xl font-extrabold">{aggregates.acceptedOrderCount}</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {isAr ? "الطلبات النشطة والمخدومة" : "Accepted, preparing & served"}
          </p>
        </div>

        <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-xs">
          <p className="text-xs font-bold uppercase text-[var(--text-secondary)]">
            {isAr ? "المبيعات عبر المنصة" : "Gross Sales via Platform"}
          </p>
          <p className="mt-2 font-mono text-3xl font-extrabold text-[var(--accent-primary)]">
            AED {aggregates.grossPlatformSalesAed}
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {isAr ? "حساب دقيق بالفلس" : "Exact integer-fils ledger sum"}
          </p>
        </div>

        <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-xs">
          <p className="text-xs font-bold uppercase text-[var(--text-secondary)]">
            {isAr ? "الأطباق الموثقة" : "Verified Menu Coverage"}
          </p>
          <p className="mt-2 font-mono text-3xl font-extrabold">
            {aggregates.verifiedDishCount} / {aggregates.menuDishCount}
          </p>
          <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>{isAr ? "أطباق موثقة الحساسية" : "Restaurant-verified dishes"}</span>
          </p>
        </div>
      </section>

      {/* AI Restaurant Insights Agent Summary (Agent #8) */}
      <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-primary)]">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-extrabold">
                {isAr ? "ملخص وكيل رؤى المطعم (AI)" : "Restaurant Insights Agent Summary"}
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                {isAr
                  ? "يتم التخزين المؤقت يومياً لكل مطعم باستخدام بيانات مجمّعة فقط بدون أي بيانات شخصية للضيوف."
                  : "Cached once per restaurant per UTC day using strictly anonymous aggregate counters (zero diner PII)."}
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={refreshing || !aiConfigured}
            onClick={handleRefreshInsights}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-4 py-2 text-xs font-bold text-[var(--text-primary)] hover:border-[var(--accent-primary)] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            <span>{isAr ? "تحديث الرؤى" : "Refresh Insights"}</span>
          </button>
        </div>

        <div className="mt-4">
          {!aiConfigured ? (
            <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs font-semibold text-amber-800 dark:text-amber-300">
              {isAr
                ? "الذكاء الاصطناعي غير مفعل حالياً (AI not configured) — جميع الرسوم والإحصائيات الحتمية أدناه تعمل بالكامل."
                : "AI not configured — deterministic scan breakdown, top dishes, and menu gap metrics below are 100% active."}
            </div>
          ) : aiNotice ? (
            <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs font-semibold text-amber-800 dark:text-amber-300">
              {aiNotice}
            </div>
          ) : insights ? (
            <div className="space-y-3 rounded-2xl bg-[var(--bg-canvas)] p-4">
              <p className="text-sm font-extrabold text-[var(--accent-primary)]">
                {isAr ? insights.headlineAr : insights.headlineEn}
              </p>
              <ul className="list-disc space-y-1.5 ps-5 text-xs leading-relaxed text-[var(--text-primary)]">
                {(isAr ? insights.recommendationsAr : insights.recommendationsEn).map(
                  (bullet, i) => (
                    <li key={i}>{bullet}</li>
                  ),
                )}
              </ul>
              <p className="text-[11px] text-[var(--text-secondary)]">
                {isAr
                  ? `مخزّن مؤقتاً لتاريخ ${insights.cachedForDay}`
                  : `Cached for UTC day ${insights.cachedForDay}`}
              </p>
            </div>
          ) : (
            <p className="text-xs text-[var(--text-secondary)]">
              {isAr
                ? "اضغط تحديث الرؤى لتوليد الملخص اليومي."
                : "Click Refresh Insights to generate today's summary."}
            </p>
          )}
        </div>
      </section>

      {/* Diner Diet & Allergen Breakdown vs Menu Coverage */}
      <section className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-xs">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-[var(--accent-primary)]" />
            <h2 className="text-lg font-extrabold">
              {isAr ? "توزيع الأنظمة الغذائية للضيوف" : "Diner Diet Breakdown vs Menu Coverage"}
            </h2>
          </div>

          {dietEntries.length === 0 ? (
            <p className="text-xs text-[var(--text-secondary)]">
              {isAr
                ? "لا توجد عمليات مسح بأنظمة غذائية محددة بعد."
                : "No diet-filtered menu scans recorded yet."}
            </p>
          ) : (
            <div className="space-y-3">
              {dietEntries.map(([diet, count]) => {
                const pct =
                  aggregates.totalScans > 0 ? Math.round((count / aggregates.totalScans) * 100) : 0;
                const menuCount = aggregates.menuDietCoverageCounts[diet] ?? 0;
                const labelObj = DIET_TAG_LABELS[diet as keyof typeof DIET_TAG_LABELS];
                const label = labelObj ? (isAr ? labelObj.ar : labelObj.en) : diet;

                return (
                  <div key={diet} className="space-y-1 text-xs">
                    <div className="flex justify-between font-semibold">
                      <span>{label}</span>
                      <span className="font-mono">
                        {count} {isAr ? "مسح" : "scans"} ({pct}%) • {menuCount}{" "}
                        {isAr ? "طبق متاح" : "dishes"}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-muted)]">
                      <div
                        className="h-full rounded-full bg-[var(--accent-primary)]"
                        style={{ width: `${Math.max(4, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-4 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-xs">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-[var(--accent-primary)]" />
            <h2 className="text-lg font-extrabold">
              {isAr ? "الحساسيات الأكثر شيوعاً عند المسح" : "Top Allergens Filtered by Diners"}
            </h2>
          </div>

          {allergenEntries.length === 0 ? (
            <p className="text-xs text-[var(--text-secondary)]">
              {isAr
                ? "لا توجد عمليات مسح بحساسية محددة بعد."
                : "No allergen-filtered scans recorded yet."}
            </p>
          ) : (
            <div className="space-y-3">
              {allergenEntries.map(([allergen, count]) => {
                const pct =
                  aggregates.totalScans > 0 ? Math.round((count / aggregates.totalScans) * 100) : 0;
                const labelObj = ALLERGEN_LABELS[allergen as keyof typeof ALLERGEN_LABELS];
                const label = labelObj ? (isAr ? labelObj.ar : labelObj.en) : allergen;

                return (
                  <div key={allergen} className="space-y-1 text-xs">
                    <div className="flex justify-between font-semibold">
                      <span>{label}</span>
                      <span className="font-mono">
                        {count} {isAr ? "مسح" : "scans"} ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-muted)]">
                      <div
                        className="h-full rounded-full bg-amber-500"
                        style={{ width: `${Math.max(4, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Top Ordered Dishes & Multi-Allergen Modifier Opportunities */}
      <section className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-xs">
          <h2 className="text-lg font-extrabold">
            {isAr ? "الأطباق الأكثر طلباً عبر المنصة" : "Top Ordered Dishes"}
          </h2>
          {aggregates.topOrderedDishes.length === 0 ? (
            <p className="text-xs text-[var(--text-secondary)]">
              {isAr ? "لا توجد طلبات مقبولة بعد." : "No accepted orders recorded yet."}
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border-subtle)] text-sm">
              {aggregates.topOrderedDishes.map((dish, idx) => (
                <li key={idx} className="flex items-center justify-between py-2.5">
                  <span className="font-bold">
                    {idx + 1}. {dish.nameEn}
                  </span>
                  <span className="font-mono text-xs font-bold text-[var(--accent-primary)]">
                    {dish.quantitySold}× • AED {dish.revenueAed}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-4 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-xs">
          <h2 className="text-lg font-extrabold">
            {isAr
              ? "أطباق متعددة المسببات (فرص لإضافة بدائل)"
              : "Multi-Allergen Dishes (Modifier Opportunities)"}
          </h2>
          {initialHighAllergenDishes.length === 0 ? (
            <p className="text-xs text-[var(--text-secondary)]">
              {isAr
                ? "لا توجد أطباق تحتوي على ٣ مسببات حساسية أو أكثر."
                : "No published dishes currently contain 3+ major allergens."}
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border-subtle)] text-xs">
              {initialHighAllergenDishes.map((d) => (
                <li key={d.id} className="py-2.5">
                  <p className="font-bold text-[var(--text-primary)]">
                    {pickLocalized(d.nameEn, d.nameAr, locale)}
                  </p>
                  <p className="mt-0.5 text-[var(--text-secondary)]">
                    {isAr ? "تحتوي على:" : "Contains:"} {d.allergens.join(", ")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
