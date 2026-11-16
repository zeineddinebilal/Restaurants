import Link from "next/link";
import { redirect } from "next/navigation";
import { PrintSheetButton } from "@/app/(restaurant)/dashboard/tables/print/PrintSheetButton";
import { requirePageRole } from "@/lib/auth/rbac";
import { getI18nContext } from "@/lib/i18n/server";
import { normalizeAllergenList } from "@/lib/menu/taxonomy";
import { loadManagedRestaurants } from "@/lib/restaurant/loader";

/**
 * The 14 standard statutory major allergen columns for restaurant allergen matrices.
 * Note: `crustaceans` also flags legacy `shellfish` tags so no seafood allergen is ever missed.
 */
const MATRIX_14_ALLERGENS = [
  { key: "milk", match: ["milk"], en: "Milk", ar: "حليب" },
  { key: "gluten", match: ["gluten"], en: "Gluten", ar: "غلوتين" },
  { key: "tree_nuts", match: ["tree_nuts"], en: "Tree Nuts", ar: "مكسرات" },
  { key: "peanuts", match: ["peanuts"], en: "Peanuts", ar: "فول سوداني" },
  { key: "sesame", match: ["sesame"], en: "Sesame", ar: "سمسم" },
  { key: "eggs", match: ["eggs"], en: "Eggs", ar: "بيض" },
  { key: "fish", match: ["fish"], en: "Fish", ar: "سمك" },
  { key: "crustaceans", match: ["crustaceans", "shellfish"], en: "Crustaceans", ar: "قشريات" },
  { key: "molluscs", match: ["molluscs"], en: "Molluscs", ar: "رخويات" },
  { key: "soy", match: ["soy"], en: "Soy", ar: "صويا" },
  { key: "celery", match: ["celery"], en: "Celery", ar: "كرفس" },
  { key: "mustard", match: ["mustard"], en: "Mustard", ar: "خردل" },
  { key: "lupin", match: ["lupin"], en: "Lupin", ar: "ترمس" },
  { key: "sulphites", match: ["sulphites"], en: "Sulphites", ar: "كبريتيت" },
] as const;

export default async function PrintableAllergenMatrixPage({
  searchParams,
}: {
  searchParams: Promise<{ restaurantId?: string }>;
}) {
  const [user, { locale }, sp] = await Promise.all([
    requirePageRole(["RESTAURANT_OWNER", "ADMIN"]),
    getI18nContext(),
    searchParams,
  ]);
  const isAr = locale === "ar";

  const { restaurants, activeRestaurant } = await loadManagedRestaurants(user, sp.restaurantId);
  if (!activeRestaurant) {
    redirect("/dashboard");
  }

  const generatedDate = new Intl.DateTimeFormat(isAr ? "ar-AE" : "en-AE", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  const publishedRows = activeRestaurant.categories.flatMap((cat) =>
    cat.items
      .filter((item) => item.isPublished)
      .map((item) => ({
        id: item.id,
        categoryEn: cat.nameEn,
        categoryAr: cat.nameAr,
        nameEn: item.nameEn,
        nameAr: item.nameAr,
        caloriesKcal: item.caloriesKcal,
        allergenSet: new Set<string>(normalizeAllergenList(item.allergens)),
        allergenDataProvided: item.allergenDataProvided,
        verificationStatus: item.verificationStatus,
        verifiedByName: item.verifiedBy?.name ?? item.verifiedBy?.email ?? null,
        verifiedAtStr: item.verifiedAt
          ? new Intl.DateTimeFormat(isAr ? "ar-AE" : "en-AE", {
              timeZone: "Asia/Dubai",
              year: "numeric",
              month: "short",
              day: "2-digit",
            }).format(item.verifiedAt)
          : null,
      })),
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 print:max-w-none print:p-0">
      {/* Screen-only toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/dashboard/menu?restaurantId=${encodeURIComponent(activeRestaurant.id)}`}
            className="text-sm font-semibold text-[var(--accent-primary)] underline"
          >
            {isAr ? "→ العودة لمنشئ القائمة" : "← Back to Menu Builder"}
          </Link>

          {restaurants.length > 1 &&
            restaurants.map((r) => (
              <Link
                key={r.id}
                href={`/dashboard/allergen-matrix?restaurantId=${encodeURIComponent(r.id)}`}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  r.id === activeRestaurant.id
                    ? "bg-[var(--accent-primary)] text-white"
                    : "border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
                }`}
              >
                {isAr ? r.nameAr : r.nameEn}
              </Link>
            ))}
        </div>

        <PrintSheetButton
          label={isAr ? "طباعة أو حفظ كملف PDF" : "Print / Save Allergen Matrix PDF"}
        />
      </div>

      {/* Printable Matrix Sheet */}
      <section className="rounded-3xl border border-[var(--border-subtle)] bg-white p-6 text-[#1f1916] shadow-sm print:rounded-none print:border-0 print:p-4 print:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-[#1f1916] pb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[#d9532f]">
              {isAr ? "جدول توثيق مسببات الحساسية" : "Allergen Documentation Matrix"}
            </p>
            <h1 className="mt-1 text-2xl font-extrabold">
              {activeRestaurant.nameEn} • <span dir="rtl">{activeRestaurant.nameAr}</span>
            </h1>
            <p className="mt-1 text-xs text-neutral-600">
              {isAr
                ? "يساعدك هذا الجدول على إبقاء معلومات مسببات الحساسية موثقة ومتسقة عبر القوائم المطبوعة والرقمية والتوصيل."
                : "Helps you keep allergen information documented and consistent across print, QR, and delivery menus."}
            </p>
          </div>

          <div className="space-y-1 text-xs sm:text-end">
            <p>
              <strong>{isAr ? "تاريخ الإصدار:" : "Date generated:"}</strong> {generatedDate}
            </p>
            <p>
              <strong>
                {isAr
                  ? "المسؤول عن معلومات مسببات الحساسية:"
                  : "Person in charge of allergen information:"}
              </strong>{" "}
              {activeRestaurant.allergenPersonInCharge || (isAr ? "غير محدد" : "Not specified")}
            </p>
            <p className="font-semibold text-neutral-700">
              {isAr
                ? `عدد الأطباق المنشورة: ${publishedRows.length}`
                : `Published dishes: ${publishedRows.length}`}
            </p>
          </div>
        </div>

        {publishedRows.length === 0 ? (
          <p className="py-10 text-center text-sm text-neutral-600">
            {isAr
              ? "لا توجد أطباق منشورة حالياً. قم بنشر الأطباق من منشئ القائمة لعرضها في الجدول."
              : "No published dishes yet. Publish dishes in the Menu Builder to populate this matrix."}
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto print:overflow-visible">
            <table className="w-full border-collapse text-[11px] print:text-[9px]">
              <thead>
                <tr className="border-b-2 border-[#1f1916] bg-neutral-100 text-neutral-900">
                  <th className="border border-neutral-300 px-2 py-2 text-start font-bold print:px-1 print:py-1">
                    {isAr ? "الطبق" : "Dish"}
                  </th>
                  <th className="border border-neutral-300 px-1.5 py-2 text-center font-bold print:px-1 print:py-1">
                    {isAr ? "سعرات" : "kcal"}
                  </th>
                  {MATRIX_14_ALLERGENS.map((alg) => (
                    <th
                      key={alg.key}
                      className="border border-neutral-300 px-1 py-2 text-center font-bold print:px-0.5 print:py-1"
                    >
                      <div>{isAr ? alg.ar : alg.en}</div>
                      <div
                        className="text-[10px] font-medium text-neutral-600 print:text-[8px]"
                        dir={isAr ? "ltr" : "rtl"}
                      >
                        {isAr ? alg.en : alg.ar}
                      </div>
                    </th>
                  ))}
                  <th className="border border-neutral-300 px-2 py-2 text-start font-bold print:px-1 print:py-1">
                    {isAr ? "حالة التوثيق" : "Verification"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {publishedRows.map((row) => (
                  <tr key={row.id} className="break-inside-avoid border-b border-neutral-200">
                    <td className="border border-neutral-300 px-2 py-1.5 print:px-1 print:py-1">
                      <div className="font-bold text-neutral-900">
                        {isAr ? row.nameAr : row.nameEn}
                      </div>
                      <div
                        className="text-[10px] text-neutral-600 print:text-[8px]"
                        dir={isAr ? "ltr" : "rtl"}
                      >
                        {isAr ? row.nameEn : row.nameAr}
                      </div>
                      <div className="text-[10px] text-neutral-500 print:text-[8px]">
                        {isAr ? row.categoryAr : row.categoryEn}
                      </div>
                    </td>
                    <td className="border border-neutral-300 px-1.5 py-1.5 text-center font-mono text-neutral-700 print:px-1 print:py-1">
                      {row.caloriesKcal != null ? row.caloriesKcal : "—"}
                    </td>
                    {MATRIX_14_ALLERGENS.map((alg) => {
                      const hasAllergen = alg.match.some((m) => row.allergenSet.has(m));
                      return (
                        <td
                          key={alg.key}
                          className={`border border-neutral-300 px-1 py-1.5 text-center font-bold print:px-0.5 print:py-1 ${
                            hasAllergen
                              ? "bg-amber-100 text-amber-950"
                              : !row.allergenDataProvided
                                ? "bg-neutral-50 text-neutral-400"
                                : "text-neutral-300"
                          }`}
                        >
                          {hasAllergen ? "●" : !row.allergenDataProvided ? "?" : "—"}
                        </td>
                      );
                    })}
                    <td className="border border-neutral-300 px-2 py-1.5 print:px-1 print:py-1">
                      {row.verificationStatus === "RESTAURANT_VERIFIED" ? (
                        <div>
                          <span className="font-bold text-emerald-800">
                            {isAr ? "موثّق من المطعم ✓" : "Verified ✓"}
                          </span>
                          {(row.verifiedByName || row.verifiedAtStr) && (
                            <div className="text-[10px] text-neutral-600">
                              {row.verifiedByName ?? ""}
                              {row.verifiedByName && row.verifiedAtStr ? " • " : ""}
                              {row.verifiedAtStr ?? ""}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="font-semibold text-amber-800">
                          {isAr ? "اقتراح ذكاء اصطناعي (غير موثق)" : "AI Suggested (Unverified)"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-300 pt-3 text-xs text-neutral-700">
          <p className="font-semibold">
            Prepared from information confirmed by the restaurant. •{" "}
            <span dir="rtl">أُعدّ هذا الجدول بناءً على المعلومات المؤكدة من قِبل المطعم.</span>
          </p>
          <p className="text-[11px] text-neutral-500">
            ● = {isAr ? "يحتوي على مسبب الحساسية" : "Contains allergen"} | ? ={" "}
            {isAr ? "بيانات غير مدخلة" : "Data not provided"}
          </p>
        </div>
      </section>
    </div>
  );
}
