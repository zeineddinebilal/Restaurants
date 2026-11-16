"use client";

import { Globe } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { Locale } from "@/lib/i18n/dictionaries";

export function LanguageToggle({
  currentLocale,
  switchToArabicLabel,
  switchToEnglishLabel,
}: {
  currentLocale: Locale;
  switchToArabicLabel: string;
  switchToEnglishLabel: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const nextLocale: Locale = currentLocale === "en" ? "ar" : "en";
  const label = currentLocale === "en" ? switchToArabicLabel : switchToEnglishLabel;

  async function handleSwitch() {
    await fetch("/api/locale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: nextLocale }),
    });
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleSwitch}
      disabled={isPending}
      aria-label={`Switch language to ${label}`}
      className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-muted)] disabled:opacity-60"
    >
      <Globe className="h-4 w-4 text-[var(--accent-primary)]" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
