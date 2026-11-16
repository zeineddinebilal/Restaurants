"use client";

import type { OrderStatus } from "@prisma/client";
import {
  AlertTriangle,
  Bell,
  BellOff,
  CheckCircle2,
  ChefHat,
  UtensilsCrossed,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Locale, pickLocalized } from "@/lib/i18n/dictionaries";
import { aedToFils, formatAed } from "@/lib/money";

export interface StaffOrderCard {
  id: string;
  orderNumber: number;
  status: OrderStatus;
  subtotalAed: string;
  notes: string | null;
  cancelReason: string | null;
  sentAt: string;
  table: {
    tableCode: string;
    displayName: string;
  };
  participants: Array<{
    id: string;
    displayName: string;
    dietaryRestrictions: string[];
    allergens: string[];
  }>;
  items: Array<{
    id: string;
    nameEn: string;
    nameAr: string;
    participantName: string | null;
    quantity: number;
    unitPriceAed: string;
    lineTotalAed: string;
    selectedModifiers: unknown;
    specialInstructions: string | null;
  }>;
  platformFee: {
    feeAmountAed: string;
    isVoided: boolean;
  } | null;
}

function playKitchenChime() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(880, now);
    osc1.frequency.setValueAtTime(1174.66, now + 0.14);
    gain1.gain.setValueAtTime(0.18, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.55);
  } catch {
    // Ignore autoplay audio restrictions until first user interaction
  }
}

export function LiveOrdersStaffClient({
  locale,
  restaurantId,
  restaurantName,
  initialOrders,
}: {
  locale: Locale;
  restaurantId: string;
  restaurantName: string;
  initialOrders: StaffOrderCard[];
}) {
  const isAr = locale === "ar";
  const [orders, setOrders] = useState<StaffOrderCard[]>(initialOrders);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [newOrderFlash, setNewOrderFlash] = useState(false);
  const [tab, setTab] = useState<"active" | "history">("active");
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);

  const knownSentIdsRef = useRef<Set<string>>(
    new Set(initialOrders.filter((o) => o.status === "SENT").map((o) => o.id)),
  );

  const loadOrders = useCallback(async () => {
    const res = await fetch(`/api/restaurant/${restaurantId}/orders`, { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { orders: StaffOrderCard[] };

    const incomingSent = data.orders.filter((o) => o.status === "SENT");
    const hasBrandNewSent = incomingSent.some((o) => !knownSentIdsRef.current.has(o.id));
    knownSentIdsRef.current = new Set(incomingSent.map((o) => o.id));

    if (hasBrandNewSent) {
      setNewOrderFlash(true);
      setTimeout(() => setNewOrderFlash(false), 4000);
      if (soundEnabled) {
        playKitchenChime();
      }
    }

    setOrders(data.orders);
  }, [restaurantId, soundEnabled]);

  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource(`/api/restaurant/${restaurantId}/orders/stream`);
      es.addEventListener("orders_changed", () => {
        void loadOrders();
      });
    } catch {
      // Polling fallback below ensures uninterrupted updates
    }

    const pollTimer = setInterval(() => {
      void loadOrders();
    }, 3500);

    return () => {
      clearInterval(pollTimer);
      if (es) es.close();
    };
  }, [restaurantId, loadOrders]);

  async function handleTransition(
    orderId: string,
    status: "ACCEPTED" | "PREPARING" | "SERVED" | "CANCELLED",
  ) {
    setBusyOrderId(orderId);
    const res = await fetch(`/api/restaurant/${restaurantId}/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        ...(status === "CANCELLED" ? { cancelReason: "Cancelled from staff screen" } : {}),
      }),
    });
    setBusyOrderId(null);
    if (res.ok) {
      await loadOrders();
    }
  }

  const activeOrders = orders.filter(
    (o) => o.status === "SENT" || o.status === "ACCEPTED" || o.status === "PREPARING",
  );
  const completedOrders = orders.filter((o) => o.status === "SERVED" || o.status === "CANCELLED");
  const displayed = tab === "active" ? activeOrders : completedOrders;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      {/* Header + Sound Alert Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold sm:text-3xl">
            {isAr
              ? `شاشة الطلبات المباشرة — ${restaurantName}`
              : `Live Kitchen & Staff Orders — ${restaurantName}`}
          </h1>
          <p className="text-xs text-[var(--text-secondary)]">
            Real-time SSE + auto-refresh • Accepting an order records the platform fee automatically
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const next = !soundEnabled;
              setSoundEnabled(next);
              if (next) playKitchenChime();
            }}
            className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2 text-xs font-bold"
          >
            {soundEnabled ? (
              <Bell className="h-4 w-4 text-emerald-600" />
            ) : (
              <BellOff className="h-4 w-4 text-[var(--text-secondary)]" />
            )}
            <span>{soundEnabled ? "Sound Alert ON" : "Sound Muted"}</span>
          </button>

          <div className="flex rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1">
            <button
              type="button"
              onClick={() => setTab("active")}
              className={`min-h-9 rounded-xl px-3.5 py-1.5 text-xs font-bold ${
                tab === "active" ? "bg-[var(--accent-primary)] text-white" : ""
              }`}
            >
              Active ({activeOrders.length})
            </button>
            <button
              type="button"
              onClick={() => setTab("history")}
              className={`min-h-9 rounded-xl px-3.5 py-1.5 text-xs font-bold ${
                tab === "history" ? "bg-[var(--accent-primary)] text-white" : ""
              }`}
            >
              History ({completedOrders.length})
            </button>
          </div>
        </div>
      </div>

      {newOrderFlash && (
        <div
          role="status"
          className="animate-pulse rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-extrabold text-white shadow-md"
        >
          🔔 {isAr ? "وصل طلب طاولة جديد!" : "New table order just arrived!"}
        </div>
      )}

      {displayed.length === 0 ? (
        <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-12 text-center text-sm text-[var(--text-secondary)]">
          {tab === "active"
            ? isAr
              ? "لا توجد طلبات نشطة حالياً — ستظهر الطلبات الجديدة هنا تلقائياً."
              : "No active kitchen orders right now — incoming QR table orders appear automatically."
            : isAr
              ? "لا يوجد سجل طلبات مكتملة بعد."
              : "No completed or cancelled orders yet."}
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {displayed.map((order) => {
            const isBusy = busyOrderId === order.id;

            return (
              <article
                key={order.id}
                data-testid={`staff-order-card-${order.id}`}
                className={`flex flex-col justify-between rounded-3xl border-2 bg-[var(--bg-surface)] p-6 shadow-sm ${
                  order.status === "SENT"
                    ? "border-[var(--accent-primary)]"
                    : "border-[var(--border-subtle)]"
                }`}
              >
                <div className="space-y-4">
                  {/* Top Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
                    <div>
                      <span className="inline-block rounded-xl bg-[var(--accent-soft)] px-3 py-1 font-mono text-sm font-extrabold text-[var(--accent-primary)]">
                        {order.table.tableCode} — {order.table.displayName}
                      </span>
                      <span className="ms-2 font-mono text-sm font-bold text-[var(--text-secondary)]">
                        #{order.orderNumber}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        data-testid={`staff-order-status-${order.id}`}
                        className="rounded-full bg-[var(--bg-muted)] px-3 py-1 text-xs font-extrabold"
                      >
                        {order.status}
                      </span>
                      <span className="font-mono text-base font-extrabold">
                        {formatAed(aedToFils(order.subtotalAed), locale)}
                      </span>
                    </div>
                  </div>

                  {/* Table Participants Dietary Overview */}
                  {order.participants.some(
                    (p) => p.allergens.length > 0 || p.dietaryRestrictions.length > 0,
                  ) && (
                    <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                      <div className="flex items-center gap-1.5 font-extrabold text-amber-800 dark:text-amber-300">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <span>Table Dietary &amp; Allergy Alert:</span>
                      </div>
                      <ul className="mt-1 space-y-0.5 text-[var(--text-primary)]">
                        {order.participants
                          .filter((p) => p.allergens.length > 0 || p.dietaryRestrictions.length > 0)
                          .map((p) => (
                            <li key={p.id}>
                              <strong>{p.displayName}:</strong>{" "}
                              {[
                                ...p.allergens.map((a) => `NO ${a.toUpperCase()}`),
                                ...p.dietaryRestrictions,
                              ].join(", ")}
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}

                  {/* Line Items + Safety Modifiers */}
                  <ul className="divide-y divide-[var(--border-subtle)]">
                    {order.items.map((item) => {
                      const mods = Array.isArray(item.selectedModifiers)
                        ? (item.selectedModifiers as Array<{ nameEn?: string; nameAr?: string }>)
                        : [];
                      return (
                        <li key={item.id} className="space-y-1 py-2.5">
                          <div className="flex justify-between gap-2 text-base font-bold">
                            <span>
                              {item.quantity}× {pickLocalized(item.nameEn, item.nameAr, locale)}
                            </span>
                            {item.participantName && (
                              <span className="text-xs font-semibold text-[var(--text-secondary)]">
                                ({item.participantName})
                              </span>
                            )}
                          </div>

                          {mods.length > 0 && (
                            <p className="rounded-lg bg-emerald-500/15 px-2.5 py-1 text-xs font-extrabold text-emerald-800 dark:text-emerald-300">
                              ✓ MODIFIER:{" "}
                              {mods
                                .map((m) => pickLocalized(m.nameEn, m.nameAr, locale))
                                .join(", ")}
                            </p>
                          )}

                          {item.specialInstructions && (
                            <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                              ⚠️ {item.specialInstructions}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>

                  {order.notes && (
                    <p className="rounded-xl bg-[var(--bg-canvas)] p-3 text-xs font-medium">
                      <strong>Note:</strong> {order.notes}
                    </p>
                  )}

                  {order.platformFee && (
                    <p
                      data-testid={`staff-order-fee-${order.id}`}
                      className="font-mono text-[11px] text-[var(--text-secondary)]"
                    >
                      Platform fee:{" "}
                      {order.platformFee.isVoided
                        ? "AED 0.00 (Voided on cancel)"
                        : `AED ${order.platformFee.feeAmountAed}`}
                    </p>
                  )}
                </div>

                {/* Large Touch Action Buttons */}
                {(order.status === "SENT" ||
                  order.status === "ACCEPTED" ||
                  order.status === "PREPARING") && (
                  <div className="mt-5 flex flex-wrap gap-2.5 border-t border-[var(--border-subtle)] pt-4">
                    {order.status === "SENT" && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleTransition(order.id, "ACCEPTED")}
                        className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-extrabold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-5 w-5" />
                        <span>{isAr ? "قبول الطلب" : "Accept Order"}</span>
                      </button>
                    )}

                    {order.status === "ACCEPTED" && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleTransition(order.id, "PREPARING")}
                        className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-amber-600 px-5 py-3 text-sm font-extrabold text-white hover:bg-amber-700 disabled:opacity-50"
                      >
                        <ChefHat className="h-5 w-5" />
                        <span>{isAr ? "بدء التحضير" : "Start Preparing"}</span>
                      </button>
                    )}

                    {order.status === "PREPARING" && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleTransition(order.id, "SERVED")}
                        className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-sky-600 px-5 py-3 text-sm font-extrabold text-white hover:bg-sky-700 disabled:opacity-50"
                      >
                        <UtensilsCrossed className="h-5 w-5" />
                        <span>{isAr ? "تم التقديم للطاولة" : "Mark Served"}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleTransition(order.id, "CANCELLED")}
                      className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs font-extrabold text-red-700 dark:text-red-300 disabled:opacity-50"
                    >
                      <XCircle className="h-4 w-4" />
                      <span>{isAr ? "إلغاء" : "Cancel"}</span>
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
