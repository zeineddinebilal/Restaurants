"use client";

import { ArrowLeft, Plus, QrCode, ShieldAlert, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { loadMealPlanViewForMember, PlannedCartItem } from "@/lib/diner/companions";
import { type Locale, pickLocalized } from "@/lib/i18n/dictionaries";
import { formatAed } from "@/lib/money";

type PlanViewData = NonNullable<Awaited<ReturnType<typeof loadMealPlanViewForMember>>>;

export function MealPlanClient({
  locale,
  initialPlan,
}: {
  locale: Locale;
  initialPlan: PlanViewData;
}) {
  const isAr = locale === "ar";
  const [plan, setPlan] = useState<PlanViewData>(initialPlan);
  const [activeMemberId, setActiveMemberId] = useState<string>(
    initialPlan.members.find((m) => m.isSelf)?.profileId ?? initialPlan.members[0]?.profileId ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function saveMemberItems(targetProfileId: string, nextItems: PlannedCartItem[]) {
    setBusy(true);
    const res = await fetch(`/api/diner/meal-plans/${plan.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetProfileId,
        plannedItems: nextItems,
      }),
    });
    setBusy(false);

    if (res.ok) {
      setPlan((prev) => ({
        ...prev,
        members: prev.members.map((m) =>
          m.profileId === targetProfileId ? { ...m, plannedItems: nextItems } : m,
        ),
      }));
      setNotice(isAr ? "تم حفظ الاختيارات المخططة ✓" : "Planned picks saved ✓");
      setTimeout(() => setNotice(null), 1800);
    }
  }

  function handleAddPick(params: {
    targetProfileId: string;
    menuItemId: string;
    modifierIds: string[];
    forSharedTable: boolean;
    specialInstructions?: string;
  }) {
    const member = plan.members.find((m) => m.profileId === params.targetProfileId);
    if (!member) return;

    const existing = member.plannedItems;
    const idx = existing.findIndex(
      (i) =>
        i.menuItemId === params.menuItemId &&
        i.forSharedTable === params.forSharedTable &&
        i.modifierIds.join(",") === params.modifierIds.join(","),
    );

    let nextItems: PlannedCartItem[];
    if (idx >= 0) {
      nextItems = existing.map((item, i) =>
        i === idx ? { ...item, quantity: item.quantity + 1 } : item,
      );
    } else {
      nextItems = [
        ...existing,
        {
          menuItemId: params.menuItemId,
          modifierIds: params.modifierIds,
          quantity: 1,
          forSharedTable: params.forSharedTable,
          specialInstructions: params.specialInstructions,
        },
      ];
    }

    void saveMemberItems(params.targetProfileId, nextItems);
  }

  const selfMember = plan.members.find((m) => m.isSelf) ?? plan.members[0];
  const activeMember = plan.members.find((m) => m.profileId === activeMemberId) ?? selfMember;

  // Build dish name lookup across shared & personal menus
  const dishNameById = new Map<string, { en: string; ar: string }>();
  for (const s of plan.sharedDishes) {
    dishNameById.set(s.dish.id, { en: s.dish.nameEn, ar: s.dish.nameAr });
  }
  for (const m of plan.members) {
    for (const item of m.personalMenu) {
      dishNameById.set(item.dish.id, { en: item.dish.nameEn, ar: item.dish.nameAr });
    }
  }

  const summaryPills = isAr ? plan.groupSummary.ar : plan.groupSummary.en;

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
      {/* Header */}
      <header className="space-y-4 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/home"
            className="inline-flex min-h-10 items-center gap-1.5 text-xs font-bold text-[var(--accent-primary)] hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>{isAr ? "العودة للرئيسية" : "Back to Home"}</span>
          </Link>

          <Link
            href="/scan"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[var(--accent-primary)] px-4 py-2 text-xs font-extrabold text-white hover:bg-[var(--accent-hover)]"
          >
            <QrCode className="h-4 w-4" />
            <span>
              {isAr ? "وصلنا للمطعم — امسح QR الطاولة" : "At the Restaurant? Scan Table QR"}
            </span>
          </Link>
        </div>

        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-bold text-[var(--accent-primary)]">
            <Users className="h-3.5 w-3.5" />
            <span>
              {isAr
                ? `تخطيط وجبة لـ ${plan.members.length} أشخاص`
                : `Planning Together (${plan.members.length} Diners)`}
            </span>
          </span>
          <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">
            {pickLocalized(plan.restaurant.nameEn, plan.restaurant.nameAr, locale)}
          </h1>
        </div>

        {/* Privacy-safe Group Summary */}
        <div className="flex flex-wrap gap-1.5">
          {summaryPills.length === 0 ? (
            <span className="text-xs text-[var(--text-secondary)]">
              {isAr
                ? "لا توجد قيود غذائية مسجلة للمجموعة"
                : "No dietary restrictions in this group"}
            </span>
          ) : (
            summaryPills.map((pill, idx) => (
              <span
                key={idx}
                className="rounded-full bg-[var(--bg-muted)] px-3 py-1 text-xs font-semibold text-[var(--text-primary)]"
              >
                {pill}
              </span>
            ))
          )}
        </div>

        {/* Security / Table QR Gate Banner */}
        <div className="flex items-start gap-2.5 rounded-2xl border border-amber-500/40 bg-amber-500/12 px-4 py-3 text-xs font-bold text-amber-900 dark:text-amber-200">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {isAr
              ? "وضع التخطيط المسبق: لا يمكن إرسال طلب للمطبخ عن بُعد. عند وصولكم ومسح رمز QR الفعلي على الطاولة، تنضم مجموعتكم تلقائياً مع تحميل اختياراتكم في السلة."
              : "Pre-table planning mode: orders can never be sent remotely. When you scan the physical table QR at the restaurant, your group joins that table session automatically with your planned picks pre-loaded."}
          </span>
        </div>
      </header>

      {notice && (
        <div className="rounded-2xl bg-emerald-500/15 px-4 py-2.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
          {notice}
        </div>
      )}

      {/* Planned Picks Summary */}
      <section className="space-y-3 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-xs">
        <h2 className="text-lg font-extrabold">
          {isAr
            ? "الاختيارات المحفوظة للتحميل عند الوصول"
            : "Saved Planned Picks (Auto-Loads at Table Scan)"}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {plan.members.map((m) => (
            <div
              key={m.profileId}
              className="space-y-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-4 text-xs"
            >
              <div className="flex items-center justify-between">
                <p className="font-extrabold">{m.displayName}</p>
                {m.plannedItems.length > 0 && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void saveMemberItems(m.profileId, [])}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600"
                  >
                    <Trash2 className="h-3 w-3" />
                    <span>{isAr ? "مسح" : "Clear"}</span>
                  </button>
                )}
              </div>
              {m.plannedItems.length === 0 ? (
                <p className="text-[var(--text-secondary)]">
                  {isAr ? "لم يتم اختيار أطباق بعد" : "No planned dishes yet"}
                </p>
              ) : (
                <ul className="space-y-1">
                  {m.plannedItems.map((it, idx) => {
                    const names = dishNameById.get(it.menuItemId);
                    return (
                      <li key={idx} className="flex justify-between gap-2">
                        <span>
                          {it.quantity}×{" "}
                          {names ? pickLocalized(names.en, names.ar, locale) : "Menu Dish"}
                          {it.forSharedTable ? (isAr ? " (مشترك)" : " (Shared)") : ""}
                          {it.specialInstructions ? ` • ${it.specialInstructions}` : ""}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 1. Shared Dishes Everyone Can Eat */}
      <section className="space-y-4">
        <h2 className="text-xl font-extrabold">
          {isAr
            ? `أطباق مناسبة لمشاركة الجميع (${plan.sharedDishes.length})`
            : `Dishes Everyone Can Share (${plan.sharedDishes.length})`}
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          {plan.sharedDishes.map((shared) => (
            <article
              key={shared.dish.id}
              className="flex flex-col justify-between rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs"
            >
              <div className="space-y-1.5">
                <div className="flex justify-between gap-2">
                  <h3 className="font-bold">
                    {pickLocalized(shared.dish.nameEn, shared.dish.nameAr, locale)}
                  </h3>
                  <span className="font-mono text-sm font-extrabold">
                    {formatAed(shared.effectivePriceFils, locale)}
                  </span>
                </div>

                {shared.requiredModifiers.length > 0 && (
                  <p className="rounded-lg bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                    ✓{" "}
                    {shared.requiredModifiers
                      .map((m) => pickLocalized(m.nameEn, m.nameAr, locale))
                      .join(", ")}
                  </p>
                )}

                {(isAr ? shared.dislikeNoticesAr : shared.dislikeNoticesEn).map((n, idx) => (
                  <p
                    key={idx}
                    className="rounded-lg bg-amber-500/12 px-2.5 py-1 text-[11px] font-semibold text-amber-800 dark:text-amber-300"
                  >
                    {n}
                  </p>
                ))}

                <p className="text-xs text-[var(--text-secondary)]">
                  {pickLocalized(shared.dish.descriptionEn, shared.dish.descriptionAr, locale)}
                </p>
              </div>

              {selfMember && (
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      handleAddPick({
                        targetProfileId: selfMember.profileId,
                        menuItemId: shared.dish.id,
                        modifierIds: shared.requiredModifiers.map((m) => m.id),
                        forSharedTable: true,
                        specialInstructions:
                          shared.autoOrderNotesEn.length > 0
                            ? shared.autoOrderNotesEn.join(", ")
                            : undefined,
                      })
                    }
                    className="inline-flex min-h-9 items-center gap-1 rounded-xl bg-[var(--accent-primary)] px-3.5 py-1.5 text-xs font-bold text-white"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>{isAr ? "أضف للمشاركة" : "Plan for Shared Table"}</span>
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      {/* 2. Per-Person Compatible Picks */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-extrabold">
            {isAr ? "اختيارات كل شخص" : "Each Person's Compatible Picks"}
          </h2>
          <div className="flex flex-wrap gap-2">
            {plan.members.map((m) => (
              <button
                key={m.profileId}
                type="button"
                onClick={() => setActiveMemberId(m.profileId)}
                className={`min-h-9 rounded-full px-3.5 py-1.5 text-xs font-bold ${
                  activeMember?.profileId === m.profileId
                    ? "bg-[var(--accent-primary)] text-white"
                    : "border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                }`}
              >
                {m.displayName}
              </button>
            ))}
          </div>
        </div>

        {activeMember && (
          <div className="grid gap-4 sm:grid-cols-2">
            {activeMember.personalMenu.map((item) => (
              <article
                key={item.dish.id}
                className="flex flex-col justify-between rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs"
              >
                <div className="space-y-1.5">
                  <div className="flex justify-between gap-2">
                    <h3 className="font-bold">
                      {pickLocalized(item.dish.nameEn, item.dish.nameAr, locale)}
                    </h3>
                    <span className="font-mono text-sm font-extrabold">
                      {formatAed(item.effectivePriceFils, locale)}
                    </span>
                  </div>

                  {item.preselectedModifiers.length > 0 && (
                    <p className="rounded-lg bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                      ✓{" "}
                      {item.preselectedModifiers
                        .map((m) => pickLocalized(m.nameEn, m.nameAr, locale))
                        .join(", ")}
                    </p>
                  )}

                  {(isAr ? item.dislikeNoticesAr : item.dislikeNoticesEn).map((n, idx) => (
                    <p
                      key={idx}
                      className="rounded-lg bg-amber-500/12 px-2.5 py-1 text-[11px] font-semibold text-amber-800 dark:text-amber-300"
                    >
                      {n}
                    </p>
                  ))}

                  <p className="text-[11px] font-medium text-[var(--accent-primary)]">
                    {isAr ? item.whyForYouAr : item.whyForYouEn}
                  </p>
                </div>

                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      handleAddPick({
                        targetProfileId: activeMember.profileId,
                        menuItemId: item.dish.id,
                        modifierIds: item.preselectedModifierIds,
                        forSharedTable: false,
                        specialInstructions:
                          item.autoOrderNotesEn.length > 0
                            ? item.autoOrderNotesEn.join(", ")
                            : undefined,
                      })
                    }
                    className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-[var(--accent-primary)] px-3.5 py-1.5 text-xs font-bold text-[var(--accent-primary)] hover:bg-[var(--accent-soft)]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>
                      {isAr
                        ? `أضف لـ ${activeMember.displayName}`
                        : `Plan for ${activeMember.displayName}`}
                    </span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
