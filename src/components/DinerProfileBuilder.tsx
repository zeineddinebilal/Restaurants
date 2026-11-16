"use client";

import type { SpiceLevel } from "@prisma/client";
import { CheckCircle2, Sparkles, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SerializedDinerProfile } from "@/lib/diner/profile";
import type { Locale } from "@/lib/i18n/dictionaries";
import {
  ALLERGEN_LABELS,
  CANONICAL_ALLERGENS,
  DIET_TAG_LABELS,
  SPICE_LEVELS,
} from "@/lib/menu/taxonomy";

const HARD_DIETS = ["vegetarian", "vegan", "pescatarian", "halal"] as const;
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
const QUICK_DISLIKES = ["olives", "raw onion", "coriander", "chili", "pickles"];
const BUDGET_PRESETS = ["30.00", "40.00", "60.00", "85.00"];

function toggleStr(list: string[], item: string): string[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export function DinerProfileBuilder({
  locale,
  initialProfile,
  aiConfigured,
  returnTo,
  heading,
  subheading,
}: {
  locale: Locale;
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
  const [preferHighProtein, setPreferHighProtein] = useState(
    initialProfile?.preferHighProtein ?? false,
  );
  const [preferKeto, setPreferKeto] = useState(initialProfile?.preferKeto ?? false);

  const [chatInput, setChatInput] = useState("");
  const [chatReply, setChatReply] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function handleTasteChat(e: React.FormEvent) {
    e.preventDefault();
    if (!chatInput.trim()) return;
    setChatLoading(true);
    setFeedback(null);

    const res = await fetch("/api/diner/taste-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: chatInput.trim(), locale }),
    });
    setChatLoading(false);

    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      reply?: string;
      patch?: {
        dietaryRestrictions: string[];
        allergens: string[];
        likedIngredients: string[];
        dislikedIngredients: string[];
        spiceTolerance?: SpiceLevel;
        maxBudgetAed?: string | null;
        preferHighProtein?: boolean;
        preferKeto?: boolean;
      };
    };

    if (!res.ok || !data.patch) {
      setFeedback({ type: "err", text: data.error || "Taste Profile Agent unavailable" });
      return;
    }

    setChatReply(data.reply ?? null);
    if (data.patch.dietaryRestrictions.length > 0) {
      setDietaryRestrictions((prev) =>
        Array.from(new Set([...prev, ...data.patch!.dietaryRestrictions])),
      );
    }
    if (data.patch.allergens.length > 0) {
      setAllergens((prev) => Array.from(new Set([...prev, ...data.patch!.allergens])));
    }
    if (data.patch.likedIngredients.length > 0) {
      setLikedIngredients((prev) =>
        Array.from(new Set([...prev, ...data.patch!.likedIngredients])),
      );
    }
    if (data.patch.dislikedIngredients.length > 0) {
      setDislikedIngredients((prev) =>
        Array.from(new Set([...prev, ...data.patch!.dislikedIngredients])),
      );
    }
    if (data.patch.spiceTolerance) {
      setSpiceTolerance(data.patch.spiceTolerance);
    }
    if (data.patch.maxBudgetAed !== undefined) {
      setMaxBudgetAed(data.patch.maxBudgetAed ?? "");
    }
    if (data.patch.preferHighProtein !== undefined) {
      setPreferHighProtein(data.patch.preferHighProtein);
    }
    if (data.patch.preferKeto !== undefined) {
      setPreferKeto(data.patch.preferKeto);
    }
    setChatInput("");
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);

    const res = await fetch("/api/diner/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: displayName.trim() || (isAr ? "ضيف" : "Guest Diner"),
        dietaryRestrictions,
        allergens,
        likedIngredients,
        dislikedIngredients,
        favoriteCuisines: ["Lebanese"],
        spiceTolerance,
        maxBudgetAed: maxBudgetAed.trim() || null,
        preferHighProtein,
        preferKeto,
      }),
    });
    setSaving(false);

    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setFeedback({ type: "err", text: data.error || "Could not save profile" });
      return;
    }

    if (returnTo && returnTo.startsWith("/")) {
      router.push(returnTo);
      router.refresh();
      return;
    }

    setFeedback({
      type: "ok",
      text: isAr ? "تم حفظ ملفك الغذائي بنجاح!" : "Your food profile is saved!",
    });
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-extrabold text-[var(--text-primary)] sm:text-3xl">
          {heading}
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">{subheading}</p>
      </div>

      {/* Optional Taste Profile AI Chat */}
      <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[var(--accent-primary)]" />
            <h2 className="text-sm font-bold">
              {isAr ? "مساعد الذوق الذكي (اختياري)" : "Taste Profile AI Assistant (Optional)"}
            </h2>
          </div>
          {!aiConfigured && (
            <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
              {isAr ? "الذكاء الاصطناعي غير مُعدّ" : "AI not configured"}
            </span>
          )}
        </div>

        {aiConfigured ? (
          <form onSubmit={handleTasteChat} className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder={
                isAr
                  ? "مثال: عندي حساسية ألبان، أحب الدجاج المشوي والثوم وميزانيتي ٤٠ درهم"
                  : "e.g. I'm lactose intolerant, love garlic & chicken, meal budget AED 40"
              }
              className="flex-1 min-h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3.5 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={chatLoading || !chatInput.trim()}
              className="min-h-11 rounded-xl bg-[var(--accent-primary)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {chatLoading ? "..." : isAr ? "تعبئة تلقائية" : "Auto-Fill Chips"}
            </button>
          </form>
        ) : (
          <p className="mt-1.5 text-xs text-[var(--text-secondary)]">
            {isAr
              ? "اختر حساسيتك وتفضيلاتك وميزانيتك مباشرة من الأزرار أدناه."
              : "Use the quick-pick chips below to configure your exact restrictions and meal budget."}
          </p>
        )}

        {chatReply && (
          <p className="mt-3 rounded-xl bg-[var(--accent-soft)] px-3.5 py-2.5 text-xs font-medium text-[var(--text-primary)]">
            {chatReply}
          </p>
        )}
      </section>

      {feedback && (
        <div
          role="status"
          className={`rounded-2xl px-4 py-3 text-sm font-medium ${
            feedback.type === "ok"
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
              : "bg-[var(--accent-soft)] text-[var(--accent-primary)]"
          }`}
        >
          {feedback.text}
        </div>
      )}

      <form onSubmit={handleSaveProfile} className="space-y-6">
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
            className="mt-2 w-full min-h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3.5 py-2 text-sm"
          />
        </section>

        {/* Step 1: Hard Restrictions */}
        <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-sm space-y-5">
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
              {isAr ? "النظام الغذائي" : "Strict Diet"}
            </span>
            <div className="flex flex-wrap gap-2">
              {HARD_DIETS.map((diet) => {
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
                    {DIET_TAG_LABELS[diet][locale]}
                  </button>
                );
              })}
            </div>
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
          </div>
        </section>

        {/* Step 2: Soft Preferences */}
        <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-sm space-y-5">
          <div>
            <h2 className="text-lg font-bold">
              {isAr ? "٢. النكهات والتفضيلات المرنة" : "2. Taste Preferences (Soft Ranking)"}
            </h2>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {isAr
                ? "ترفع الأطباق المناسبة إلى أعلى القائمة دون إخفاء الخيارات الأخرى."
                : "Boosts dishes you love to the top without hiding other options."}
            </p>
          </div>

          <div className="space-y-2">
            <span className="block text-xs font-semibold">
              {isAr ? "أحب" : "Ingredients You Love"}
            </span>
            <div className="flex flex-wrap gap-2">
              {QUICK_LIKES.map((ing) => {
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
              {isAr ? "لا أفضل" : "Ingredients to Down-Rank"}
            </span>
            <div className="flex flex-wrap gap-2">
              {QUICK_DISLIKES.map((ing) => {
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold">
                {isAr ? "تحمل الحرارة (الفلفل)" : "Spice Tolerance"}
              </label>
              <select
                value={spiceTolerance}
                onChange={(e) => setSpiceTolerance(e.target.value as SpiceLevel)}
                className="w-full min-h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm"
              >
                {SPICE_LEVELS.map((sp) => (
                  <option key={sp} value={sp}>
                    {sp}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <button
                type="button"
                onClick={() => setPreferHighProtein((v) => !v)}
                className={`min-h-10 rounded-xl px-3.5 py-2 text-xs font-semibold ${
                  preferHighProtein
                    ? "bg-emerald-600 text-white"
                    : "border border-[var(--border-subtle)] bg-[var(--bg-canvas)]"
                }`}
              >
                {DIET_TAG_LABELS.high_protein[locale]}
              </button>
              <button
                type="button"
                onClick={() => setPreferKeto((v) => !v)}
                className={`min-h-10 rounded-xl px-3.5 py-2 text-xs font-semibold ${
                  preferKeto
                    ? "bg-emerald-600 text-white"
                    : "border border-[var(--border-subtle)] bg-[var(--bg-canvas)]"
                }`}
              >
                {DIET_TAG_LABELS.keto[locale]}
              </button>
            </div>
          </div>
        </section>

        {/* Step 3: Per-Meal Budget */}
        <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-sm space-y-4">
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
              className="mt-1 w-full min-h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3.5 py-2 font-mono text-sm"
            />
          </div>
        </section>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex w-full min-h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--accent-primary)] px-6 py-3.5 text-base font-bold text-white shadow-sm transition hover:bg-[var(--accent-hover)] disabled:opacity-60"
        >
          <CheckCircle2 className="h-5 w-5" />
          <span>
            {saving
              ? isAr
                ? "جاري الحفظ..."
                : "Saving Profile..."
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
