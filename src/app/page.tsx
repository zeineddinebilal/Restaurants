import { QrCode, ShieldCheck, Sparkles, Store, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { PwaInstallBanner } from "@/components/PwaInstallBanner";
import { auth } from "@/lib/auth/config";
import { getDefaultHomeForRole } from "@/lib/auth/rbac";
import { getI18nContext } from "@/lib/i18n/server";

export default async function LandingPage() {
  const [{ dict }, session] = await Promise.all([getI18nContext(), auth()]);
  const dashboardHref = session?.user ? getDefaultHomeForRole(session.user.role) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-12 px-4 py-10 sm:px-6 sm:py-16">
      {/* PWA Install Prompt (Android Chrome + iOS Safari guidance) */}
      <PwaInstallBanner copy={dict.pwa} />

      {/* Hero Section */}
      <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-sm sm:p-12">
        <div className="max-w-3xl space-y-6">
          <span className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-soft)] px-4 py-1.5 text-xs font-semibold text-[var(--accent-primary)] sm:text-sm">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            <span>{dict.landing.badge}</span>
          </span>

          <h1 className="text-3xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-5xl sm:leading-tight">
            {dict.landing.heroTitle}
          </h1>

          <p className="text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg">
            {dict.landing.heroSubtitle}
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            {dashboardHref ? (
              <Link
                href={dashboardHref}
                className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-[var(--accent-primary)] px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-[var(--accent-hover)]"
              >
                {dict.nav.home}
              </Link>
            ) : (
              <>
                <Link
                  href="/register"
                  className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-[var(--accent-primary)] px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-[var(--accent-hover)]"
                >
                  {dict.landing.ctaGetStarted}
                </Link>
                <Link
                  href="/login"
                  className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-muted)] px-6 py-3 text-base font-semibold text-[var(--text-primary)] transition hover:opacity-90"
                >
                  {dict.landing.ctaSignIn}
                </Link>
                <Link
                  href="/for-restaurants"
                  className="inline-flex min-h-12 items-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-5 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--bg-muted)]"
                >
                  <Store className="h-4 w-4 text-[var(--accent-primary)]" aria-hidden="true" />
                  <span>{dict.landing.ctaRestaurantOwner}</span>
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* 3-Step How It Works */}
      <section aria-labelledby="how-it-works-heading" className="space-y-6">
        <h2 id="how-it-works-heading" className="text-2xl font-bold text-[var(--text-primary)]">
          {dict.landing.howItWorksTitle}
        </h2>
        <div className="grid gap-6 md:grid-cols-3">
          <article className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-xs">
            <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-primary)]">
              <ShieldCheck className="h-6 w-6" aria-hidden="true" />
            </div>
            <h3 className="text-lg font-bold text-[var(--text-primary)]">
              {dict.landing.step1Title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
              {dict.landing.step1Body}
            </p>
          </article>

          <article className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-xs">
            <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-primary)]">
              <QrCode className="h-6 w-6" aria-hidden="true" />
            </div>
            <h3 className="text-lg font-bold text-[var(--text-primary)]">
              {dict.landing.step2Title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
              {dict.landing.step2Body}
            </p>
          </article>

          <article className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-xs">
            <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-primary)]">
              <Users className="h-6 w-6" aria-hidden="true" />
            </div>
            <h3 className="text-lg font-bold text-[var(--text-primary)]">
              {dict.landing.step3Title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
              {dict.landing.step3Body}
            </p>
          </article>
        </div>
      </section>

      {/* Safety & Pricing Guarantees */}
      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-muted)] p-6">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-5 w-5 text-[var(--accent-primary)]" aria-hidden="true" />
            <h2 className="text-lg font-bold text-[var(--text-primary)]">
              {dict.landing.safetyBannerTitle}
            </h2>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
            {dict.landing.safetyBannerBody}
          </p>
          <p className="mt-3 text-xs font-semibold text-[var(--accent-primary)]">
            {dict.safetyDisclaimer}
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-muted)] p-6">
          <div className="flex items-center gap-2.5">
            <Wallet className="h-5 w-5 text-[var(--accent-primary)]" aria-hidden="true" />
            <h2 className="text-lg font-bold text-[var(--text-primary)]">
              {dict.landing.pricingBannerTitle}
            </h2>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
            {dict.landing.pricingBannerBody}
          </p>
        </div>
      </section>
    </div>
  );
}
