"use client";

import { Download, Share, X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type ClientInstallEnv = "hidden" | "ios" | "eligible";

function subscribeNoop() {
  return () => {};
}

function getClientInstallEnv(): ClientInstallEnv {
  if (window.sessionStorage.getItem("pf_pwa_dismissed") === "1") {
    return "hidden";
  }
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator &&
      Boolean((window.navigator as unknown as { standalone?: boolean }).standalone));
  if (isStandalone) {
    return "hidden";
  }
  if (/iPad|iPhone|iPod/.test(window.navigator.userAgent)) {
    return "ios";
  }
  return "eligible";
}

function getServerInstallEnv(): ClientInstallEnv {
  return "hidden";
}

export function PwaInstallBanner({
  copy,
}: {
  copy: {
    installTitle: string;
    installSubtitle: string;
    installButton: string;
    iosGuideButton: string;
    iosGuideSteps: string;
    dismiss: string;
  };
}) {
  const installEnv = useSyncExternalStore(subscribeNoop, getClientInstallEnv, getServerInstallEnv);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosSteps, setShowIosSteps] = useState(false);
  const [manuallyDismissed, setManuallyDismissed] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const isIos = installEnv === "ios";
  if (manuallyDismissed || installEnv === "hidden" || (!deferredPrompt && !isIos)) {
    return null;
  }

  async function handleInstallClick() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  }

  function handleDismiss() {
    setManuallyDismissed(true);
    window.sessionStorage.setItem("pf_pwa_dismissed", "1");
  }

  return (
    <section
      aria-label={copy.installTitle}
      className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            {copy.installTitle}
          </h2>
          <p className="text-sm text-[var(--text-secondary)]">{copy.installSubtitle}</p>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label={copy.dismiss}
          className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {deferredPrompt && (
          <button
            type="button"
            onClick={handleInstallClick}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--accent-primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)]"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            <span>{copy.installButton}</span>
          </button>
        )}

        {isIos && (
          <button
            type="button"
            onClick={() => setShowIosSteps((prev) => !prev)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)]"
          >
            <Share className="h-4 w-4 text-[var(--accent-primary)]" aria-hidden="true" />
            <span>{copy.iosGuideButton}</span>
          </button>
        )}
      </div>

      {isIos && showIosSteps && (
        <p className="mt-3 rounded-xl bg-[var(--accent-soft)] p-3 text-sm text-[var(--text-primary)]">
          {copy.iosGuideSteps}
        </p>
      )}
    </section>
  );
}
