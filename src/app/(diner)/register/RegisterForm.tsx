"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Dictionary, Locale } from "@/lib/i18n/dictionaries";

export function RegisterForm({
  copy,
  signInLabel,
  locale,
  initialRole,
  prospectInvite,
  invitedRestaurantName,
  returnTo,
}: {
  copy: Dictionary["auth"];
  signInLabel: string;
  locale: Locale;
  initialRole: "DINER" | "RESTAURANT_OWNER";
  prospectInvite?: string;
  invitedRestaurantName?: string | null;
  returnTo?: string;
}) {
  const router = useRouter();
  const isAr = locale === "ar";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"DINER" | "RESTAURANT_OWNER">(initialRole);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        password,
        role: prospectInvite ? "RESTAURANT_OWNER" : role,
        locale,
        ...(prospectInvite ? { prospectInvite } : {}),
      }),
    });

    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      setError(payload.error || "Registration failed");
      setLoading(false);
      return;
    }

    const loginRes = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);

    if (!loginRes || loginRes.error) {
      router.push("/login");
      return;
    }

    const effectiveRole = prospectInvite ? "RESTAURANT_OWNER" : role;
    router.push(returnTo || (effectiveRole === "RESTAURANT_OWNER" ? "/dashboard" : "/home"));
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">{copy.registerTitle}</h1>
        <p className="mt-1.5 text-sm text-[var(--text-secondary)]">{copy.registerSubtitle}</p>

        {invitedRestaurantName && (
          <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs font-medium text-emerald-800 dark:text-emerald-200">
            {isAr
              ? `دعوة تسجيل شريك نشطة لمطعم "${invitedRestaurantName}" — سيتم إعداد حساب المطعم تلقائياً عند التسجيل.`
              : `Partner onboarding invite active for "${invitedRestaurantName}" — your restaurant workspace will be pre-configured automatically.`}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {error && (
            <div
              role="alert"
              className="rounded-xl bg-[var(--accent-soft)] px-4 py-3 text-sm font-medium text-[var(--accent-primary)]"
            >
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="register-name" className="block text-sm font-medium">
              {copy.nameLabel}
            </label>
            <input
              id="register-name"
              type="text"
              required
              minLength={2}
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full min-h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-4 py-2.5 text-sm text-[var(--text-primary)]"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="register-email" className="block text-sm font-medium">
              {copy.emailLabel}
            </label>
            <input
              id="register-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full min-h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-4 py-2.5 text-sm text-[var(--text-primary)]"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="register-password" className="block text-sm font-medium">
              {copy.passwordLabel}
            </label>
            <input
              id="register-password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full min-h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-4 py-2.5 text-sm text-[var(--text-primary)]"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="register-role" className="block text-sm font-medium">
              {copy.accountTypeLabel}
            </label>
            <select
              id="register-role"
              value={prospectInvite ? "RESTAURANT_OWNER" : role}
              disabled={Boolean(prospectInvite)}
              onChange={(e) => setRole(e.target.value as "DINER" | "RESTAURANT_OWNER")}
              className="w-full min-h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-4 py-2.5 text-sm text-[var(--text-primary)] disabled:opacity-70"
            >
              <option value="DINER">{copy.roleDiner}</option>
              <option value="RESTAURANT_OWNER">{copy.roleOwner}</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-12 rounded-xl bg-[var(--accent-primary)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-60"
          >
            {copy.submitRegister}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--text-secondary)]">
          {copy.haveAccount}{" "}
          <Link href="/login" className="font-semibold text-[var(--accent-primary)] underline">
            {signInLabel}
          </Link>
        </p>
      </div>
    </div>
  );
}
