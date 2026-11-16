"use client";

import Link from "next/link";

export default function GlobalErrorBoundary({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <div className="space-y-4 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-8 shadow-sm">
        <h1 className="text-2xl font-extrabold text-[var(--text-primary)]">
          Something went wrong • <span dir="rtl">حدث خطأ غير متوقع</span>
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Please try refreshing this page or return to the home screen.
        </p>
        <p className="text-sm text-[var(--text-secondary)]" dir="rtl">
          يرجى إعادة المحاولة أو العودة إلى الصفحة الرئيسية.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex min-h-11 items-center rounded-xl bg-[var(--accent-primary)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--accent-hover)]"
          >
            Try again • إعادة المحاولة
          </button>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-5 py-2.5 text-sm font-semibold text-[var(--text-primary)]"
          >
            Home • الرئيسية
          </Link>
        </div>
      </div>
    </div>
  );
}
