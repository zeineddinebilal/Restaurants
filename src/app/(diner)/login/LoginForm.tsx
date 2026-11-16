"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Dictionary } from "@/lib/i18n/dictionaries";

export function LoginForm({
  copy,
  signUpLabel,
  googleEnabled,
}: {
  copy: Dictionary["auth"];
  signUpLabel: string;
  googleEnabled: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);
    if (!res || res.error) {
      setError(copy.invalidCredentials);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">{copy.loginTitle}</h1>
        <p className="mt-1.5 text-sm text-[var(--text-secondary)]">{copy.loginSubtitle}</p>

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
            <label htmlFor="login-email" className="block text-sm font-medium">
              {copy.emailLabel}
            </label>
            <input
              id="login-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full min-h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-4 py-2.5 text-sm text-[var(--text-primary)]"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="login-password" className="block text-sm font-medium">
              {copy.passwordLabel}
            </label>
            <input
              id="login-password"
              type="password"
              required
              minLength={8}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full min-h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-4 py-2.5 text-sm text-[var(--text-primary)]"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-12 rounded-xl bg-[var(--accent-primary)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-60"
          >
            {copy.submitLogin}
          </button>
        </form>

        {googleEnabled && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => signIn("google", { callbackUrl: "/" })}
              className="w-full min-h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)] px-5 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition hover:opacity-90"
            >
              {copy.googleSignIn}
            </button>
          </div>
        )}

        <p className="mt-6 text-center text-sm text-[var(--text-secondary)]">
          {copy.noAccount}{" "}
          <Link href="/register" className="font-semibold text-[var(--accent-primary)] underline">
            {signUpLabel}
          </Link>
        </p>
      </div>
    </div>
  );
}
