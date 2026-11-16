"use client";

import { Bot, ExternalLink, MessageSquareText, Send, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { MenuAssistantDishLink } from "@/lib/agents/menu-assistant";
import type { EngineDinerProfile } from "@/lib/engine/menu-engine";
import { type Locale, pickLocalized } from "@/lib/i18n/dictionaries";

interface AssistantTurn {
  question: string;
  answer: string;
  dishes: MenuAssistantDishLink[];
}

export function MenuAssistantDrawer({
  locale,
  restaurantSlug,
  tableCode,
  activeProfile,
  currentCartTotalFils,
}: {
  locale: Locale;
  restaurantSlug: string;
  tableCode: string;
  activeProfile: EngineDinerProfile;
  currentCartTotalFils: number;
}) {
  const isAr = locale === "ar";
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [aiNotConfigured, setAiNotConfigured] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<AssistantTurn[]>([]);

  const samplePrompts = isAr
    ? [
        "ما الأطباق المشبعة بأقل من ٣٠ درهم وبدون ألبان؟",
        "ما أفضل مقبلات نباتية موثقة للمشاركة؟",
        "اقترح طبقاً غنياً بالبروتين يناسب ملفي الغذائي",
      ]
    : [
        "What's filling but under AED 30 with no dairy?",
        "Which verified vegetarian mezze are best to share?",
        "Recommend a high-protein dish that fits my profile",
      ];

  async function askQuestion(qText: string) {
    const trimmed = qText.trim();
    if (trimmed.length < 2 || loading) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/tables/${encodeURIComponent(restaurantSlug)}/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          locale,
          tableCode,
          currentCartTotalFils,
          profileOverride: {
            displayName: activeProfile.displayName,
            dietaryRestrictions: activeProfile.dietaryRestrictions,
            allergens: activeProfile.allergens,
            likedIngredients: activeProfile.likedIngredients ?? [],
            dislikedIngredients: activeProfile.dislikedIngredients ?? [],
            spiceTolerance: activeProfile.spiceTolerance ?? "MEDIUM",
            maxBudgetAed: activeProfile.maxBudgetAed ?? null,
            preferHighProtein: activeProfile.preferHighProtein ?? false,
            preferKeto: activeProfile.preferKeto ?? false,
          },
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        answer?: string;
        dishes?: MenuAssistantDishLink[];
        error?: string;
        reason?: string;
      };

      if (!res.ok) {
        if (res.status === 503 || data.reason === "AI_NOT_CONFIGURED") {
          setAiNotConfigured(true);
        } else {
          setError(
            data.error || (isAr ? "تعذر الحصول على إجابة حالياً." : "Unable to answer right now."),
          );
        }
        setLoading(false);
        return;
      }

      setHistory((prev) => [
        ...prev,
        {
          question: trimmed,
          answer: data.answer ?? "",
          dishes: data.dishes ?? [],
        },
      ]);
      setQuestion("");
    } catch {
      setError(isAr ? "خطأ في الاتصال بالشبكة." : "Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      aria-label={isAr ? "مساعد القائمة الذكي" : "Menu Assistant"}
      className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-primary)]">
            <Bot className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-sm font-extrabold text-[var(--text-primary)]">
              {isAr ? "اسأل مساعد القائمة الموثقة" : "Ask Verified Menu Assistant"}
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              {isAr
                ? "يجيب فقط من أطباق هذا المطعم الموثقة والمناسبة لملفك."
                : "Grounded strictly in this restaurant's verified dishes for your active profile."}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[var(--accent-soft)] px-3.5 py-2 text-xs font-bold text-[var(--accent-primary)] transition hover:opacity-90"
        >
          {open ? (
            <>
              <X className="h-3.5 w-3.5" />
              <span>{isAr ? "إغلاق المحادثة" : "Close Chat"}</span>
            </>
          ) : (
            <>
              <MessageSquareText className="h-3.5 w-3.5" />
              <span>{isAr ? "اسأل عن الأطباق" : "Ask Menu Assistant"}</span>
            </>
          )}
        </button>
      </div>

      {open && (
        <div className="mt-4 space-y-4 border-t border-[var(--border-subtle)] pt-4">
          {/* Quick sample prompts */}
          <div className="flex flex-wrap gap-2">
            {samplePrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={loading}
                onClick={() => {
                  setQuestion(prompt);
                  void askQuestion(prompt);
                }}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition hover:border-[var(--accent-primary)] hover:text-[var(--text-primary)] disabled:opacity-50"
              >
                <Sparkles className="h-3 w-3 text-[var(--accent-primary)]" />
                <span>{prompt}</span>
              </button>
            ))}
          </div>

          {aiNotConfigured && (
            <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs font-semibold text-amber-800 dark:text-amber-300">
              {isAr
                ? "الذكاء الاصطناعي غير مفعل حالياً (AI not configured) — التصفية الحتمية للحساسية وترتيب الميزانية أعلاه يعملان بالكامل."
                : "AI not configured on this environment — deterministic allergy filtering and budget ranking above remain 100% active."}
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs font-semibold text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {history.length > 0 && (
            <div className="max-h-96 space-y-3 overflow-y-auto pe-1">
              {history.map((turn, idx) => (
                <div
                  key={idx}
                  className="space-y-2.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3.5"
                >
                  <p className="text-xs font-bold text-[var(--accent-primary)]">
                    {isAr ? "سؤالك:" : "You:"} {turn.question}
                  </p>
                  <p className="text-xs leading-relaxed text-[var(--text-primary)]">
                    {turn.answer}
                  </p>

                  {turn.dishes.length > 0 && (
                    <div className="grid gap-2 pt-1 sm:grid-cols-2">
                      {turn.dishes.map((dish) => {
                        const mods = isAr ? dish.requiredModifiersAr : dish.requiredModifiersEn;
                        return (
                          <Link
                            key={dish.id}
                            href={dish.href}
                            className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-xs transition hover:border-[var(--accent-primary)]"
                          >
                            <div>
                              <p className="font-bold text-[var(--text-primary)]">
                                {pickLocalized(dish.nameEn, dish.nameAr, locale)}
                              </p>
                              {mods.length > 0 && (
                                <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                                  ✓ {mods.join(", ")}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 font-mono font-bold text-[var(--accent-primary)]">
                              <span>AED {dish.effectivePriceAed}</span>
                              <ExternalLink className="h-3 w-3" />
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void askQuestion(question);
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={
                isAr
                  ? "مثال: ما الأطباق المشبعة تحت ٣٠ درهم بدون حليب؟"
                  : "e.g. What's filling but under AED 30 with no dairy?"
              }
              maxLength={600}
              className="min-h-11 flex-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3.5 py-2 text-xs text-[var(--text-primary)]"
            />
            <button
              type="submit"
              disabled={loading || question.trim().length < 2}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-[var(--accent-primary)] px-4 py-2 text-xs font-bold text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              <span>
                {loading ? (isAr ? "جاري البحث..." : "Asking...") : isAr ? "إرسال" : "Ask"}
              </span>
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
