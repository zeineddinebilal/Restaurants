import Link from "next/link";
import { getI18nContext } from "@/lib/i18n/server";

export default async function NotFoundPage() {
  const { locale } = await getI18nContext();
  const isAr = locale === "ar";

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <div className="space-y-4 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-8 shadow-sm">
        <p className="font-mono text-sm font-bold text-[var(--accent-primary)]">404</p>
        <h1 className="text-2xl font-extrabold text-[var(--text-primary)]">
          {isAr ? "الصفحة غير موجودة" : "Page not found"}
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          {isAr
            ? "الرابط الذي تبحث عنه غير متوفر أو تم نقله."
            : "The page or table link you requested could not be found."}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            href="/home"
            className="inline-flex min-h-11 items-center rounded-xl bg-[var(--accent-primary)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--accent-hover)]"
          >
            {isAr ? "صفحة الضيف الرئيسية" : "Diner Home"}
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-5 py-2.5 text-sm font-semibold text-[var(--text-primary)]"
          >
            {isAr ? "الصفحة الرئيسية" : "Landing Page"}
          </Link>
        </div>
      </div>
    </div>
  );
}
