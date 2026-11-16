import type { Role } from "@prisma/client";
import { UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import { getBrandName } from "@/config/brand";
import { LanguageToggle } from "@/components/LanguageToggle";
import { SignOutButton } from "@/components/SignOutButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { Dictionary, Locale } from "@/lib/i18n/dictionaries";

export function Navbar({
  locale,
  dict,
  user,
}: {
  locale: Locale;
  dict: Dictionary;
  user?: {
    name?: string | null;
    role: Role;
  } | null;
}) {
  const brandName = getBrandName(locale);

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)]/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-2.5 text-lg font-bold tracking-tight text-[var(--text-primary)]"
        >
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-primary)] text-white shadow-sm">
            <UtensilsCrossed className="h-5 w-5" aria-hidden="true" />
          </span>
          <span>{brandName}</span>
        </Link>

        <nav aria-label="Primary" className="flex flex-wrap items-center gap-2">
          {!user && (
            <Link
              href="/for-restaurants"
              className="inline-flex min-h-10 items-center rounded-full px-3.5 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-muted)]"
            >
              {locale === "ar" ? "للمطاعم" : "For Restaurants"}
            </Link>
          )}

          {user?.role === "DINER" && (
            <Link
              href="/home"
              className="inline-flex min-h-10 items-center rounded-full px-3.5 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-muted)]"
            >
              {dict.nav.home}
            </Link>
          )}

          {(user?.role === "RESTAURANT_OWNER" || user?.role === "ADMIN") && (
            <Link
              href="/dashboard"
              className="inline-flex min-h-10 items-center rounded-full px-3.5 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-muted)]"
            >
              {dict.nav.restaurantDashboard}
            </Link>
          )}

          {(user?.role === "RESTAURANT_STAFF" || user?.role === "RESTAURANT_OWNER") && (
            <Link
              href="/dashboard/orders"
              className="inline-flex min-h-10 items-center rounded-full px-3.5 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-muted)]"
            >
              {dict.nav.staffOrders}
            </Link>
          )}

          {user?.role === "ADMIN" && (
            <Link
              href="/admin"
              className="inline-flex min-h-10 items-center rounded-full px-3.5 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-muted)]"
            >
              {dict.nav.adminPortal}
            </Link>
          )}

          <LanguageToggle
            currentLocale={locale}
            switchToArabicLabel={dict.nav.switchToArabic}
            switchToEnglishLabel={dict.nav.switchToEnglish}
          />
          <ThemeToggle label={dict.nav.darkMode} />

          {user ? (
            <SignOutButton label={dict.nav.signOut} />
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="inline-flex min-h-10 items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-muted)]"
              >
                {dict.nav.signIn}
              </Link>
              <Link
                href="/register"
                className="inline-flex min-h-10 items-center rounded-full bg-[var(--accent-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-hover)]"
              >
                {dict.nav.signUp}
              </Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
