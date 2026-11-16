"use client";

import { ArrowLeft, Plus, Receipt, Send, Sparkles, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { GroupTableAgentOutput } from "@/lib/agents/group-table";
import { type Locale, pickLocalized } from "@/lib/i18n/dictionaries";
import { aedToFils, formatAed } from "@/lib/money";

interface TableParticipantView {
  id: string;
  displayName: string;
  dietaryRestrictions: string[];
  allergens: string[];
  maxBudgetAed: string | null;
  cartItems: Array<{
    menuItemId: string;
    modifierIds: string[];
    quantity: number;
    forSharedTable?: boolean;
  }>;
}

interface PricedLineView {
  menuItemId: string;
  dishNameEn: string;
  dishNameAr: string;
  participantId: string | null;
  participantName: string | null;
  quantity: number;
  unitPriceAed: string;
  lineTotalAed: string;
  selectedModifiers: Array<{ id: string; nameEn: string; nameAr: string }>;
}

interface SharedDishSuggestion {
  dish: {
    id: string;
    nameEn: string;
    nameAr: string;
    descriptionEn?: string | null;
    descriptionAr?: string | null;
  };
  effectivePriceFils: number;
  requiredModifiers: Array<{ id: string; nameEn: string; nameAr: string }>;
  autoOrderNotesEn?: string[];
  dislikeNoticesEn?: string[];
  dislikeNoticesAr?: string[];
}

interface TableSessionResponse {
  tableSession: {
    id: string;
    shareCode: string;
    tableCode: string;
    tableName: string;
  };
  selfParticipantId: string;
  canLoadDemoFriends: boolean;
  participants: TableParticipantView[];
  pricedLines: PricedLineView[];
  billSplit: {
    paymentMode?: "SPLIT_BY_PERSON" | "ONE_PERSON_PAYS_ALL";
    payerParticipantId?: string | null;
    sharedPoolFils: number;
    totalFils: number;
    totalAed: string;
    shares: Array<{
      participantId: string;
      displayName: string;
      personalFils: number;
      sharedShareFils: number;
      totalFils: number;
      totalAed: string;
    }>;
  };
  sharedDishes: SharedDishSuggestion[];
  recentOrders: Array<{
    id: string;
    orderNumber: number;
    status: string;
    subtotalAed: string;
  }>;
}

export function GroupTableClient({
  locale,
  restaurantSlug,
  restaurantName,
  tableCode,
  tableToken,
}: {
  locale: Locale;
  restaurantSlug: string;
  restaurantName: string;
  tableCode: string;
  tableToken: string | null;
}) {
  const router = useRouter();
  const isAr = locale === "ar";
  const kQuery = tableToken ? `?k=${encodeURIComponent(tableToken)}` : "";

  const [sessionData, setSessionData] = useState<TableSessionResponse | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiPlan, setAiPlan] = useState<GroupTableAgentOutput | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);

  const loadSession = useCallback(async () => {
    const res = await fetch(`/api/tables/${restaurantSlug}/${tableCode}/session${kQuery}`, {
      cache: "no-store",
    });
    if (res.status === 403) {
      setUnauthorized(true);
      return;
    }
    if (res.ok) {
      const json = (await res.json()) as TableSessionResponse;
      setSessionData(json);
    }
  }, [restaurantSlug, tableCode, kQuery]);

  useEffect(() => {
    const initial = setTimeout(() => void loadSession(), 0);
    const timer = setInterval(() => void loadSession(), 4000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [loadSession]);

  async function handleJoinDemoFriends() {
    setBusy(true);
    await fetch(`/api/tables/${restaurantSlug}/${tableCode}/session${kQuery}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "join_demo_friends", k: tableToken ?? undefined }),
    });
    await loadSession();
    setBusy(false);
  }

  async function handleAddSharedDish(shared: SharedDishSuggestion) {
    if (!sessionData) return;
    setBusy(true);
    const me = sessionData.participants.find((p) => p.id === sessionData.selfParticipantId);
    const existingCart = me?.cartItems ?? [];

    await fetch(`/api/tables/${restaurantSlug}/${tableCode}/session${kQuery}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_cart",
        k: tableToken ?? undefined,
        participantId: sessionData.selfParticipantId,
        cartItems: [
          ...existingCart,
          {
            menuItemId: shared.dish.id,
            modifierIds: shared.requiredModifiers.map((m) => m.id),
            quantity: 1,
            forSharedTable: true,
            specialInstructions:
              shared.autoOrderNotesEn && shared.autoOrderNotesEn.length > 0
                ? shared.autoOrderNotesEn.join(", ")
                : undefined,
          },
        ],
      }),
    });
    await loadSession();
    setBusy(false);
  }

  async function handleSetPaymentMode(
    paymentMode: "SPLIT_BY_PERSON" | "ONE_PERSON_PAYS_ALL",
    payerParticipantId?: string | null,
  ) {
    setBusy(true);
    await fetch(`/api/tables/${restaurantSlug}/${tableCode}/session${kQuery}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "set_payment_mode",
        k: tableToken ?? undefined,
        paymentMode,
        payerParticipantId: payerParticipantId ?? sessionData?.selfParticipantId ?? null,
      }),
    });
    await loadSession();
    setBusy(false);
  }

  async function handleClearMyCart() {
    if (!sessionData) return;
    setBusy(true);
    await fetch(`/api/tables/${restaurantSlug}/${tableCode}/session${kQuery}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_cart",
        k: tableToken ?? undefined,
        participantId: sessionData.selfParticipantId,
        cartItems: [],
      }),
    });
    await loadSession();
    setBusy(false);
  }

  async function handleSendCombinedOrder() {
    if (!sessionData || sessionData.pricedLines.length === 0) return;
    setBusy(true);
    setError(null);

    const res = await fetch(`/api/tables/${restaurantSlug}/${tableCode}/orders${kQuery}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        k: tableToken ?? undefined,
        notes: notes.trim() || undefined,
      }),
    });
    setBusy(false);

    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      order?: { id: string };
    };

    if (!res.ok || !data.order?.id) {
      setError(data.error || "Could not place order");
      return;
    }

    router.push(`/orders/${data.order.id}`);
  }

  async function handleSuggestGroupPlan() {
    setAiLoading(true);
    setAiNotice(null);
    const res = await fetch(`/api/tables/${restaurantSlug}/${tableCode}/group-suggest${kQuery}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale, k: tableToken ?? undefined }),
    });
    const data = (await res.json().catch(() => ({}))) as GroupTableAgentOutput & {
      error?: string;
      reason?: string;
    };
    setAiLoading(false);

    if (!res.ok) {
      if (res.status === 503 || data.reason === "AI_NOT_CONFIGURED") {
        setAiNotice(
          isAr
            ? "الذكاء الاصطناعي غير مفعل حالياً — الأطباق المشتركة وتقسيم الفاتورة الحتمي يعملان أدناه بالكامل."
            : "AI not configured — deterministic shared dishes and bill split below remain 100% active.",
        );
      } else {
        setAiNotice(data.error || "Could not generate group suggestion");
      }
      return;
    }

    setAiPlan(data);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/r/${restaurantSlug}/t/${tableCode}${kQuery}`}
          className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-[var(--accent-primary)] hover:underline"
        >
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
          <span>
            {isAr ? "العودة لقائمة الأطباق" : "Back to Personalized Menu"} ({restaurantName})
          </span>
        </Link>

        {sessionData?.canLoadDemoFriends && (
          <button
            type="button"
            disabled={busy}
            onClick={handleJoinDemoFriends}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-dashed border-[var(--accent-primary)] bg-[var(--accent-soft)] px-4 py-2 text-xs font-bold text-[var(--accent-primary)]"
          >
            <Users className="h-4 w-4" />
            <span>
              {isAr
                ? "إضافة أصدقاء العرض (Claude, Bilal, James)"
                : "Seat Demo Friends (Claude, Bilal & James)"}
            </span>
          </button>
        )}
      </div>

      {unauthorized ? (
        <div className="rounded-3xl border border-amber-500/40 bg-amber-500/15 p-8 text-center text-sm font-bold text-amber-800 dark:text-amber-300">
          {isAr
            ? "امسح رمز QR الموجود على طاولتك للانضمام والطلب."
            : "Scan the QR at your table to order."}
        </div>
      ) : !sessionData ? (
        <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-8 text-center text-sm text-[var(--text-secondary)]">
          {isAr ? "جاري تحميل طاولة المجموعة..." : "Loading table group session..."}
        </div>
      ) : (
        <>
          {/* Diners Seated at Table */}
          <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-[var(--accent-primary)]" />
              <h1 className="text-xl font-extrabold">
                {isAr
                  ? `الضيوف على ${sessionData.tableSession.tableName} (${sessionData.participants.length})`
                  : `Seated at ${sessionData.tableSession.tableName} (${sessionData.participants.length})`}
              </h1>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {sessionData.participants.map((p) => (
                <div
                  key={p.id}
                  className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-4"
                >
                  <p className="font-bold">{p.displayName}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1 text-[11px]">
                    {p.dietaryRestrictions.map((d) => (
                      <span
                        key={d}
                        className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-semibold text-emerald-700 dark:text-emerald-300"
                      >
                        {d}
                      </span>
                    ))}
                    {p.allergens.map((a) => (
                      <span
                        key={a}
                        className="rounded-full bg-red-500/15 px-2 py-0.5 font-semibold text-red-700 dark:text-red-300"
                      >
                        No {a}
                      </span>
                    ))}
                    {p.maxBudgetAed && (
                      <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 font-mono font-semibold text-[var(--accent-primary)]">
                        Budget AED {p.maxBudgetAed}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* AI Group Table Agent Curated Spread (Agent #5) */}
          <section className="space-y-4 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-extrabold">
                  <Sparkles className="h-5 w-5 text-[var(--accent-primary)]" />
                  <span>
                    {isAr
                      ? "تشكيلة المشاركة الذكية وتقدير الفاتورة (AI)"
                      : "AI Curated Sharing Set & Budget Plan"}
                  </span>
                </h2>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  {isAr
                    ? "يقترح أطباقاً مشتركة وفردية من الأطباق الموثقة الآمنة فقط مع إعادة حساب الأسعار على الخادم."
                    : "Curates verified-safe shared dishes + personal picks within budgets, with server-recomputed AED splits."}
                </p>
              </div>
              <button
                type="button"
                disabled={aiLoading}
                onClick={handleSuggestGroupPlan}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[var(--accent-primary)] px-4 py-2 text-xs font-bold text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>
                  {aiLoading
                    ? isAr
                      ? "جاري التنسيق..."
                      : "Curating..."
                    : isAr
                      ? "اقترح تشكيلة للطاولة"
                      : "Suggest Group Sharing Set"}
                </span>
              </button>
            </div>

            {aiNotice && (
              <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs font-semibold text-amber-800 dark:text-amber-300">
                {aiNotice}
              </div>
            )}

            {aiPlan && (
              <div className="space-y-4 border-t border-[var(--border-subtle)] pt-4">
                <p className="text-sm font-medium text-[var(--text-primary)]">{aiPlan.summary}</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl bg-[var(--bg-canvas)] p-4">
                    <p className="text-xs font-bold uppercase text-[var(--accent-primary)]">
                      {isAr ? "للمشاركة على الطاولة" : "Shared Centerpieces"}
                    </p>
                    <ul className="mt-2 space-y-2 text-xs">
                      {aiPlan.sharedSet.map((s) => (
                        <li key={s.dishId} className="flex justify-between gap-2">
                          <span className="font-semibold">
                            {pickLocalized(s.nameEn, s.nameAr, locale)}
                            {s.requiredModifiersEn.length > 0
                              ? ` (${(isAr ? s.requiredModifiersAr : s.requiredModifiersEn).join(", ")})`
                              : ""}
                          </span>
                          <span className="font-mono font-bold">AED {s.effectivePriceAed}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-2xl bg-[var(--bg-canvas)] p-4">
                    <p className="text-xs font-bold uppercase text-[var(--accent-primary)]">
                      {isAr ? "اختيار فردي وتقدير الحصة" : "Personal Picks & Estimated Split"}
                    </p>
                    <ul className="mt-2 space-y-2 text-xs">
                      {aiPlan.personalPicks.map((p) => (
                        <li key={p.participantId} className="flex justify-between gap-2">
                          <span>
                            <strong>{p.participantName}:</strong>{" "}
                            {pickLocalized(p.dish.nameEn, p.dish.nameAr, locale)}
                          </span>
                          <span className="font-mono font-bold">
                            AED {p.dish.effectivePriceAed}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3 border-t border-[var(--border-subtle)] pt-2 text-xs">
                      {aiPlan.estimatedShares.map((sh) => (
                        <div key={sh.participantId} className="flex justify-between py-0.5">
                          <span className="text-[var(--text-secondary)]">
                            {sh.displayName} {isAr ? "(الإجمالي المقدّر)" : "est. share"}
                          </span>
                          <span className="font-mono font-bold">AED {sh.totalAed}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Shared Dishes Everyone Can Eat */}
          <section className="space-y-4">
            <h2 className="text-xl font-extrabold">
              {isAr
                ? `أطباق مناسبة لمشاركة الجميع (${sessionData.sharedDishes.length})`
                : `Shared Dishes Everyone at This Table Can Eat (${sessionData.sharedDishes.length})`}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {sessionData.sharedDishes.slice(0, 8).map((shared) => (
                <article
                  key={shared.dish.id}
                  className="flex flex-col justify-between rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs"
                >
                  <div>
                    <div className="flex justify-between gap-2">
                      <span className="font-bold">
                        {pickLocalized(shared.dish.nameEn, shared.dish.nameAr, locale)}
                      </span>
                      <span className="font-mono text-sm font-extrabold">
                        {formatAed(shared.effectivePriceFils, locale)}
                      </span>
                    </div>
                    {shared.requiredModifiers.length > 0 && (
                      <p className="mt-1.5 rounded-lg bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                        ✓{" "}
                        {shared.requiredModifiers
                          .map((m) => pickLocalized(m.nameEn, m.nameAr, locale))
                          .join(", ")}
                      </p>
                    )}
                    {((isAr ? shared.dislikeNoticesAr : shared.dislikeNoticesEn) ?? []).map(
                      (note, idx) => (
                        <p
                          key={idx}
                          className="mt-1.5 rounded-lg bg-amber-500/12 px-2.5 py-1 text-[11px] font-semibold text-amber-800 dark:text-amber-300"
                        >
                          {note}
                        </p>
                      ),
                    )}
                    <p className="mt-1.5 text-xs text-[var(--text-secondary)]">
                      {pickLocalized(shared.dish.descriptionEn, shared.dish.descriptionAr, locale)}
                    </p>
                  </div>

                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleAddSharedDish(shared)}
                      className="inline-flex min-h-9 items-center gap-1 rounded-xl bg-[var(--accent-primary)] px-3.5 py-1.5 text-xs font-bold text-white"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>{isAr ? "أضف للطاولة المشتركة" : "Add for Shared Table"}</span>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {/* Combined Cart + Server-Computed Bill Split */}
          <section className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-extrabold">
                  {isAr ? "سلة الطاولة المشتركة" : "Combined Table Cart"}
                </h2>
                {sessionData.pricedLines.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearMyCart}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>{isAr ? "مسح اختياراتي" : "Clear My Items"}</span>
                  </button>
                )}
              </div>

              {sessionData.pricedLines.length === 0 ? (
                <p className="text-sm text-[var(--text-secondary)]">
                  {isAr
                    ? "السلة فارغة حالياً. أضف أطباقاً للمشاركة أو من قائمتك المخصصة."
                    : "No items in the table cart yet. Add shared dishes above or from the personalized menu."}
                </p>
              ) : (
                <ul className="divide-y divide-[var(--border-subtle)]">
                  {sessionData.pricedLines.map((line, i) => (
                    <li key={`${line.menuItemId}-${i}`} className="py-3 text-sm">
                      <div className="flex justify-between gap-2">
                        <span className="font-bold">
                          {line.quantity}× {pickLocalized(line.dishNameEn, line.dishNameAr, locale)}
                        </span>
                        <span className="font-mono font-bold">
                          {formatAed(aedToFils(line.lineTotalAed), locale)}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)]">
                        For: {line.participantName || "Shared Table"}
                        {line.selectedModifiers.length > 0
                          ? ` • ${line.selectedModifiers.map((m) => pickLocalized(m.nameEn, m.nameAr, locale)).join(", ")}`
                          : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}

              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={
                  isAr
                    ? "ملاحظات إضافية للمطبخ (اختياري)..."
                    : "Optional table note for the kitchen..."
                }
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3 text-xs"
              />

              {error && <p className="text-xs font-bold text-red-600">{error}</p>}

              <button
                type="button"
                disabled={busy || sessionData.pricedLines.length === 0}
                onClick={handleSendCombinedOrder}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent-primary)] px-6 py-3 text-sm font-extrabold text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                <span>
                  {isAr
                    ? `إرسال طلب الطاولة (${formatAed(sessionData.billSplit.totalFils, locale)})`
                    : `Send Table Order (${formatAed(sessionData.billSplit.totalFils, locale)})`}
                </span>
              </button>
            </div>

            {/* Bill Split Estimate & Paying Together Mode */}
            <div className="space-y-4 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-[var(--accent-primary)]" />
                  <h2 className="text-lg font-extrabold">
                    {isAr ? "طريقة الدفع وتقسيم الفاتورة" : "Paying Together & Bill Split"}
                  </h2>
                </div>
              </div>

              {/* Split by person vs One person pays for all */}
              <div className="space-y-2 rounded-2xl bg-[var(--bg-canvas)] p-3 text-xs">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleSetPaymentMode("SPLIT_BY_PERSON")}
                    className={`min-h-9 flex-1 rounded-xl px-3 py-1.5 font-bold transition ${
                      (sessionData.billSplit.paymentMode ?? "SPLIT_BY_PERSON") === "SPLIT_BY_PERSON"
                        ? "bg-[var(--accent-primary)] text-white"
                        : "border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                    }`}
                  >
                    {isAr ? "تقسيم حسب كل شخص" : "Split by person"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void handleSetPaymentMode(
                        "ONE_PERSON_PAYS_ALL",
                        sessionData.billSplit.payerParticipantId ?? sessionData.selfParticipantId,
                      )
                    }
                    className={`min-h-9 flex-1 rounded-xl px-3 py-1.5 font-bold transition ${
                      sessionData.billSplit.paymentMode === "ONE_PERSON_PAYS_ALL"
                        ? "bg-[var(--accent-primary)] text-white"
                        : "border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                    }`}
                  >
                    {isAr ? "شخص واحد يدفع للجميع" : "One person pays for all"}
                  </button>
                </div>

                {sessionData.billSplit.paymentMode === "ONE_PERSON_PAYS_ALL" && (
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="font-semibold text-[var(--text-secondary)]">
                      {isAr ? "الدافع عن الطاولة:" : "Host paying:"}
                    </span>
                    <select
                      value={
                        sessionData.billSplit.payerParticipantId ?? sessionData.selfParticipantId
                      }
                      onChange={(e) =>
                        void handleSetPaymentMode("ONE_PERSON_PAYS_ALL", e.target.value)
                      }
                      aria-label="Select payer"
                      className="min-h-8 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1 font-semibold"
                    >
                      {sessionData.participants.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.displayName}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <p className="text-[11px] text-[var(--text-secondary)]">
                  {isAr
                    ? "يتم سداد الفاتورة مباشرة لدى المطعم كالمعتاد."
                    : "Payment is settled directly with the restaurant at your table."}
                </p>
              </div>

              <ul className="divide-y divide-[var(--border-subtle)]">
                {sessionData.billSplit.shares.map((share) => (
                  <li
                    key={share.participantId}
                    className="flex items-center justify-between py-2.5 text-sm"
                  >
                    <div>
                      <p className="font-bold">{share.displayName}</p>
                      <p className="text-[11px] text-[var(--text-secondary)]">
                        Personal {formatAed(share.personalFils, locale)} + Shared{" "}
                        {formatAed(share.sharedShareFils, locale)}
                      </p>
                    </div>
                    <span className="font-mono font-extrabold">
                      {formatAed(share.totalFils, locale)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-3 font-extrabold">
                <span>{isAr ? "الإجمالي" : "Table Subtotal"}</span>
                <span className="font-mono text-lg">
                  {formatAed(sessionData.billSplit.totalFils, locale)}
                </span>
              </div>

              {sessionData.recentOrders.length > 0 && (
                <div className="border-t border-[var(--border-subtle)] pt-4">
                  <p className="text-xs font-bold uppercase text-[var(--text-secondary)]">
                    {isAr ? "طلبات هذه الطاولة" : "Active Table Orders"}
                  </p>
                  <div className="mt-2 space-y-2">
                    {sessionData.recentOrders.map((o) => (
                      <Link
                        key={o.id}
                        href={`/orders/${o.id}`}
                        className="flex items-center justify-between rounded-xl bg-[var(--bg-canvas)] px-3.5 py-2 text-xs font-semibold hover:underline"
                      >
                        <span>
                          Order #{o.orderNumber} — {o.status}
                        </span>
                        <span className="font-mono">AED {o.subtotalAed}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
