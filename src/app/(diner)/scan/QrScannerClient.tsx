"use client";

import { Camera, QrCode } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n/dictionaries";
import { parseQrTableTarget } from "@/lib/qr-parse";

interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue?: string }>>;
}

export function QrScannerClient({
  locale,
  demoTableHref,
}: {
  locale: Locale;
  demoTableHref: string | null;
}) {
  const router = useRouter();
  const isAr = locale === "ar";
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualLink, setManualLink] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);

  useEffect(() => {
    if (!cameraActive) return;

    let stopped = false;
    let stream: MediaStream | null = null;
    let timerId: ReturnType<typeof setInterval> | null = null;

    async function startScanner() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const DetectorCtor = (
          window as unknown as {
            BarcodeDetector?: new (opts: { formats: string[] }) => BarcodeDetectorLike;
          }
        ).BarcodeDetector;

        if (DetectorCtor) {
          const detector = new DetectorCtor({ formats: ["qr_code"] });
          timerId = setInterval(async () => {
            if (!videoRef.current || stopped) return;
            try {
              const codes = await detector.detect(videoRef.current);
              for (const code of codes) {
                const target = code.rawValue ? parseQrTableTarget(code.rawValue) : null;
                if (target) {
                  stopped = true;
                  router.push(target);
                  break;
                }
              }
            } catch {
              // Ignore transient frame detection errors
            }
          }, 500);
        }
      } catch {
        setCameraError(
          isAr
            ? "تعذر الوصول إلى الكاميرا. يمكنك مسح الرمز بكاميرا الهاتف العادية أو إدخال الرابط أدناه."
            : "Camera permission unavailable. Scan with your phone's native camera or enter the table path below.",
        );
        setCameraActive(false);
      }
    }

    void startScanner();

    return () => {
      stopped = true;
      if (timerId) clearInterval(timerId);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [cameraActive, isAr, router]);

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const target = parseQrTableTarget(manualLink);
    if (!target) {
      setManualError(
        isAr
          ? "الرجاء إدخال مسار صحيح مثل /r/demo-lebanese-kitchen/t/T1"
          : "Enter a valid table QR link or path such as /r/demo-lebanese-kitchen/t/T1",
      );
      return;
    }
    router.push(target);
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-10">
      <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 text-center shadow-sm">
        <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-primary)]">
          <QrCode className="h-8 w-8" />
        </div>
        <h1 className="mt-4 text-2xl font-extrabold">
          {isAr ? "مسح رمز طاولة المطعم" : "Scan Table QR Code"}
        </h1>
        <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
          {isAr
            ? "وجّه الكاميرا نحو رمز QR الموجود على الطاولة."
            : "Point your camera at the QR code on your restaurant table."}
        </p>

        {cameraActive ? (
          <div className="mt-5 overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-black">
            <video ref={videoRef} playsInline muted className="h-64 w-full object-cover" />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setCameraError(null);
              setCameraActive(true);
            }}
            className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent-primary)] px-6 py-3 text-sm font-bold text-white hover:bg-[var(--accent-hover)]"
          >
            <Camera className="h-5 w-5" />
            <span>{isAr ? "تشغيل الكاميرا للمسح" : "Start Camera Scanner"}</span>
          </button>
        )}

        {cameraError && (
          <p className="mt-3 rounded-xl bg-[var(--accent-soft)] p-3 text-xs font-medium text-[var(--accent-primary)]">
            {cameraError}
          </p>
        )}

        {demoTableHref && (
          <div className="mt-5 border-t border-[var(--border-subtle)] pt-4">
            <Link
              href={demoTableHref}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)] px-4 py-2.5 text-xs font-bold text-[var(--text-primary)]"
            >
              {isAr
                ? "تجربة فورية: المطبخ اللبناني التجريبي — طاولة T1"
                : "Try Demo Table: Demo Lebanese Kitchen — Table T1"}
            </Link>
          </div>
        )}
      </div>

      <form
        onSubmit={handleManualSubmit}
        className="space-y-3 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-sm"
      >
        <label htmlFor="manual-qr-input" className="block text-xs font-bold uppercase">
          {isAr ? "أو أدخل رابط الطاولة يدوياً" : "Or Enter Table Link Manually"}
        </label>
        <input
          id="manual-qr-input"
          value={manualLink}
          onChange={(e) => setManualLink(e.target.value)}
          placeholder="/r/demo-lebanese-kitchen/t/T1"
          className="w-full min-h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3.5 py-2 font-mono text-sm"
        />
        {manualError && <p className="text-xs font-semibold text-red-600">{manualError}</p>}
        <button
          type="submit"
          className="w-full min-h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)] px-4 py-2 text-sm font-semibold"
        >
          {isAr ? "فتح قائمة الطاولة" : "Open Table Menu"}
        </button>
      </form>
    </div>
  );
}
