"use client";

import {
  AlertTriangle,
  Camera,
  ChevronDown,
  Flame,
  History,
  ShieldAlert,
  Sparkles,
  Upload,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { SerializedDinerProfile } from "@/lib/diner/profile";
import {
  type EngineDinerProfile,
  type EngineDishInput,
  type EvaluatedMenuItem,
  evaluatePersonalizedMenu,
  type MenuBadge,
} from "@/lib/engine/menu-engine";
import { type Locale, pickLocalized } from "@/lib/i18n/dictionaries";
import { formatAed } from "@/lib/money";

export interface SavedExternalScan {
  id: string;
  sourceLabel: string;
  dishes: EngineDishInput[];
  createdAt: string;
}

function renderExternalBadge(badge: MenuBadge, locale: Locale) {
  const isAr = locale === "ar";
  switch (badge) {
    case "UNVERIFIED_WARNING":
      return (
        <span
          key={badge}
          className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 dark:text-amber-300"
        >
          <AlertTriangle className="h-3 w-3" />
          <span>{isAr ? "تقدير غير موثق — اسأل المطعم" : "Not verified — ask restaurant"}</span>
        </span>
      );
    case "BEST_VALUE":
      return (
        <span
          key={badge}
          className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-sky-700 dark:text-sky-300"
        >
          <Wallet className="h-3 w-3" />
          <span>{isAr ? "أفضل قيمة" : "Best value"}</span>
        </span>
      );
    case "SPICY":
      return (
        <span
          key={badge}
          className="inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-orange-700 dark:text-orange-300"
        >
          <Flame className="h-3 w-3" />
          <span>{isAr ? "حار" : "Spicy"}</span>
        </span>
      );
    case "POPULAR":
      return (
        <span
          key={badge}
          className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--accent-primary)]"
        >
          <Sparkles className="h-3 w-3" />
          <span>{isAr ? "شائع" : "Popular"}</span>
        </span>
      );
    default:
      return null;
  }
}

export function ExternalScannerClient({
  locale,
  initialProfile,
  initialScans,
  initialScanId,
  initialShareError,
}: {
  locale: Locale;
  initialProfile: SerializedDinerProfile | null;
  initialScans: SavedExternalScan[];
  initialScanId?: string;
  initialShareError?: string;
}) {
  const isAr = locale === "ar";
  const [scans, setScans] = useState<SavedExternalScan[]>(initialScans);
  const [selectedScanId, setSelectedScanId] = useState<string | null>(
    initialScanId ?? initialScans[0]?.id ?? null,
  );
  const [sourceLabel, setSourceLabel] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(() => {
    if (initialShareError === "ai_not_configured") {
      return isAr
        ? "الذكاء الاصطناعي غير مفعل حالياً (AI not configured)."
        : "AI not configured — set GEMINI_API_KEY to extract dishes from screenshots.";
    }
    if (initialShareError) {
      return isAr
        ? "تعذر معالجة الصورة المشاركة. تأكد من رفع ١-٤ صور بحجم إجمالي لا يتجاوز ٥ ميجابايت."
        : "Could not process shared image. Upload 1–4 JPEG/PNG/WebP images (max 5 MB total).";
    }
    return null;
  });

  const activeProfile: EngineDinerProfile = useMemo(
    () => ({
      displayName: initialProfile?.displayName ?? (isAr ? "ضيف" : "Guest"),
      dietaryRestrictions: initialProfile?.dietaryRestrictions ?? [],
      allergens: initialProfile?.allergens ?? [],
      likedIngredients: initialProfile?.likedIngredients ?? [],
      dislikedIngredients: initialProfile?.dislikedIngredients ?? [],
      spiceTolerance: initialProfile?.spiceTolerance ?? "MEDIUM",
      maxBudgetAed: initialProfile?.maxBudgetAed ?? null,
      preferHighProtein: initialProfile?.preferHighProtein ?? false,
      preferKeto: initialProfile?.preferKeto ?? false,
      pastRatingsByDishId: {},
    }),
    [initialProfile, isAr],
  );

  const activeScan = useMemo(
    () => scans.find((s) => s.id === selectedScanId) ?? scans[0] ?? null,
    [scans, selectedScanId],
  );

  const evaluated = useMemo(() => {
    if (!activeScan) return null;
    return evaluatePersonalizedMenu({
      dishes: activeScan.dishes,
      profile: activeProfile,
      currentCartTotalFils: 0,
    });
  }, [activeScan, activeProfile]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedFiles.length === 0 || uploading) return;

    if (selectedFiles.length > 4) {
      setError(isAr ? "الحد الأقصى ٤ صور في المرة الواحدة." : "Upload at most 4 images per scan.");
      return;
    }

    const totalBytes = selectedFiles.reduce((s, f) => s + f.size, 0);
    if (totalBytes > 5 * 1024 * 1024) {
      setError(
        isAr
          ? "يجب ألا يتجاوز الحجم الإجمالي للصور ٥ ميجابايت."
          : "Total image size must not exceed 5 MB.",
      );
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const fd = new FormData();
      if (sourceLabel.trim()) fd.set("sourceLabel", sourceLabel.trim());
      for (const file of selectedFiles) {
        fd.append("files", file);
      }

      const res = await fetch("/api/diner/external-scan", {
        method: "POST",
        body: fd,
      });

      const data = (await res.json().catch(() => ({}))) as {
        scan?: SavedExternalScan;
        error?: string;
        reason?: string;
      };

      if (!res.ok || !data.scan) {
        if (res.status === 503 || data.reason === "AI_NOT_CONFIGURED") {
          setError(
            isAr
              ? "الذكاء الاصطناعي غير مفعل حالياً (AI not configured)."
              : "AI not configured — External Menu Scanner requires GEMINI_API_KEY.",
          );
        } else {
          setError(data.error || "Could not scan menu screenshot.");
        }
        setUploading(false);
        return;
      }

      setScans((prev) => [data.scan!, ...prev]);
      setSelectedScanId(data.scan.id);
      setSelectedFiles([]);
      setSourceLabel("");
    } catch {
      setError(isAr ? "خطأ في الاتصال بالشبكة." : "Network error while uploading screenshot.");
    } finally {
      setUploading(false);
    }
  }

  function renderDishCard(item: EvaluatedMenuItem) {
    return (
      <article
        key={item.dish.id}
        className="space-y-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs"
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-bold text-[var(--text-primary)]">
            {pickLocalized(item.dish.nameEn, item.dish.nameAr, locale)}
          </h3>
          <span className="font-mono text-sm font-extrabold">
            {formatAed(item.effectivePriceFils, locale)}
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {/* Always display an explicit unverified chip on external screenshots */}
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-3 w-3" />
            <span>{isAr ? "غير موثق (لقطة خارجية)" : "Unverified AI estimate"}</span>
          </span>
          {item.badges
            .filter((b) => b !== "UNVERIFIED_WARNING")
            .map((b) => renderExternalBadge(b, locale))}
        </div>

        {(item.dish.descriptionEn || item.dish.descriptionAr) && (
          <p className="text-xs text-[var(--text-secondary)]">
            {pickLocalized(item.dish.descriptionEn, item.dish.descriptionAr, locale)}
          </p>
        )}

        <p className="text-[11px] font-medium text-[var(--accent-primary)]">
          {isAr ? item.whyForYouAr : item.whyForYouEn}
        </p>
      </article>
    );
  }

  const visibleCompatible = evaluated ? [...evaluated.perfectForYou, ...evaluated.goodOptions] : [];

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
      {/* Header & Mandatory Unverified Disclaimer */}
      <header className="space-y-4 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-bold text-[var(--accent-primary)]">
              <Camera className="h-3.5 w-3.5" />
              <span>{isAr ? "فاحص القوائم الخارجية" : "External Menu Scanner"}</span>
            </span>
            <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">
              {isAr
                ? "افحص أي لقطة شاشة لتطبيق توصيل أو قائمة ورقية"
                : "Scan Any Delivery Screenshot or Paper Menu"}
            </h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {isAr
                ? "ارفع لقطة شاشة من طلبات أو ديليفرو أو كريم أو صورة قائمة ورقية لتصفيتها وترتيبها حسب ملفك الغذائي."
                : "Upload 1–4 screenshots from Talabat, Deliveroo, Careem, or a paper menu photo (or share from your phone's share sheet) to filter & rank dishes against your profile."}
            </p>
          </div>

          <Link
            href={initialProfile ? "/profile" : "/onboarding?returnTo=/external-scan"}
            className="inline-flex min-h-10 items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-4 py-2 text-xs font-bold text-[var(--accent-primary)]"
          >
            {initialProfile
              ? isAr
                ? "تعديل ملفي الغذائي"
                : "Edit Food Profile"
              : isAr
                ? "إعداد ملفي الغذائي"
                : "Set Up Food Profile"}
          </Link>
        </div>

        <div className="flex items-start gap-2.5 rounded-2xl border border-amber-500/40 bg-amber-500/15 px-4 py-3 text-xs font-bold text-amber-900 dark:text-amber-200">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {isAr
              ? "تنبيه هام: نتائج الفحص الخارجي تعتمد على تقديرات الذكاء الاصطناعي وهي غير موثقة من المطعم. يرجى دائماً تأكيد الحساسية والمكونات مباشرة مع طاقم المطعم قبل الطلب."
              : "Important safety notice: External screenshot scans use unverified AI estimates and are NEVER restaurant-verified. Always confirm allergies and ingredients directly with the restaurant before ordering."}
          </span>
        </div>
      </header>

      {/* Upload Form */}
      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-sm"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-bold text-[var(--text-primary)]">
              {isAr ? "اسم المطعم أو المصدر (اختياري)" : "Source Label (Optional)"}
            </label>
            <input
              type="text"
              value={sourceLabel}
              onChange={(e) => setSourceLabel(e.target.value)}
              placeholder={
                isAr
                  ? "مثال: لقطة شاشة طلبات — مطعم شامي"
                  : "e.g. Talabat Screenshot — Levantine Grill"
              }
              maxLength={120}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3.5 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--text-primary)]">
              {isAr
                ? "صور القائمة أو لقطات الشاشة (١-٤ صور، حد أقصى ٥ ميجابايت)"
                : "Screenshots / Menu Photos (1–4 images, max 5 MB total)"}
            </label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(e) => setSelectedFiles(Array.from(e.target.files ?? []))}
              className="mt-1.5 block w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-xs file:me-3 file:rounded-lg file:border-0 file:bg-[var(--accent-soft)] file:px-3 file:py-1.5 file:font-bold file:text-[var(--accent-primary)]"
            />
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs font-semibold text-amber-800 dark:text-amber-300">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={uploading || selectedFiles.length === 0}
          className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[var(--accent-primary)] px-6 py-2.5 text-sm font-extrabold text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          <Upload className="h-4 w-4" />
          <span>
            {uploading
              ? isAr
                ? "جاري استخراج وتصفية الأطباق..."
                : "Extracting & Filtering Dishes..."
              : isAr
                ? "فحص وتصفية القائمة"
                : "Scan & Filter Menu"}
          </span>
        </button>
      </form>

      {/* Recent Scans Selector */}
      {scans.length > 1 && (
        <section className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase text-[var(--text-secondary)]">
            <History className="h-3.5 w-3.5" />
            <span>{isAr ? "عمليات الفحص الأخيرة" : "Recent External Scans"}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {scans.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedScanId(s.id)}
                className={`min-h-9 rounded-full px-3.5 py-1.5 text-xs font-semibold ${
                  activeScan?.id === s.id
                    ? "bg-[var(--accent-primary)] text-white"
                    : "border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                }`}
              >
                {s.sourceLabel} ({s.dishes.length})
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Filtered & Ranked Results */}
      {activeScan && evaluated && (
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-extrabold">
              {activeScan.sourceLabel} —{" "}
              {isAr
                ? `${visibleCompatible.length} أطباق محتملة التوافق`
                : `${visibleCompatible.length} Potentially Compatible Dishes`}
            </h2>
          </div>

          {visibleCompatible.length === 0 ? (
            <p className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 text-sm text-[var(--text-secondary)]">
              {isAr
                ? "لم يتم العثور على أطباق متوافقة مع قيودك الصارمة في هذه اللقطة."
                : "No dishes in this screenshot passed your hard dietary restrictions."}
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">{visibleCompatible.map(renderDishCard)}</div>
          )}

          {evaluated.moreOptions.length > 0 && (
            <details className="group rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
              <summary className="flex cursor-pointer list-none items-center justify-between font-bold">
                <span>
                  {isAr
                    ? `خيارات إضافية فوق الميزانية (${evaluated.moreOptions.length})`
                    : `More Options — Over Meal Budget (${evaluated.moreOptions.length})`}
                </span>
                <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
              </summary>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {evaluated.moreOptions.map(renderDishCard)}
              </div>
            </details>
          )}

          {evaluated.hidden.length > 0 && (
            <details className="group rounded-2xl border border-red-500/25 bg-[var(--bg-surface)] p-4">
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold text-red-700 dark:text-red-300">
                <span>
                  {isAr
                    ? `مستبعدة بسبب قيودك (${evaluated.hidden.length}) — اضغط لمعرفة السبب`
                    : `Hidden due to likely conflicts (${evaluated.hidden.length}) — tap to see why`}
                </span>
                <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
              </summary>
              <ul className="mt-3 divide-y divide-[var(--border-subtle)] text-xs">
                {evaluated.hidden.map((h) => (
                  <li key={h.dish.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <span className="font-semibold">
                      {pickLocalized(h.dish.nameEn, h.dish.nameAr, locale)}
                    </span>
                    <span className="text-red-600 dark:text-red-400">
                      {(isAr ? h.hiddenReasonsAr : h.hiddenReasonsEn).join(" • ")}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}
    </div>
  );
}
