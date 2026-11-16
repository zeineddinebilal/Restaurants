"use client";

import { Printer } from "lucide-react";

export function PrintSheetButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--accent-primary)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--accent-hover)] print:hidden"
    >
      <Printer className="h-4 w-4" />
      <span>{label}</span>
    </button>
  );
}
