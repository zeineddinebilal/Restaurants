import type { OrderStatus, PrismaClient } from "@prisma/client";
import { EventEmitter } from "node:events";
import { calculatePlatformFeeAed } from "@/lib/money";

const ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  SENT: ["ACCEPTED", "CANCELLED"],
  ACCEPTED: ["PREPARING", "CANCELLED"],
  PREPARING: ["SERVED", "CANCELLED"],
  SERVED: [],
  CANCELLED: [],
};

export type StatusTransitionCheck =
  | { ok: true; idempotentNoop: boolean }
  | { ok: false; code: "INVALID_STATUS_TRANSITION"; message: string };

/**
 * Enforces the order state machine:
 *   SENT -> ACCEPTED -> PREPARING -> SERVED
 *   Cancel allowed from SENT, ACCEPTED, PREPARING only.
 *   Same-state repeat (e.g. double-clicking Accept) returns `{ ok: true, idempotentNoop: true }`.
 */
export function validateOrderStatusTransition(
  current: OrderStatus,
  next: OrderStatus,
): StatusTransitionCheck {
  if (current === next) {
    return { ok: true, idempotentNoop: true };
  }
  if (ALLOWED_TRANSITIONS[current].includes(next)) {
    return { ok: true, idempotentNoop: false };
  }
  return {
    ok: false,
    code: "INVALID_STATUS_TRANSITION",
    message: `Cannot transition order from ${current} to ${next}.`,
  };
}

// Global per-instance SSE event bus for live order updates
const globalForOrderEvents = globalThis as unknown as {
  orderEventBus?: EventEmitter;
};

export const orderEventBus: EventEmitter =
  globalForOrderEvents.orderEventBus ??
  (() => {
    const bus = new EventEmitter();
    bus.setMaxListeners(200);
    globalForOrderEvents.orderEventBus = bus;
    return bus;
  })();

export function emitOrderChanged(payload: {
  restaurantId: string;
  orderId: string;
  status: OrderStatus;
}) {
  orderEventBus.emit(`restaurant:${payload.restaurantId}`, payload);
  orderEventBus.emit(`order:${payload.orderId}`, payload);
}

/**
 * Transitions an order inside an atomic Prisma transaction and manages `PlatformFee`:
 * - `ACCEPTED`: snapshots `PlatformSetting` (`feePercentage`, `feeCapAed`), calculates exact
 *   round-half-up fee in integer fils, and idempotently upserts `PlatformFee` (`unique orderId`).
 *   Safe under double-clicks or concurrent staff clicks (never creates duplicate fees or throws).
 * - `CANCELLED` from `SENT`: no `PlatformFee` created.
 * - `CANCELLED` from `ACCEPTED` or `PREPARING`: voids existing `PlatformFee` (`isVoided = true`).
 */
export async function transitionOrderStatusAtomically(params: {
  db: PrismaClient;
  restaurantId: string;
  orderId: string;
  nextStatus: OrderStatus;
  cancelReason?: string | null;
}) {
  const { db, restaurantId, orderId, nextStatus, cancelReason } = params;

  const result = await db.$transaction(async (tx) => {
    const existing = await tx.order.findFirst({
      where: { id: orderId, restaurantId },
      include: { platformFee: true },
    });

    if (!existing) {
      return {
        ok: false as const,
        status: 404 as const,
        error: "Order not found.",
      };
    }

    const check = validateOrderStatusTransition(existing.status, nextStatus);
    if (!check.ok) {
      return {
        ok: false as const,
        status: 400 as const,
        error: check.message,
      };
    }

    if (check.idempotentNoop) {
      return {
        ok: true as const,
        idempotentNoop: true,
        order: existing,
      };
    }

    const now = new Date();
    // Atomic CAS guard: only update if status still equals `existing.status`
    const casUpdate = await tx.order.updateMany({
      where: {
        id: existing.id,
        restaurantId,
        status: existing.status,
      },
      data: {
        status: nextStatus,
        ...(nextStatus === "ACCEPTED" ? { acceptedAt: now } : {}),
        ...(nextStatus === "PREPARING" ? { preparingAt: now } : {}),
        ...(nextStatus === "SERVED" ? { servedAt: now } : {}),
        ...(nextStatus === "CANCELLED"
          ? {
              cancelledAt: now,
              cancelReason: cancelReason?.trim().slice(0, 240) || "Cancelled by restaurant staff",
            }
          : {}),
      },
    });

    // If a concurrent request already transitioned the order first, reload and treat idempotently if matching
    if (casUpdate.count === 0) {
      const reloaded = await tx.order.findFirst({
        where: { id: existing.id, restaurantId },
        include: { platformFee: true },
      });
      if (reloaded && reloaded.status === nextStatus) {
        return {
          ok: true as const,
          idempotentNoop: true,
          order: reloaded,
        };
      }
      return {
        ok: false as const,
        status: 409 as const,
        error: "Order state changed concurrently; please refresh.",
      };
    }

    if (nextStatus === "ACCEPTED") {
      const settings = await tx.platformSetting.findUnique({
        where: { id: "default" },
      });
      const feePercentageStr = settings ? settings.feePercentage.toFixed(2) : "10.00";
      const feeCapAedStr = settings ? settings.feeCapAed.toFixed(2) : "1.00";
      const subtotalStr = existing.subtotalAed.toFixed(2);

      const { feeAmountAed } = calculatePlatformFeeAed({
        subtotalAed: subtotalStr,
        feePercentage: feePercentageStr,
        feeCapAed: feeCapAedStr,
      });

      // Idempotent upsert keyed on unique `orderId`
      await tx.platformFee.upsert({
        where: { orderId: existing.id },
        update: {},
        create: {
          orderId: existing.id,
          restaurantId,
          orderSubtotalAed: subtotalStr,
          feePercentageApplied: feePercentageStr,
          feeCapAppliedAed: feeCapAedStr,
          feeAmountAed,
          isVoided: false,
          recordedAt: now,
        },
      });
    } else if (nextStatus === "CANCELLED") {
      // Void any fee recorded if the order was previously ACCEPTED
      await tx.platformFee.updateMany({
        where: { orderId: existing.id, isVoided: false },
        data: {
          isVoided: true,
          voidedAt: now,
        },
      });
    }

    const updatedOrder = await tx.order.findFirstOrThrow({
      where: { id: existing.id, restaurantId },
      include: { platformFee: true },
    });

    return {
      ok: true as const,
      idempotentNoop: false,
      order: updatedOrder,
    };
  });

  if (result.ok && !result.idempotentNoop) {
    emitOrderChanged({
      restaurantId,
      orderId,
      status: nextStatus,
    });
  }

  return result;
}
