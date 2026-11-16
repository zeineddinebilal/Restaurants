"use client";

export function OfflineRetryButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--accent-primary)] px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)]"
    >
      {label}
    </button>
  );
}
