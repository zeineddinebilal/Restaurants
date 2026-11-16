"use client";

import { Check, QrCode, Share2, Trash2, UserPlus, Users, Utensils } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PrivacySafeCompanionView } from "@/lib/diner/companions";
import { type Locale, pickLocalized } from "@/lib/i18n/dictionaries";

export function DineWithCompanionsCard({
  locale,
  isAuthenticated,
  initialCompanions,
  invite,
  approvedRestaurants,
}: {
  locale: Locale;
  isAuthenticated: boolean;
  initialCompanions: PrivacySafeCompanionView[];
  invite: {
    code: string;
    shareUrl: string;
    qrSvg: string;
  } | null;
  approvedRestaurants: Array<{
    id: string;
    nameEn: string;
    nameAr: string;
  }>;
}) {
  const router = useRouter();
  const isAr = locale === "ar";

  const [companions, setCompanions] = useState(initialCompanions);
  const [selectedCompanionIds, setSelectedCompanionIds] = useState<string[]>(
    initialCompanions.map((c) => c.profileId),
  );
  const [selectedRestaurantId, setSelectedRestaurantId] = useState(
    approvedRestaurants[0]?.id ?? "",
  );
  const [showInvitePanel, setShowInvitePanel] = useState(false);
  const [friendCode, setFriendCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!isAuthenticated) {
    return (
      <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-bold text-[var(--accent-primary)]">
              <Users className="h-3.5 w-3.5" />
              <span>{isAr ? "تناول الطعام مع الأصدقاء" : "Dine with Friends"}</span>
            </span>
            <h2 className="text-lg font-extrabold">
              {isAr
                ? "خطط وجبتك مع أصدقائك قبل الوصول إلى المطعم"
                : "Connect with Dining Companions Before Reaching the Table"}
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              {isAr
                ? "أنشئ حساباً سريعاً لحفظ قائمة أصدقائك، رؤية الأطباق المشتركة مسبقاً، وتحميل اختياراتكم تلقائياً عند مسح رمز QR على الطاولة."
                : "Create a quick account to save companions, preview shared dishes ahead of time, and auto-load your group's picks when you scan the table QR."}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/register?returnTo=/home"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[var(--accent-primary)] px-4 py-2 text-xs font-bold text-white hover:bg-[var(--accent-hover)]"
            >
              <UserPlus className="h-3.5 w-3.5" />
              <span>{isAr ? "إنشاء حساب سريع" : "Create Quick Account"}</span>
            </Link>
            <Link
              href="/login?returnTo=/home"
              className="inline-flex min-h-10 items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-4 py-2 text-xs font-semibold"
            >
              {isAr ? "تسجيل الدخول" : "Sign In"}
            </Link>
          </div>
        </div>
      </section>
    );
  }

  async function handleShareInvite() {
    if (!invite) return;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: isAr ? "دعوة رفيق طعام" : "Dine with me on PlateFit",
          text: isAr
            ? `انضم إلى قائمة رفقاء الطعام الخاصة بي (الرمز: ${invite.code})`
            : `Connect food profiles so we can find dishes we can share! Code: ${invite.code}`,
          url: invite.shareUrl,
        });
        return;
      } catch {
        // Fall back to clipboard copy if user dismisses share sheet
      }
    }
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(invite.shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function handleAcceptCode(e: React.FormEvent) {
    e.preventDefault();
    if (!friendCode.trim() || busy) return;
    setBusy(true);
    setFeedback(null);

    const res = await fetch("/api/diner/companions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "accept", code: friendCode.trim() }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      inviterDisplayName?: string;
      error?: string;
    };
    setBusy(false);

    if (!res.ok) {
      setFeedback(data.error || "Could not connect code");
      return;
    }

    setFriendCode("");
    setFeedback(
      isAr
        ? `تمت إضافة ${data.inviterDisplayName ?? "صديقك"} إلى رفقاء الطعام ✓`
        : `Connected with ${data.inviterDisplayName ?? "companion"} ✓`,
    );
    router.refresh();
  }

  async function handleRemoveCompanion(companionProfileId: string) {
    setBusy(true);
    await fetch("/api/diner/companions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove", companionProfileId }),
    });
    setBusy(false);
    setCompanions((prev) => prev.filter((c) => c.profileId !== companionProfileId));
    setSelectedCompanionIds((prev) => prev.filter((id) => id !== companionProfileId));
    router.refresh();
  }

  async function handleStartMealPlan() {
    if (!selectedRestaurantId || busy) return;
    setBusy(true);
    setFeedback(null);

    const res = await fetch("/api/diner/meal-plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurantId: selectedRestaurantId,
        companionProfileIds: selectedCompanionIds,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      mealPlanId?: string;
      error?: string;
    };
    setBusy(false);

    if (!res.ok || !data.mealPlanId) {
      setFeedback(data.error || "Could not create meal plan");
      return;
    }

    router.push(`/plan/${data.mealPlanId}`);
  }

  return (
    <section className="space-y-4 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-bold text-[var(--accent-primary)]">
            <Users className="h-3.5 w-3.5" />
            <span>{isAr ? "تناول الطعام مع…" : "Dine with…"}</span>
          </span>
          <h2 className="mt-1.5 text-xl font-extrabold">
            {isAr ? "رفقاء الطعام وتخطيط الوجبات" : "Dining Companions & Pre-Table Planner"}
          </h2>
        </div>

        <button
          type="button"
          onClick={() => setShowInvitePanel((v) => !v)}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-4 py-2 text-xs font-bold text-[var(--accent-primary)]"
        >
          <UserPlus className="h-3.5 w-3.5" />
          <span>{isAr ? "دعوة صديق / إدخال رمز" : "Invite Friend / Enter Code"}</span>
        </button>
      </div>

      {/* Invite Share Sheet + QR + Short Code Panel */}
      {showInvitePanel && invite && (
        <div className="grid gap-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-4 sm:grid-cols-2">
          <div className="space-y-3">
            <p className="text-xs font-bold">
              {isAr ? "شارك رمزك أو امسح رمز QR:" : "Share Your Invite Link, QR, or Short Code:"}
            </p>
            <div className="flex items-center gap-3">
              <div
                className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-white p-1.5 [&_svg]:h-full [&_svg]:w-full"
                dangerouslySetInnerHTML={{ __html: invite.qrSvg }}
              />
              <div className="space-y-2">
                <p className="font-mono text-lg font-extrabold text-[var(--accent-primary)]">
                  {invite.code}
                </p>
                <button
                  type="button"
                  onClick={() => void handleShareInvite()}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-[var(--accent-primary)] px-3.5 py-1.5 text-xs font-bold text-white"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
                  <span>
                    {copied
                      ? isAr
                        ? "تم نسخ الرابط ✓"
                        : "Link Copied ✓"
                      : isAr
                        ? "مشاركة الدعوة"
                        : "Share Invite"}
                  </span>
                </button>
              </div>
            </div>
          </div>

          <form onSubmit={handleAcceptCode} className="space-y-2">
            <label className="block text-xs font-bold">
              {isAr ? "لديك رمز دعوة من صديق؟" : "Have a Friend's Short Code?"}
            </label>
            <div className="flex gap-2">
              <input
                value={friendCode}
                onChange={(e) => setFriendCode(e.target.value.toUpperCase())}
                placeholder="DINE-XXXXXX"
                className="min-h-10 flex-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 font-mono text-xs uppercase"
              />
              <button
                type="submit"
                disabled={busy || friendCode.trim().length < 4}
                className="min-h-10 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                {isAr ? "ربط" : "Connect"}
              </button>
            </div>
            <p className="text-[11px] text-[var(--text-secondary)]">
              <QrCode className="me-1 inline h-3 w-3" />
              {isAr
                ? "تبقى تفاصيل ملفك خاصة ما لم تختر مشاركتها بالكامل."
                : "Your individual restrictions stay private unless you opt into full sharing."}
            </p>
          </form>
        </div>
      )}

      {feedback && (
        <div className="rounded-2xl bg-[var(--accent-soft)] px-4 py-2.5 text-xs font-bold text-[var(--accent-primary)]">
          {feedback}
        </div>
      )}

      {/* Connected Companions List */}
      {companions.length === 0 ? (
        <p className="text-xs text-[var(--text-secondary)]">
          {isAr
            ? "لم تضف رفقاء طعام بعد. اضغط «دعوة صديق» لإرسال رابط أو رمز قصير."
            : "No dining companions connected yet. Tap 'Invite Friend' above to share your link, QR, or short code."}
        </p>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-3">
            {companions.map((c) => {
              const selected = selectedCompanionIds.includes(c.profileId);
              return (
                <div
                  key={c.profileId}
                  className={`flex items-center justify-between gap-2 rounded-2xl border p-3 text-xs transition ${
                    selected
                      ? "border-[var(--accent-primary)] bg-[var(--accent-soft)]/40"
                      : "border-[var(--border-subtle)] bg-[var(--bg-canvas)]"
                  }`}
                >
                  <label className="flex flex-1 cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() =>
                        setSelectedCompanionIds((prev) =>
                          prev.includes(c.profileId)
                            ? prev.filter((id) => id !== c.profileId)
                            : [...prev, c.profileId],
                        )
                      }
                      className="mt-0.5"
                    />
                    <div>
                      <p className="font-bold text-[var(--text-primary)]">{c.displayName}</p>
                      <p className="text-[11px] text-[var(--text-secondary)]">
                        {c.sharesFullProfile && c.fullProfile
                          ? [
                              ...c.fullProfile.dietaryRestrictions,
                              ...c.fullProfile.allergens.map((a) => `No ${a}`),
                              ...c.fullProfile.customAvoids.map((a) => `No ${a}`),
                            ].join(" · ") || (isAr ? "بدون قيود" : "No hard restrictions")
                          : isAr
                            ? "ملف خاص (يُستخدم للمطابقة المشتركة فقط)"
                            : "Private profile (shared view only)"}
                      </p>
                    </div>
                  </label>

                  <button
                    type="button"
                    onClick={() => void handleRemoveCompanion(c.profileId)}
                    aria-label={`Remove ${c.displayName}`}
                    className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-red-500/10 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Plan a Meal Together Launcher */}
          {approvedRestaurants.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-[var(--bg-canvas)] p-3.5">
              <Utensils className="h-4 w-4 text-[var(--accent-primary)]" />
              <select
                value={selectedRestaurantId}
                onChange={(e) => setSelectedRestaurantId(e.target.value)}
                aria-label="Choose restaurant to plan meal"
                className="min-h-10 flex-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-semibold"
              >
                {approvedRestaurants.map((r) => (
                  <option key={r.id} value={r.id}>
                    {pickLocalized(r.nameEn, r.nameAr, locale)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={busy || selectedCompanionIds.length === 0}
                onClick={() => void handleStartMealPlan()}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[var(--accent-primary)] px-4 py-2 text-xs font-extrabold text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
              >
                <Users className="h-3.5 w-3.5" />
                <span>
                  {isAr
                    ? `خطط وجبة معاً (${selectedCompanionIds.length + 1})`
                    : `Plan Meal Together (${selectedCompanionIds.length + 1})`}
                </span>
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
