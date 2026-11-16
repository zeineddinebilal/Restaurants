"use client";

import { UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Locale } from "@/lib/i18n/dictionaries";

export function JoinCompanionClient({
  locale,
  isAuthenticated,
  code,
  inviterName,
}: {
  locale: Locale;
  isAuthenticated: boolean;
  code: string;
  inviterName: string | null;
}) {
  const router = useRouter();
  const isAr = locale === "ar";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const returnTo = `/companions/join?code=${encodeURIComponent(code)}`;

  async function handleAccept() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/diner/companions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "accept", code }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);

    if (!res.ok) {
      setError(data.error || "Could not accept invite");
      return;
    }

    router.push("/home");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-12 sm:px-6">
      <div className="space-y-5 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 text-center shadow-sm sm:p-8">
        <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-primary)]">
          <UserPlus className="h-6 w-6" />
        </span>

        <div>
          <h1 className="text-2xl font-extrabold">
            {inviterName
              ? isAr
                ? `دعوة رفيق طعام من ${inviterName}`
                : `Dining Companion Invite from ${inviterName}`
              : isAr
                ? "دعوة رفيق طعام"
                : "Dining Companion Invite"}
          </h1>
          <p className="mt-2 font-mono text-sm font-bold text-[var(--accent-primary)]">
            {code || "—"}
          </p>
          <p className="mt-2 text-xs text-[var(--text-secondary)]">
            {isAr
              ? "عند القبول سيظهر كل منكما في قائمة «تناول الطعام مع…» لتخطيط الوجبات المشتركة دون كشف تفاصيل ملفك الخاصة."
              : "Accepting adds both of you to each other's 'Dine with…' list so you can plan meals together (your individual restrictions remain private by default)."}
          </p>
        </div>

        {error && (
          <div className="rounded-2xl bg-red-500/10 px-4 py-2.5 text-xs font-bold text-red-600">
            {error}
          </div>
        )}

        {!inviterName ? (
          <p className="text-xs font-bold text-amber-700">
            {isAr
              ? "رمز الدعوة غير صالح أو منتهي الصلاحية."
              : "This invite code is invalid or expired."}
          </p>
        ) : !isAuthenticated ? (
          <div className="space-y-2 pt-2">
            <Link
              href={`/register?returnTo=${encodeURIComponent(returnTo)}`}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-[var(--accent-primary)] px-6 py-2.5 text-sm font-extrabold text-white"
            >
              {isAr ? "إنشاء حساب سريع وقبول الدعوة" : "Create Quick Account to Accept"}
            </Link>
            <Link
              href={`/login?returnTo=${encodeURIComponent(returnTo)}`}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-6 py-2.5 text-sm font-bold"
            >
              {isAr ? "تسجيل الدخول للقبول" : "Sign In to Accept"}
            </Link>
          </div>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleAccept()}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-emerald-600 px-6 py-2.5 text-sm font-extrabold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy
              ? "..."
              : isAr
                ? `قبول الدعوة والاتصال مع ${inviterName}`
                : `Accept & Connect with ${inviterName}`}
          </button>
        )}
      </div>
    </div>
  );
}
