import { AlertTriangle, ArrowLeft, CheckCircle2, ShieldAlert } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getActiveDinerProfile } from "@/lib/diner/profile";
import { evaluatePersonalizedMenu } from "@/lib/engine/menu-engine";
import { pickLocalized } from "@/lib/i18n/dictionaries";
import { getI18nContext } from "@/lib/i18n/server";
import {
  ALLERGEN_LABELS,
  type CanonicalAllergen,
  DIET_TAG_LABELS,
  type CanonicalDietTag,
} from "@/lib/menu/taxonomy";
import { aedToFils, formatAed } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function DishDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantSlug: string; dishId: string }>;
  searchParams: Promise<{ table?: string }>;
}) {
  const [{ restaurantSlug, dishId }, sp, { locale, dict }, { profile }] = await Promise.all([
    params,
    searchParams,
    getI18nContext(),
    getActiveDinerProfile(),
  ]);

  const dish = await prisma.menuItem.findFirst({
    where: {
      id: dishId,
      isPublished: true,
      restaurant: { slug: restaurantSlug, status: "APPROVED" },
    },
    include: {
      restaurant: {
        select: {
          slug: true,
          nameEn: true,
          nameAr: true,
          tables: { where: { isActive: true }, orderBy: { tableCode: "asc" }, take: 1 },
        },
      },
      category: { select: { nameEn: true, nameAr: true } },
      modifiers: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!dish) {
    notFound();
  }

  const isAr = locale === "ar";
  const backTableCode = sp.table || dish.restaurant.tables[0]?.tableCode || "T1";
  const backHref = `/r/${dish.restaurant.slug}/t/${encodeURIComponent(backTableCode)}`;

  const evaluation = evaluatePersonalizedMenu({
    dishes: [
      {
        id: dish.id,
        categoryId: dish.categoryId,
        nameEn: dish.nameEn,
        nameAr: dish.nameAr,
        descriptionEn: dish.descriptionEn,
        descriptionAr: dish.descriptionAr,
        priceAed: dish.priceAed.toFixed(2),
        portionSize: dish.portionSize,
        ingredientsEn: dish.ingredientsEn,
        ingredientsAr: dish.ingredientsAr,
        removableIngredients: dish.removableIngredients,
        removableIngredientsVerified: dish.removableIngredientsVerified,
        dietTags: dish.dietTags,
        allergens: dish.allergens,
        allergenDataProvided: dish.allergenDataProvided,
        spiceLevel: dish.spiceLevel,
        meatType: dish.meatType,
        verificationStatus: dish.verificationStatus,
        isAvailable: dish.isAvailable,
        isPopular: dish.isPopular,
        isPublished: dish.isPublished,
        cachedBlurbEn: dish.cachedBlurbEn,
        cachedBlurbAr: dish.cachedBlurbAr,
        imageUrl: dish.imageUrl,
        modifiers: dish.modifiers.map((m) => ({
          id: m.id,
          nameEn: m.nameEn,
          nameAr: m.nameAr,
          priceDeltaAed: m.priceDeltaAed.toFixed(2),
          removesAllergens: m.removesAllergens,
          addsDietTags: m.addsDietTags,
          verificationStatus: m.verificationStatus,
        })),
      },
    ],
    profile: profile ?? { dietaryRestrictions: [], allergens: [] },
  });

  const evaluatedItem = [
    ...evaluation.perfectForYou,
    ...evaluation.goodOptions,
    ...evaluation.moreOptions,
  ][0];
  const hiddenItem = evaluation.hidden[0];
  const isVerifiedDish =
    dish.allergenDataProvided && dish.verificationStatus === "RESTAURANT_VERIFIED";

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:px-6">
      <Link
        href={backHref}
        className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-[var(--accent-primary)] hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>
          {isAr ? "العودة لقائمة الطاولة" : "Back to Personalized Menu"} (
          {pickLocalized(dish.restaurant.nameEn, dish.restaurant.nameAr, locale)})
        </span>
      </Link>

      <article className="overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-sm">
        {dish.imageUrl && (
          <div className="relative h-56 w-full bg-[var(--bg-muted)]">
            <Image
              src={dish.imageUrl}
              alt={pickLocalized(dish.nameEn, dish.nameAr, locale)}
              fill
              className="object-cover"
              unoptimized
            />
          </div>
        )}

        <div className="space-y-6 p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--accent-primary)]">
                {pickLocalized(dish.category.nameEn, dish.category.nameAr, locale)}
              </p>
              <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">
                {pickLocalized(dish.nameEn, dish.nameAr, locale)}
              </h1>
              {(dish.portionSize || dish.caloriesKcal != null) && (
                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                  {[
                    dish.portionSize,
                    dish.caloriesKcal != null
                      ? isAr
                        ? `${dish.caloriesKcal} سعرة حرارية`
                        : `${dish.caloriesKcal} kcal`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" • ")}
                </p>
              )}
            </div>

            <div className="rounded-2xl bg-[var(--bg-muted)] px-4 py-2 font-mono text-lg font-extrabold">
              {formatAed(aedToFils(dish.priceAed.toFixed(2)), locale)}
            </div>
          </div>

          {/* Safety Banner when hidden or unverified for restricted diner */}
          {hiddenItem && (
            <div className="rounded-2xl bg-red-500/15 p-4 text-sm font-semibold text-red-700 dark:text-red-300">
              {isAr ? "هذا الطبق مخفي من قائمتك المخصصة:" : "Filtered out for your restrictions:"}{" "}
              {(isAr ? hiddenItem.hiddenReasonsAr : hiddenItem.hiddenReasonsEn).join(" • ")}
            </div>
          )}

          {evaluatedItem && evaluation.hasHardRestrictions && !isVerifiedDish && (
            <div className="flex items-center gap-2 rounded-2xl bg-amber-500/20 p-4 text-sm font-bold text-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <span>{isAr ? "غير موثق — اسأل النادل" : "Not verified — ask your server"}</span>
            </div>
          )}

          {evaluatedItem && (
            <div className="rounded-2xl bg-[var(--accent-soft)] px-4 py-3 text-xs font-semibold text-[var(--accent-primary)]">
              <strong>{isAr ? "لماذا يناسبك:" : "Why it's for you:"}</strong>{" "}
              {isAr ? evaluatedItem.whyForYouAr : evaluatedItem.whyForYouEn}
            </div>
          )}

          <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
            {pickLocalized(dish.descriptionEn, dish.descriptionAr, locale)}
          </p>

          {/* Ingredients */}
          {(dish.ingredientsEn.length > 0 || dish.ingredientsAr.length > 0) && (
            <div className="space-y-2">
              <h2 className="text-sm font-bold">{isAr ? "المكونات" : "Ingredients"}</h2>
              <div className="flex flex-wrap gap-1.5">
                {(isAr && dish.ingredientsAr.length > 0
                  ? dish.ingredientsAr
                  : dish.ingredientsEn
                ).map((ing) => (
                  <span
                    key={ing}
                    className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-1 text-xs"
                  >
                    {ing}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Allergens & Verification Status */}
          <div className="space-y-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold">
                {isAr ? "مسببات الحساسية والأنظمة الغذائية" : "Allergens & Dietary Tags"}
              </h2>
              {isVerifiedDish ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>{isAr ? "موثق من المطعم" : "Restaurant Verified"}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>{isAr ? "غير موثق بعد" : "Unverified"}</span>
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5 pt-1">
              {dish.dietTags.map((dt) => (
                <span
                  key={dt}
                  className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300"
                >
                  {DIET_TAG_LABELS[dt as CanonicalDietTag]?.[locale] ?? dt}
                </span>
              ))}
              {dish.allergens.length > 0 ? (
                dish.allergens.map((alg) => (
                  <span
                    key={alg}
                    className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-semibold text-red-700 dark:text-red-300"
                  >
                    {ALLERGEN_LABELS[alg as CanonicalAllergen]?.[locale] ?? alg}
                  </span>
                ))
              ) : dish.allergenDataProvided ? (
                <span className="text-xs text-[var(--text-secondary)]">
                  {isAr
                    ? "لا يحتوي على أي من مسببات الحساسية الـ ١٤ الرئيسية."
                    : "Confirmed free of the 14 major allergens."}
                </span>
              ) : (
                <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                  {isAr
                    ? "بيانات الحساسية غير مؤكدة — يرجى سؤال النادل."
                    : "Allergen information not yet confirmed — please ask your server."}
                </span>
              )}
            </div>
          </div>

          {/* Modifiers */}
          {dish.modifiers.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-bold">
                {isAr ? "التعديلات المتاحة" : "Available Modifiers"}
              </h2>
              <ul className="space-y-2">
                {dish.modifiers.map((mod) => {
                  const isPreselected = evaluatedItem?.preselectedModifierIds.includes(mod.id);
                  const deltaFils = aedToFils(mod.priceDeltaAed.toFixed(2));
                  return (
                    <li
                      key={mod.id}
                      className={`flex items-center justify-between gap-3 rounded-2xl border p-3.5 text-xs ${
                        isPreselected
                          ? "border-emerald-600 bg-emerald-500/10"
                          : "border-[var(--border-subtle)] bg-[var(--bg-canvas)]"
                      }`}
                    >
                      <div>
                        <p className="font-bold">
                          {pickLocalized(mod.nameEn, mod.nameAr, locale)}
                          {isPreselected && (
                            <span className="ms-2 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] text-white">
                              {isAr ? "مختار لسلامتك" : "Pre-selected for you"}
                            </span>
                          )}
                        </p>
                        {mod.removesAllergens.length > 0 && (
                          <p className="mt-0.5 text-[var(--text-secondary)]">
                            Removes: {mod.removesAllergens.join(", ")} (
                            {mod.verificationStatus === "RESTAURANT_VERIFIED"
                              ? "Verified"
                              : "Unverified"}
                            )
                          </p>
                        )}
                      </div>
                      <span className="font-mono font-bold">
                        {deltaFils === 0
                          ? isAr
                            ? "مجاناً"
                            : "Free"
                          : `${deltaFils > 0 ? "+" : ""}${formatAed(deltaFils, locale)}`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="flex items-center gap-2 rounded-2xl bg-[var(--bg-muted)] px-4 py-3 text-xs font-semibold text-[var(--text-secondary)]">
            <ShieldAlert className="h-4 w-4 text-[var(--accent-primary)] shrink-0" />
            <span>{dict.safetyDisclaimer}</span>
          </div>
        </div>
      </article>
    </div>
  );
}
