import { Camera, MapPin, QrCode, SlidersHorizontal, Utensils } from "lucide-react";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getActiveDinerProfile } from "@/lib/diner/profile";
import { pickLocalized } from "@/lib/i18n/dictionaries";
import { getI18nContext } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function DinerHomePage() {
  const [{ locale }, { profile }, approvedRestaurants] = await Promise.all([
    getI18nContext(),
    getActiveDinerProfile(),
    prisma.restaurant.findMany({
      where: { status: "APPROVED" },
      orderBy: [{ isDemo: "desc" }, { createdAt: "desc" }],
      include: {
        branches: { where: { isActive: true } },
        tables: { where: { isActive: true }, orderBy: { tableCode: "asc" }, take: 1 },
        _count: {
          select: {
            menuItems: { where: { isPublished: true, isAvailable: true } },
          },
        },
      },
    }),
  ]);

  const isAr = locale === "ar";

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
      {/* Big Action Cards: Scan Table QR + Edit Profile */}
      <section className="grid gap-4 md:grid-cols-2">
        <Link
          href="/scan"
          className="flex flex-col justify-between rounded-3xl bg-[var(--accent-primary)] p-6 text-white shadow-sm transition hover:bg-[var(--accent-hover)]"
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20">
              <QrCode className="h-7 w-7" />
            </span>
            <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">
              {isAr ? "الكاميرا المباشرة" : "Instant Camera"}
            </span>
          </div>
          <div className="mt-6">
            <h1 className="text-2xl font-extrabold">
              {isAr ? "امسح رمز QR على الطاولة" : "Scan Table QR Code"}
            </h1>
            <p className="mt-1 text-sm text-white/90">
              {isAr
                ? "افتح قائمة المطعم المصفاة والمرتبة خصيصاً لك فوراً."
                : "Open your table's personalized, allergen-filtered menu in one tap."}
            </p>
          </div>
        </Link>

        <div className="flex flex-col justify-between rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-sm">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                {isAr ? "ملفك الغذائي النشط" : "Active Food Profile"}
              </span>
              <Link
                href={profile ? "/profile" : "/onboarding"}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[var(--border-subtle)] px-3 py-1 text-xs font-semibold text-[var(--accent-primary)]"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span>{profile ? (isAr ? "تعديل" : "Edit") : isAr ? "إعداد" : "Set Up"}</span>
              </Link>
            </div>

            {profile ? (
              <div className="mt-3 space-y-2">
                <p className="text-lg font-bold">{profile.displayName}</p>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {profile.dietaryRestrictions.map((d) => (
                    <span
                      key={d}
                      className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 font-semibold text-emerald-700 dark:text-emerald-300"
                    >
                      {d}
                    </span>
                  ))}
                  {profile.allergens.map((a) => (
                    <span
                      key={a}
                      className="rounded-full bg-red-500/15 px-2.5 py-0.5 font-semibold text-red-700 dark:text-red-300"
                    >
                      No {a}
                    </span>
                  ))}
                  {profile.maxBudgetAed && (
                    <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 font-mono font-semibold text-[var(--accent-primary)]">
                      Meal Budget: AED {profile.maxBudgetAed}
                    </span>
                  )}
                  {profile.dietaryRestrictions.length === 0 &&
                    profile.allergens.length === 0 &&
                    !profile.maxBudgetAed && (
                      <span className="text-[var(--text-secondary)]">
                        {isAr ? "لا توجد قيود محددة بعد" : "No hard restrictions set"}
                      </span>
                    )}
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-[var(--text-secondary)]">
                {isAr
                  ? "لم تقم بإعداد ملفك بعد. أنشئ ملفك في ٣٠ ثانية لتصفية القوائم تلقائياً."
                  : "Set your allergies, diet, and AED meal budget in 30 seconds."}
              </p>
            )}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href={profile ? "/profile" : "/onboarding"}
              className="inline-flex min-h-10 items-center rounded-xl bg-[var(--bg-muted)] px-4 py-2 text-xs font-semibold text-[var(--text-primary)]"
            >
              {profile
                ? isAr
                  ? "تعديل الحساسية والميزانية"
                  : "Customize Restrictions & Budget"
                : isAr
                  ? "ابدأ إعداد ملفك"
                  : "Build Food Profile"}
            </Link>
            <Link
              href="/external-scan"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] px-4 py-2 text-xs font-semibold text-[var(--text-primary)]"
            >
              <Camera className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
              <span>{isAr ? "فحص أي قائمة خارجية" : "Scan Any Menu Photo"}</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Participating UAE Restaurants */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-[var(--text-primary)]">
          {isAr ? "المطاعم المشاركة في الإمارات" : "Participating UAE Restaurants"}
        </h2>

        {approvedRestaurants.length === 0 ? (
          <p className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 text-sm text-[var(--text-secondary)]">
            {isAr ? "لا توجد مطاعم معتمدة حالياً." : "No approved restaurants published yet."}
          </p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            {approvedRestaurants.map((r) => {
              const firstTable = r.tables[0]?.tableCode ?? "T1";
              const cities = Array.from(new Set(r.branches.map((b) => b.city))).join(" • ");

              return (
                <article
                  key={r.id}
                  className="flex flex-col justify-between rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-sm"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-soft)] px-3 py-0.5 text-xs font-semibold text-[var(--accent-primary)]">
                        <Utensils className="h-3 w-3" />
                        <span>{r.cuisine}</span>
                      </span>
                      <span className="text-xs text-[var(--text-secondary)]">
                        {r._count.menuItems} {isAr ? "طبق" : "dishes"}
                      </span>
                    </div>

                    <h3 className="text-xl font-bold">
                      {pickLocalized(r.nameEn, r.nameAr, locale)}
                    </h3>
                    <p className="text-sm text-[var(--text-secondary)]">
                      {pickLocalized(r.descriptionEn, r.descriptionAr, locale)}
                    </p>
                    {cities && (
                      <p className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                        <MapPin className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
                        <span>{cities}</span>
                      </p>
                    )}
                  </div>

                  <div className="mt-5">
                    <Link
                      href={`/r/${r.slug}/t/${firstTable}`}
                      className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-[var(--accent-primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)]"
                    >
                      {isAr
                        ? `عرض القائمة المخصصة (${firstTable})`
                        : `Open Personalized Menu (${firstTable})`}
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
