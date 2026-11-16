"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";

const THEME_CHANGE_EVENT = "pf-theme-change";

function subscribeTheme(onStoreChange: () => void) {
  window.addEventListener(THEME_CHANGE_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function getClientDarkSnapshot(): boolean {
  const saved = window.localStorage.getItem("pf_theme");
  if (saved === "dark") return true;
  if (saved === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function getServerDarkSnapshot(): boolean {
  return false;
}

export function ThemeToggle({ label }: { label: string }) {
  const dark = useSyncExternalStore(subscribeTheme, getClientDarkSnapshot, getServerDarkSnapshot);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  function toggleTheme() {
    const next = !dark;
    window.localStorage.setItem("pf_theme", next ? "dark" : "light");
    document.documentElement.classList.toggle("dark", next);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2 text-[var(--text-primary)] transition hover:bg-[var(--bg-muted)]"
    >
      {dark ? (
        <Sun className="h-4 w-4 text-amber-400" aria-hidden="true" />
      ) : (
        <Moon className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden="true" />
      )}
    </button>
  );
}
