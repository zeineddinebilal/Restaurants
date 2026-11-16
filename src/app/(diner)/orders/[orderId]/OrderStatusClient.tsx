"use client";

import type { OrderStatus } from "@prisma/client";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  CreditCard,
  ExternalLink,
  Star,
  Utensils,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { type Locale, pickLocalized } from "@/lib/i18n/dictionaries";
import { aedToFils, formatAed } from "@/lib/money";

export interface SerializedOrderView {
  id: string;
  orderNumber: number;
  status: OrderStatus;
  subtotalAed: string;
  notes: string | null;
  cancelReason: string | null;
  restaurant: {
    slug: string;
    nameEn: string;
    nameAr: string;
    existingPaymentProvider?: string;
    existingPaymentUrl?: string | null;
  };
  table: {
    tableCode: string;
    displayName: string;
  };
  items: Array<{
    id: string;
    menuItemId: string;
    nameEn: string;
    nameAr: string;
    participantName: string | null;
    quantity: number;
    unitPriceAed: string;
    lineTotalAed: string;
    selectedModifiers: unknown;
    specialInstructions: string | null;
  }>;
  billSplit: {
    totalFils: number;
    shares: Array<{
      participantId: string;
      displayName: string;
      totalFils: number;
    }>;
  };
  settlement: {
    instructionsEn: string;
    instructionsAr: string;
  };
}

const STEPS: OrderStatus[] = ["SENT", "ACCEPTED", "PREPARING", "SERVED"];

function getPaymentProviderLabel(provider: string | undefined, isAr: boolean): string | null {
  if (!provider || provider === "NONE") return null;
  if (provider === "QLUB") return "Qlub";
  if (provider === "FOODICS_PAY") return "Foodics Pay";
  if (provider === "FINEDINE") return "FineDine";
  return isAr ? "رمز الدفع على الطاولة" : "your table QR";
}

export function OrderStatusClient({
  locale,
  initialOrder,
}: {
  locale: Locale;
  initialOrder: SerializedOrderView;
}) {
  const isAr = locale === "ar";
  const [order, setOrder] = useState<SerializedOrderView>(initialOrder);
  const [ratedDishes, setRatedDishes] = useState<Record<string, number>>({});

  const refreshOrder = useCallback(async () => {
    const res = await fetch(`/api/orders/${initialOrder.id}`, { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as { order: SerializedOrderView };
      setOrder(data.order);
    }
  }, [initialOrder.id]);

  // SSE subscription + automatic polling fallback (reconnect-safe on Render free)
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource(`/api/orders/${initialOrder.id}/stream`);
      es.addEventListener("order_update", () => {
        void refreshOrder();
      });
    } catch {
      // Polling fallback below covers browsers/proxies where EventSource drops
    }

    const pollTimer = setInterval(() => {
      void refreshOrder();
    }, 3500);

    return () => {
      clearInterval(pollTimer);
      if (es) es.close();
    };
  }, [initialOrder.id, refreshOrder]);

  async function handleRateDish(menuItemId: string, stars: number) {
    const res = await fetch("/api/diner/ratings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: order.id,
        menuItemId,
        rating: stars,
      }),
    });
    if (res.ok) {
      setRatedDishes((prev) => ({ ...prev, [menuItemId]: stars }));
    }
  }

  const currentStepIndex = STEPS.indexOf(order.status);
  const statusLabels: Record<OrderStatus, string> = isAr
    ? {
        SENT: "تم الإرسال للمطبخ",
        ACCEPTED: "تم قبول الطلب",
        PREPARING: "قيد التحضير",
        SERVED: "تم التقديم",
        CANCELLED: "ملغي",
      }
    : {
        SENT: "Sent to Kitchen",
        ACCEPTED: "Accepted",
        PREPARING: "Preparing",
        SERVED: "Served",
        CANCELLED: "Cancelled",
      };

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <Link
        href={`/r/${order.restaurant.slug}/t/${order.table.tableCode}`}
        className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-[var(--accent-primary)] hover:underline"
      >
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
        <span>
          {isAr ? "العودة لقائمة الطاولة" : "Back to Table Menu"} (
          {pickLocalized(order.restaurant.nameEn, order.restaurant.nameAr, locale)})
        </span>
      </Link>

      {/* Live Status Tracker Card */}
      <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="font-mono text-xs font-bold uppercase text-[var(--accent-primary)]">
              Order #{order.orderNumber} • {order.table.displayName}
            </span>
            <h1 className="mt-1 text-2xl font-extrabold" data-testid="order-live-status">
              {statusLabels[order.status]}
            </h1>
          </div>

          <span className="rounded-2xl bg-[var(--bg-muted)] px-4 py-2 font-mono text-lg font-extrabold">
            {formatAed(aedToFils(order.subtotalAed), locale)}
          </span>
        </div>

        {order.status === "CANCELLED" ? (
          <div className="mt-6 flex items-center gap-3 rounded-2xl bg-red-500/15 p-4 text-sm font-semibold text-red-700 dark:text-red-300">
            <XCircle className="h-5 w-5 shrink-0" />
            <span>
              {order.cancelReason || (isAr ? "تم إلغاء الطلب." : "This order was cancelled.")}
            </span>
          </div>
        ) : (
          <ol className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {STEPS.map((step, idx) => {
              const reached = idx <= currentStepIndex;
              return (
                <li
                  key={step}
                  className={`rounded-2xl border p-3 text-center text-xs font-bold transition ${
                    reached
                      ? "border-emerald-600 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
                      : "border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)]"
                  }`}
                >
                  <div className="mx-auto mb-1 flex h-6 w-6 items-center justify-center">
                    {reached ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    ) : idx === currentStepIndex + 1 ? (
                      <Clock className="h-4 w-4" />
                    ) : (
                      <Utensils className="h-4 w-4 opacity-50" />
                    )}
                  </div>
                  <span>{statusLabels[step]}</span>
                </li>
              );
            })}
          </ol>
        )}

        {(() => {
          const providerLabel = getPaymentProviderLabel(
            order.restaurant.existingPaymentProvider,
            isAr,
          );
          const safePayUrl =
            order.restaurant.existingPaymentUrl &&
            /^https:\/\/\S+$/i.test(order.restaurant.existingPaymentUrl)
              ? order.restaurant.existingPaymentUrl
              : null;

          if (!providerLabel) {
            return (
              <p className="mt-5 rounded-2xl bg-[var(--bg-muted)] px-4 py-3 text-xs font-medium text-[var(--text-secondary)]">
                {isAr ? order.settlement.instructionsAr : order.settlement.instructionsEn}
              </p>
            );
          }

          return (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--accent-primary)]/30 bg-[var(--accent-soft)] px-4 py-3.5">
              <div className="flex items-center gap-2.5 text-sm font-bold text-[var(--text-primary)]">
                <CreditCard className="h-4 w-4 shrink-0 text-[var(--accent-primary)]" />
                <span>
                  {isAr
                    ? `ادفع عبر ${providerLabel} على طاولتك`
                    : `Pay with ${providerLabel} at your table`}
                </span>
              </div>
              {safePayUrl && (
                <a
                  href={safePayUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-[var(--accent-primary)] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[var(--accent-hover)]"
                >
                  <span>{isAr ? `افتح ${providerLabel}` : `Open ${providerLabel}`}</span>
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              )}
            </div>
          );
        })()}
      </section>

      {/* Ordered Items + Ratings */}
      <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-extrabold">{isAr ? "تفاصيل الطلب" : "Ordered Dishes"}</h2>

        <ul className="divide-y divide-[var(--border-subtle)]">
          {order.items.map((item) => {
            const mods = Array.isArray(item.selectedModifiers)
              ? (item.selectedModifiers as Array<{ nameEn?: string; nameAr?: string }>)
              : [];
            const myStars = ratedDishes[item.menuItemId] ?? 0;

            return (
              <li key={item.id} className="space-y-2 py-3.5">
                <div className="flex justify-between gap-2 text-sm">
                  <div>
                    <span className="font-bold">
                      {item.quantity}× {pickLocalized(item.nameEn, item.nameAr, locale)}
                    </span>
                    {item.participantName && (
                      <span className="ms-2 rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--accent-primary)]">
                        {item.participantName}
                      </span>
                    )}
                  </div>
                  <span className="font-mono font-bold">
                    {formatAed(aedToFils(item.lineTotalAed), locale)}
                  </span>
                </div>

                {mods.length > 0 && (
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    ✓ {mods.map((m) => pickLocalized(m.nameEn, m.nameAr, locale)).join(", ")}
                  </p>
                )}

                {(order.status === "ACCEPTED" ||
                  order.status === "PREPARING" ||
                  order.status === "SERVED") && (
                  <div className="flex items-center gap-1 pt-1">
                    <span className="me-2 text-[11px] text-[var(--text-secondary)]">
                      {isAr ? "قيّم الطبق:" : "Rate dish:"}
                    </span>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => handleRateDish(item.menuItemId, star)}
                        aria-label={`Rate ${star} stars`}
                        className="p-1"
                      >
                        <Star
                          className={`h-4 w-4 ${
                            star <= myStars
                              ? "fill-amber-400 text-amber-400"
                              : "text-[var(--text-secondary)]"
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Per-Person Split Summary */}
      {order.billSplit.shares.length > 1 && (
        <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-sm space-y-3">
          <h2 className="text-lg font-extrabold">{isAr ? "حصة كل شخص" : "Bill Split by Person"}</h2>
          <ul className="divide-y divide-[var(--border-subtle)] text-sm">
            {order.billSplit.shares.map((s) => (
              <li key={s.participantId} className="flex justify-between py-2">
                <span className="font-semibold">{s.displayName}</span>
                <span className="font-mono font-bold">{formatAed(s.totalFils, locale)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
