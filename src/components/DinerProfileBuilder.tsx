"use client";

import type { SpiceLevel } from "@prisma/client";
import { ArrowLeft, CheckCircle2, Home, ShieldAlert, Sparkles, Wallet, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SerializedDinerProfile } from "@/lib/diner/profile";
import type { Locale } from "@/lib/i18n/dictionaries";
import {
  buildCustomAvoidIngredient,
  type CustomAvoidIngredient,
} from "@/lib/menu/ingredient-synonyms";
import {
  ALLERGEN_LABELS,
  CANONICAL_ALLERGENS,
  DINER_DIET_LABELS,
  HARD_DINER_DIETS,
  SOFT_LIFESTYLE_DIETS,
  SPICE_LEVELS,
} from "@/lib/menu/taxonomy";

const QUICK_LIKES = [
  "chickpeas",
  "garlic",
  "charcoal chicken",
  "grilled meat",
  "eggplant",
  "pomegranate",
  "lemon",
  "mint",
  "sumac",
  "fries",
];
const QUICK_DISLIKES = ["olives", "raw onion", "coriander", "chili", "pickles", "tomato"];
const BUDGET_PRESETS = ["30.00", "40.00", "60.00", "85.00"];

function toggleStr(list: string[], item: string): string[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

interface PendingAiInterpretation {
  reply: string;
  dietaryRestrictions: string[];
  allergens: string[];
  customAvoidIngredients: CustomAvoidIngredient[];
  likedIngredients: string[];
  dislikedIngredients: string[];
  spiceTolerance?: SpiceLevel;
  maxBudgetAed?: string | null;
}

export function DinerProfileBuilder({
  locale,
  mode = "onboarding",
  initialProfile,
  aiConfigured,
  returnTo,
  heading,
  subheading,
}: {
  locale: Locale;
  mode?: "onboarding" | "profile";
  initialProfile: SerializedDinerProfile | null;
  aiConfigured: boolean;
  returnTo?: string;
  heading: string;
  subheading: string;
}) {
  const router = useRouter();
  const isAr = locale === "ar";

  const [displayName, setDisplayName] = useState(initialProfile?.displayName ?? "");
  const [dietaryRestrictions, setDietaryRestrictions] = useState<string[]>(
    initialProfile?.dietaryRestrictions ?? [],
  );
  const [allergens, setAllergens] = useState<string[]>(initialProfile?.allergens ?? []);
  const [customAvoidIngredients, setCustomAvoidIngredients] = useState<CustomAvoidIngredient[]>(
    initialProfile?.customAvoidIngredients ?? [],
  );
  const [likedIngredients, setLikedIngredients] = useState<string[]>(
    initialProfile?.likedIngredients ?? [],
  );
  const [dislikedIngredients, setDislikedIngredients] = useState<string[]>(
    initialProfile?.dislikedIngredients ?? [],
  );
  const [spiceTolerance, setSpiceTolerance] = useState<SpiceLevel>(
    initialProfile?.spiceTolerance ?? "MEDIUM",
  );
  const [maxBudgetAed, setMaxBudgetAed] = useState<string>(initialProfile?.maxBudgetAed ?? "");
  const [shareFullProfile, setShareFullProfile] = useState<boolean>(
    initialProfile?.shareFullProfileWithCompanions ?? false,
  );

  // Free-text "Other" & natural-language inputs
  const [otherDietText, setOtherDietText] = useState("");
  const [otherAllergyText, setOtherAllergyText] = useState("");
  const [freePreferencesText, setFreePreferencesText] = useState("");
  const [chatInput, setChatInput] = useState("");

  const [interpreting, setInterpreting] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingAiInterpretation | null>(
    null,
  );

  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const hasUnparsedFreeText = Boolean(
    otherDietText.trim() ||
    otherAllergyText.trim() ||
    freePreferencesText.trim() ||
    chatInput.trim(),
  );

  async function interpretFreeText(): Promise<boolean> {
    const parts: string[] = [];
    if (chatInput.trim()) parts.push(chatInput.trim());
    if (otherDietText.trim()) parts.push(`Other diet: ${otherDietText.trim()}`);
    if (otherAllergyText.trim())
      parts.push(`Hard allergies/intolerances: ${otherAllergyText.trim()}`);
    if (freePreferencesText.trim())
      parts.push(`Likes & dislikes in my own words: ${freePreferencesText.trim()}`);

    const combinedMessage = parts.join(". ");
    if (combinedMessage.length < 2) return false;

    setInterpreting(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/diner/taste-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: combinedMessage,
          otherDietText: otherDietText.trim() || undefined,
          otherAllergyText: otherAllergyText.trim() || undefined,
          freePreferencesText: freePreferencesText.trim() || chatInput.trim() || undefined,
          locale,
          allowFallback: true,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        reply?: string;
        patch?: {
          dietaryRestrictions: string[];
          allergens: string[];
          customAvoidIngredients?: CustomAvoidIngredient[];
          likedIngredients: string[];
          dislikedIngredients: string[];
          spiceTolerance?: SpiceLevel;
          maxBudgetAed?: string | null;
        };
      };

      setInterpreting(false);
      if (!res.ok || !data.patch) {
        setFeedback({ type: "err", text: data.error || "Could not interpret text" });
        return false;
      }

      setPendingConfirmation({
        reply: data.reply || (isAr ? "إليك ما فهمته من ملاحظاتك:" : "Here's what I understood:"),
        dietaryRestrictions: data.patch.dietaryRestrictions,
        allergens: data.patch.allergens,
        customAvoidIngredients: data.patch.customAvoidIngredients ?? [],
        likedIngredients: data.patch.likedIngredients,
        dislikedIngredients: data.patch.dislikedIngredients,
        spiceTolerance: data.patch.spiceTolerance,
        maxBudgetAed: data.patch.maxBudgetAed,
      });
      return true;
    } catch {
      setInterpreting(false);
      setFeedback({ type: "err", text: "Network error while interpreting free text." });
      return false;
    }
  }

  async function persistProfileToServer(overrides?: {
    dietaryRestrictions?: string[];
    allergens?: string[];
    customAvoidIngredients?: CustomAvoidIngredient[];
    likedIngredients?: string[];
    dislikedIngredients?: string[];
    spiceTolerance?: SpiceLevel;
    maxBudgetAed?: string;
  }) {
    setSaving(true);
    setFeedback(null);

    const finalDiets = overrides?.dietaryRestrictions ?? dietaryRestrictions;
    const finalAllergens = overrides?.allergens ?? allergens;
    const finalCustomAvoids = overrides?.customAvoidIngredients ?? customAvoidIngredients;
    const finalLikes = overrides?.likedIngredients ?? likedIngredients;
    const finalDislikes = overrides?.dislikedIngredients ?? dislikedIngredients;
    const finalSpice = overrides?.spiceTolerance ?? spiceTolerance;
    const finalBudget = (overrides?.maxBudgetAed ?? maxBudgetAed).trim();

    const res = await fetch("/api/diner/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: displayName.trim() || (isAr ? "ضيف" : "Guest Diner"),
        dietaryRestrictions: finalDiets,
        allergens: finalAllergens,
        customAvoidIngredients: finalCustomAvoids,
        likedIngredients: finalLikes,
        dislikedIngredients: finalDislikes,
        favoriteCuisines: ["Lebanese"],
        spiceTolerance: finalSpice,
        maxBudgetAed: finalBudget || null,
        preferHighProtein: finalDiets.includes("high_protein"),
        preferKeto: finalDiets.includes("keto"),
        shareFullProfileWithCompanions: shareFullProfile,
      }),
    });
    setSaving(false);

    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setFeedback({ type: "err", text: data.error || "Could not save profile" });
      return;
    }

    setSavedSuccess(true);

    if (mode === "onboarding") {
      setFeedback({
        type: "ok",
        text: isAr ? "تم حفظ الملف الغذائي ✓" : "Profile saved ✓",
      });
      const dest = returnTo && returnTo.startsWith("/") ? returnTo : "/home";
      setTimeout(() => {
        router.push(dest);
        router.refresh();
      }, 600);
      return;
    }

    if (returnTo && returnTo.startsWith("/")) {
      router.push(returnTo);
      router.refresh();
      return;
    }

    setFeedback({
      type: "ok",
      text: isAr ? "تم الحفظ ✓" : "Saved ✓",
    });
    router.refresh();
  }

  function applyConfirmedInterpretation(andSaveNow: boolean) {
    if (!pendingConfirmation) return;

    const mergedDiets = Array.from(
      new Set([...dietaryRestrictions, ...pendingConfirmation.dietaryRestrictions]),
    );
    const mergedAllergens = Array.from(new Set([...allergens, ...pendingConfirmation.allergens]));
    const customMap = new Map(customAvoidIngredients.map((c) => [c.key, c]));
    for (const c of pendingConfirmation.customAvoidIngredients) {
      customMap.set(c.key, c);
    }
    const mergedCustomAvoids = Array.from(customMap.values());
    const mergedLikes = Array.from(
      new Set([...likedIngredients, ...pendingConfirmation.likedIngredients]),
    );
    const mergedDislikes = Array.from(
      new Set([...dislikedIngredients, ...pendingConfirmation.dislikedIngredients]),
    );
    const nextSpice = pendingConfirmation.spiceTolerance ?? spiceTolerance;
    const nextBudget =
      pendingConfirmation.maxBudgetAed !== undefined
        ? (pendingConfirmation.maxBudgetAed ?? "")
        : maxBudgetAed;

    setDietaryRestrictions(mergedDiets);
    setAllergens(mergedAllergens);
    setCustomAvoidIngredients(mergedCustomAvoids);
    setLikedIngredients(mergedLikes);
    setDislikedIngredients(mergedDislikes);
    setSpiceTolerance(nextSpice);
    setMaxBudgetAed(nextBudget);

    // Clear interpreted free-text fields now that user confirmed them
    setOtherDietText("");
    setOtherAllergyText("");
    setFreePreferencesText("");
    setChatInput("");
    setPendingConfirmation(null);

    if (andSaveNow) {
      void persistProfileToServer({
        dietaryRestrictions: mergedDiets,
        allergens: mergedAllergens,
        customAvoidIngredients: mergedCustomAvoids,
        likedIngredients: mergedLikes,
        dislikedIngredients: mergedDislikes,
        spiceTolerance: nextSpice,
        maxBudgetAed: nextBudget,
      });
    }
  }

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Never save un-confirmed free text! Always show the confirmation screen first.
    if (hasUnparsedFreeText) {
      await interpretFreeText();
      return;
    }
    await persistProfileToServer();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[var(--text-primary)] sm:text-3xl">
            {heading}
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{subheading}</p>
        </div>

        {mode === "profile" && (
          <Link
            href="/home"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2 text-xs font-bold text-[var(--accent-primary)] hover:border-[var(--accent-primary)]"
          >
            <Home className="h-4 w-4" />
            <span>{isAr ? "العودة للرئيسية" : "Back to Home"}</span>
          </Link>
        )}
      </div>

      {/* Natural Language Taste Profile Assistant */}
      <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[var(--accent-primary)]" />
            <h2 className="text-sm font-bold">
              {isAr
                ? "اكتب بكلماتك الخاصة (يفهمه المساعد الذكي ويعرض شاشة تأكيد)"
                : "Describe Your Food Needs in Your Own Words"}
            </h2>
          </div>
          {!aiConfigured && (
            <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
              {isAr ? "مطابقة ذكية محلية" : "Smart local parser"}
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder={
              isAr
                ? "مثال: حساسية طماطم، لا آكل لحم خنزير، لا أحب المخلل ولا العشبة الخضراء بالتبولة"
                : "e.g. Tomato allergy, no pork, dislike pickles & that green herb in tabbouleh"
            }
            className="min-h-11 flex-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3.5 py-2 text-sm"
          />
          <button
            type="button"
            disabled={interpreting || !hasUnparsedFreeText}
            onClick={() => void interpretFreeText()}
            className="min-h-11 rounded-xl bg-[var(--accent-primary)] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            {interpreting
              ? isAr
                ? "جاري الفهم..."
                : "Understanding..."
              : isAr
                ? "فهم ومراجعة قبل الحفظ"
                : "Interpret & Review"}
          </button>
        </div>
      </section>

      {/* Mandatory Editable Confirmation Screen before saving free-text interpretations */}
      {pendingConfirmation && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm interpreted food profile"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-bold text-[var(--accent-primary)]">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  <span>{isAr ? "تأكيد قبل الحفظ" : "Confirm Before Saving"}</span>
                </span>
                <h2 className="mt-2 text-xl font-extrabold">
                  {isAr ? "إليك ما فهمته — عدّل أو أكّد:" : "Here's What I Understood"}
                </h2>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  {pendingConfirmation.reply}
                </p>
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-4 text-xs">
              {/* Hard Allergies & Custom Hard Restrictions */}
              <div>
                <p className="font-bold text-red-700 dark:text-red-300">
                  {isAr
                    ? "قيود صارمة (تُخفي الأطباق المتعارضة تماماً):"
                    : "Allergies & Hard Filters (strictly hides conflicting dishes):"}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {pendingConfirmation.allergens.map((a) => (
                    <span
                      key={a}
                      className="inline-flex items-center gap-1 rounded-full bg-red-600 px-3 py-1 font-bold text-white"
                    >
                      <span>Allergy: {a} (hard filter)</span>
                      <button
                        type="button"
                        onClick={() =>
                          setPendingConfirmation({
                            ...pendingConfirmation,
                            allergens: pendingConfirmation.allergens.filter((x) => x !== a),
                          })
                        }
                        aria-label={`Remove ${a}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  {pendingConfirmation.customAvoidIngredients.map((c) => (
                    <span
                      key={c.key}
                      className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1 font-bold text-white"
                    >
                      <span>
                        Allergy/Avoid: {c.labelEn} / {c.labelAr} (hard filter)
                      </span>
                      <button
                        type="button"
                        title="Switch to soft dislike instead"
                        onClick={() =>
                          setPendingConfirmation({
                            ...pendingConfirmation,
                            customAvoidIngredients:
                              pendingConfirmation.customAvoidIngredients.filter(
                                (x) => x.key !== c.key,
                              ),
                            dislikedIngredients: Array.from(
                              new Set([...pendingConfirmation.dislikedIngredients, c.labelEn]),
                            ),
                          })
                        }
                        className="rounded bg-white/20 px-1.5 py-0.5 text-[10px]"
                      >
                        {isAr ? "اجعله تفضيلاً مرناً" : "Make soft dislike"}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setPendingConfirmation({
                            ...pendingConfirmation,
                            customAvoidIngredients:
                              pendingConfirmation.customAvoidIngredients.filter(
                                (x) => x.key !== c.key,
                              ),
                          })
                        }
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  {pendingConfirmation.allergens.length === 0 &&
                    pendingConfirmation.customAvoidIngredients.length === 0 && (
                      <span className="text-[var(--text-secondary)]">None</span>
                    )}
                </div>
              </div>

              {/* Diets */}
              <div>
                <p className="font-bold text-emerald-700 dark:text-emerald-300">
                  {isAr ? "النظام الغذائي:" : "Diets:"}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {pendingConfirmation.dietaryRestrictions.length === 0 ? (
                    <span className="text-[var(--text-secondary)]">None</span>
                  ) : (
                    pendingConfirmation.dietaryRestrictions.map((d) => (
                      <span
                        key={d}
                        className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1 font-bold text-white"
                      >
                        <span>
                          Diet:{" "}
                          {DINER_DIET_LABELS[d as keyof typeof DINER_DIET_LABELS]?.[locale] ?? d}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setPendingConfirmation({
                              ...pendingConfirmation,
                              dietaryRestrictions: pendingConfirmation.dietaryRestrictions.filter(
                                (x) => x !== d,
                              ),
                            })
                          }
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* Soft Dislikes */}
              <div>
                <p className="font-bold text-[var(--text-primary)]">
                  {isAr
                    ? "لا أفضل (مرن — نطلبه بدون هذا المكون إن أمكن):"
                    : "Dislikes (soft — requests 'No X' instead of hiding):"}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {pendingConfirmation.dislikedIngredients.length === 0 ? (
                    <span className="text-[var(--text-secondary)]">None</span>
                  ) : (
                    pendingConfirmation.dislikedIngredients.map((d) => (
                      <span
                        key={d}
                        className="inline-flex items-center gap-1.5 rounded-full bg-neutral-800 px-3 py-1 font-bold text-white"
                      >
                        <span>Dislike: {d} (soft)</span>
                        <button
                          type="button"
                          onClick={() => {
                            const custom = buildCustomAvoidIngredient(d);
                            setPendingConfirmation({
                              ...pendingConfirmation,
                              dislikedIngredients: pendingConfirmation.dislikedIngredients.filter(
                                (x) => x !== d,
                              ),
                              customAvoidIngredients: [
                                ...pendingConfirmation.customAvoidIngredients,
                                custom,
                              ],
                            });
                          }}
                          className="rounded bg-red-500/40 px-1.5 py-0.5 text-[10px]"
                        >
                          {isAr ? "حساسية صارمة" : "Make hard allergy"}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setPendingConfirmation({
                              ...pendingConfirmation,
                              dislikedIngredients: pendingConfirmation.dislikedIngredients.filter(
                                (x) => x !== d,
                              ),
                            })
                          }
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* Soft Likes */}
              {pendingConfirmation.likedIngredients.length > 0 && (
                <div>
                  <p className="font-bold text-[var(--accent-primary)]">
                    {isAr ? "مكونات مفضلة:" : "Likes:"}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {pendingConfirmation.likedIngredients.map((l) => (
                      <span
                        key={l}
                        className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-primary)] px-3 py-1 font-bold text-white"
                      >
                        <span>+{l}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setPendingConfirmation({
                              ...pendingConfirmation,
                              likedIngredients: pendingConfirmation.likedIngredients.filter(
                                (x) => x !== l,
                              ),
                            })
                          }
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPendingConfirmation(null)}
                className="min-h-10 rounded-xl border border-[var(--border-subtle)] px-4 py-2 text-xs font-semibold"
              >
                {isAr ? "تعديل النص" : "Cancel / Edit Text"}
              </button>
              <button
                type="button"
                onClick={() => applyConfirmedInterpretation(false)}
                className="min-h-10 rounded-xl border border-[var(--accent-primary)] px-4 py-2 text-xs font-bold text-[var(--accent-primary)]"
              >
                {isAr ? "تطبيق على النموذج فقط" : "Apply to Form Only"}
              </button>
              <button
                type="button"
                onClick={() => applyConfirmedInterpretation(true)}
                className="min-h-10 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-extrabold text-white hover:bg-emerald-700"
              >
                {isAr ? "تأكيد وحفظ الملف الغذائي" : "Confirm & Save Profile"}
              </button>
            </div>
          </div>
        </div>
      )}

      {feedback && (
        <div
          role="status"
          className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-bold ${
            feedback.type === "ok"
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
              : "bg-[var(--accent-soft)] text-[var(--accent-primary)]"
          }`}
        >
          <span>{feedback.text}</span>
          {savedSuccess && mode === "profile" && (
            <Link
              href="/home"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-extrabold text-white hover:bg-emerald-700"
            >
              <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
              <span>{isAr ? "العودة للرئيسية" : "Back to Home"}</span>
            </Link>
          )}
        </div>
      )}

      <form onSubmit={handleFormSubmit} className="space-y-6">
        {/* Name */}
        <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-sm">
          <label htmlFor="profile-display-name" className="block text-sm font-bold">
            {isAr ? "اسمك على الطاولة" : "Your Display Name at the Table"}
          </label>
          <input
            id="profile-display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={isAr ? "مثال: بلال" : "e.g. Bilal"}
            className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3.5 py-2 text-sm"
          />
        </section>

        {/* Step 1: Hard Restrictions */}
        <section className="space-y-5 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-sm">
          <div>
            <h2 className="text-lg font-bold">
              {isAr
                ? "١. القيود الصارمة (حساسية، عدم تحمل غذائي، نظام غذائي)"
                : "1. Hard Restrictions (Allergies, Intolerances & Strict Diets)"}
            </h2>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {isAr
                ? "يتم إخفاء أي طبق يتعارض مع اختياراتك هنا ما لم يتوفر تعديل موثق من المطعم."
                : "Conflicting dishes are strictly hidden unless unlocked by a restaurant-verified modifier."}
            </p>
          </div>

          <div className="space-y-2">
            <span className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              {isAr ? "النظام الغذائي وأسلوب الحياة" : "Diet & Lifestyle"}
            </span>
            <div className="flex flex-wrap gap-2">
              {[...HARD_DINER_DIETS, ...SOFT_LIFESTYLE_DIETS].map((diet) => {
                const active = dietaryRestrictions.includes(diet);
                return (
                  <button
                    key={diet}
                    type="button"
                    onClick={() => setDietaryRestrictions((p) => toggleStr(p, diet))}
                    className={`min-h-10 rounded-full px-4 py-2 text-xs font-semibold transition ${
                      active
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "border border-[var(--border-subtle)] bg-[var(--bg-canvas)]"
                    }`}
                  >
                    {DINER_DIET_LABELS[diet][locale]}
                  </button>
                );
              })}
            </div>
            <input
              value={otherDietText}
              onChange={(e) => setOtherDietText(e.target.value)}
              placeholder={
                isAr
                  ? "نظام غذائي آخر (نص حر — مثل: بدون لحم غنم، قليل الملح)..."
                  : "Other diet (free text — e.g. no lamb, diabetic-friendly)..."
              }
              className="mt-2 min-h-10 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3.5 py-2 text-xs"
            />
          </div>

          <div className="space-y-2">
            <span className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              {isAr ? "الحساسية وعدم التحمل الغذائي" : "Allergies & Intolerances"}
            </span>
            <div className="flex flex-wrap gap-2">
              {CANONICAL_ALLERGENS.map((alg) => {
                const active = allergens.includes(alg);
                return (
                  <button
                    key={alg}
                    type="button"
                    onClick={() => setAllergens((p) => toggleStr(p, alg))}
                    className={`min-h-10 rounded-full px-3.5 py-2 text-xs font-semibold transition ${
                      active
                        ? "bg-red-600 text-white shadow-xs"
                        : "border border-[var(--border-subtle)] bg-[var(--bg-canvas)]"
                    }`}
                  >
                    {ALLERGEN_LABELS[alg][locale]}
                  </button>
                );
              })}
            </div>

            {/* Active Custom Hard Restrictions */}
            {customAvoidIngredients.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {customAvoidIngredients.map((c) => (
                  <span
                    key={c.key}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-red-600 px-3.5 py-1.5 text-xs font-bold text-white"
                  >
                    <span>{isAr ? `تجنب صارم: ${c.labelAr}` : `Hard Avoid: ${c.labelEn}`}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setCustomAvoidIngredients((prev) => prev.filter((x) => x.key !== c.key))
                      }
                      aria-label={`Remove ${c.labelEn}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <input
              value={otherAllergyText}
              onChange={(e) => setOtherAllergyText(e.target.value)}
              placeholder={
                isAr
                  ? "حساسية أخرى (نص حر — مثل: حساسية طماطم، عدم تحمل الثوم، حساسية MSG)..."
                  : "Other allergy / intolerance (e.g. tomato allergy, garlic intolerance, I react to MSG)..."
              }
              className="mt-2 min-h-10 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3.5 py-2 text-xs"
            />
          </div>
        </section>

        {/* Step 2: Soft Preferences & "Without X" Dislikes */}
        <section className="space-y-5 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-sm">
          <div>
            <h2 className="text-lg font-bold">
              {isAr
                ? "٢. النكهات المفضلة وما لا تفضله («بدون X»)"
                : "2. Likes & Soft Dislikes ('Without X' — Never Hides Dishes)"}
            </h2>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {isAr
                ? "المكونات التي لا تفضلها لا تُخفي الطبق؛ بل نطلب تحضيره بدونها تلقائياً متى أمكن."
                : "Disliked garnishes stay on your menu and automatically add 'No X' to your order line."}
            </p>
          </div>

          <div className="space-y-2">
            <span className="block text-xs font-semibold">
              {isAr ? "أحب" : "Ingredients You Love"}
            </span>
            <div className="flex flex-wrap gap-2">
              {Array.from(new Set([...QUICK_LIKES, ...likedIngredients])).map((ing) => {
                const active = likedIngredients.includes(ing);
                return (
                  <button
                    key={ing}
                    type="button"
                    onClick={() => setLikedIngredients((p) => toggleStr(p, ing))}
                    className={`min-h-9 rounded-full px-3.5 py-1.5 text-xs font-medium ${
                      active
                        ? "bg-[var(--accent-primary)] text-white"
                        : "border border-[var(--border-subtle)] bg-[var(--bg-canvas)]"
                    }`}
                  >
                    +{ing}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <span className="block text-xs font-semibold">
              {isAr ? "لا أفضل (اطلبه بدونه)" : "Soft Dislikes (Request 'Without X')"}
            </span>
            <div className="flex flex-wrap gap-2">
              {Array.from(new Set([...QUICK_DISLIKES, ...dislikedIngredients])).map((ing) => {
                const active = dislikedIngredients.includes(ing);
                return (
                  <button
                    key={ing}
                    type="button"
                    onClick={() => setDislikedIngredients((p) => toggleStr(p, ing))}
                    className={`min-h-9 rounded-full px-3.5 py-1.5 text-xs font-medium ${
                      active
                        ? "bg-neutral-700 text-white"
                        : "border border-[var(--border-subtle)] bg-[var(--bg-canvas)]"
                    }`}
                  >
                    -{ing}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold">
              {isAr
                ? "اكتب ما تحب أو لا تحب بكلماتك الخاصة"
                : "Describe Likes / Dislikes in Your Own Words"}
            </label>
            <input
              value={freePreferencesText}
              onChange={(e) => setFreePreferencesText(e.target.value)}
              placeholder={
                isAr
                  ? "مثال: لا أحب العشبة الخضراء في التبولة، لا أحب الطماطم النيئة، أحب المشاوي"
                  : "e.g. I don't like that green herb in tabbouleh, nothing too oily, I don't like tomatoes"
              }
              className="mt-1.5 min-h-10 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3.5 py-2 text-xs"
            />
          </div>

          <div className="max-w-xs space-y-1.5">
            <label className="block text-xs font-semibold">
              {isAr ? "تحمل الحرارة (الفلفل)" : "Spice Tolerance"}
            </label>
            <select
              value={spiceTolerance}
              onChange={(e) => setSpiceTolerance(e.target.value as SpiceLevel)}
              className="min-h-10 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm"
            >
              {SPICE_LEVELS.map((sp) => (
                <option key={sp} value={sp}>
                  {sp}
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* Step 3: Per-Meal Budget & Companion Privacy */}
        <section className="space-y-4 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-[var(--accent-primary)]" />
            <div>
              <h2 className="text-lg font-bold">
                {isAr
                  ? "٣. ميزانية الوجبة الكاملة للفرد (درهم إماراتي)"
                  : "3. Meal Budget per Order (AED)"}
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                {isAr
                  ? "تُقارن أسعار الأطباق مع ميزانيتك المتبقية أثناء إضافة الأصناف لسلتك."
                  : "Ranks dishes against your remaining meal budget as you add items to your cart."}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {BUDGET_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setMaxBudgetAed(preset)}
                className={`min-h-10 rounded-full px-4 py-2 font-mono text-xs font-semibold ${
                  maxBudgetAed === preset
                    ? "bg-[var(--accent-primary)] text-white"
                    : "border border-[var(--border-subtle)] bg-[var(--bg-canvas)]"
                }`}
              >
                AED {preset}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setMaxBudgetAed("")}
              className={`min-h-10 rounded-full px-4 py-2 text-xs font-semibold ${
                maxBudgetAed === ""
                  ? "bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900"
                  : "border border-[var(--border-subtle)] bg-[var(--bg-canvas)]"
              }`}
            >
              {isAr ? "بدون حد أقصى" : "No budget cap"}
            </button>
          </div>

          <div className="max-w-xs">
            <label htmlFor="custom-budget-aed" className="block text-xs font-semibold">
              {isAr ? "مبلغ مخصص (AED)" : "Custom Meal Budget (AED)"}
            </label>
            <input
              id="custom-budget-aed"
              value={maxBudgetAed}
              onChange={(e) => setMaxBudgetAed(e.target.value)}
              placeholder="40.00"
              className="mt-1 min-h-10 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3.5 py-2 font-mono text-sm"
            />
          </div>

          <div className="border-t border-[var(--border-subtle)] pt-3">
            <label className="inline-flex items-start gap-2.5 text-xs">
              <input
                type="checkbox"
                checked={shareFullProfile}
                onChange={(e) => setShareFullProfile(e.target.checked)}
                className="mt-0.5"
              />
              <span className="text-[var(--text-secondary)]">
                {isAr
                  ? "مشاركة تفاصيل ملفي الغذائي الكاملة مع رفقاء الطعام المتصلين (افتراضياً يظهر لهم ملخص جماعي فقط دون تفاصيلك الفردية)."
                  : "Share my full food profile with connected Dining Companions (by default, companions only see anonymized group counts needed for shared dishes)."}
              </span>
            </label>
          </div>
        </section>

        <button
          type="submit"
          disabled={saving || interpreting}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent-primary)] px-6 py-3.5 text-base font-bold text-white shadow-sm transition hover:bg-[var(--accent-hover)] disabled:opacity-60"
        >
          <CheckCircle2 className="h-5 w-5" />
          <span>
            {saving
              ? isAr
                ? "جاري الحفظ..."
                : "Saving Profile..."
              : hasUnparsedFreeText
                ? isAr
                  ? "مراجعة الملاحظات النصية وتأكيدها قبل الحفظ"
                  : "Review & Confirm Free-Text Notes"
                : returnTo
                  ? isAr
                    ? "حفظ وعرض القائمة المخصصة"
                    : "Save & Return to Personalized Menu"
                  : isAr
                    ? "حفظ الملف الغذائي"
                    : "Save Food Profile"}
          </span>
        </button>
      </form>
    </div>
  );
}
