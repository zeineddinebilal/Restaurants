"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

export function SignOutButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/" })}
      className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-muted)]"
    >
      <LogOut className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
