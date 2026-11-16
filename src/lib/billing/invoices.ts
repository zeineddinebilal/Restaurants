import type { InvoiceStatus, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { aedToFils, filsToAedString } from "@/lib/money";

export const DUBAI_TIMEZONE = "Asia/Dubai";
export const DUBAI_UTC_OFFSET_HOURS = 4;
export const DUBAI_UTC_OFFSET_MS = DUBAI_UTC_OFFSET_HOURS * 60 * 60 * 1000;

export interface InvoiceFeeSnapshotLine {
  feeId: string;
  orderId: string;
  orderNumber: number;
  tableCode: string;
  recordedAtIso: string;
  orderSubtotalAed: string;
  feePercentageApplied: string;
  feeCapAppliedAed: string;
  feeAmountAed: string;
}

export interface InvoiceVoidAdjustmentLine {
  feeId: string;
  orderId: string;
  orderNumber: number;
  originalInvoiceNumber: string;
  originalYear: number;
  originalMonth: number;
  voidedAtIso: string;
  creditAmountAed: string; // Negative AED string, e.g. "-1.00"
}

export interface InvoiceLineItemsSnapshot {
  timezone: "Asia/Dubai";
  feeLines: InvoiceFeeSnapshotLine[];
  adjustmentLines: InvoiceVoidAdjustmentLine[];
}

/**
 * Returns the exact UTC timestamps corresponding to:
 *   startUtc = 00:00:00.000 Asia/Dubai on day 1 of (year, month)
 *   endUtc   = 00:00:00.000 Asia/Dubai on day 1 of the following month
 * Note: UAE (`Asia/Dubai`) is permanently UTC+04:00 year-round (no DST).
 */
export function getDubaiMonthBoundsUtc(
  year: number,
  month: number,
): { startUtc: Date; endUtc: Date } {
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    throw new Error(`Invalid invoice year: ${year}`);
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Invalid invoice month: ${month}`);
  }

  const startUtcMs = Date.UTC(year, month - 1, 1, 0, 0, 0, 0) - DUBAI_UTC_OFFSET_MS;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const endUtcMs = Date.UTC(nextYear, nextMonth - 1, 1, 0, 0, 0, 0) - DUBAI_UTC_OFFSET_MS;

  return {
    startUtc: new Date(startUtcMs),
    endUtc: new Date(endUtcMs),
  };
}

/**
 * Resolves the current calendar `{ year, month }` in `Asia/Dubai` (`UTC+04:00`).
 */
export function getCurrentDubaiYearMonth(now: Date = new Date()): {
  year: number;
  month: number;
} {
  const shifted = new Date(now.getTime() + DUBAI_UTC_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
  };
}

export function formatDubaiDateTime(value: Date | string, locale: "en" | "ar" = "en"): string {
  const dt = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-AE" : "en-AE", {
    timeZone: DUBAI_TIMEZONE,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(dt);
}

export function formatInvoiceNumber(sequenceNumber: number): string {
  return `INV-${String(sequenceNumber).padStart(6, "0")}`;
}

export function parseInvoiceSnapshot(raw: unknown): InvoiceLineItemsSnapshot {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    return {
      timezone: "Asia/Dubai",
      feeLines: Array.isArray(obj.feeLines) ? (obj.feeLines as InvoiceFeeSnapshotLine[]) : [],
      adjustmentLines: Array.isArray(obj.adjustmentLines)
        ? (obj.adjustmentLines as InvoiceVoidAdjustmentLine[])
        : [],
    };
  }
  return { timezone: "Asia/Dubai", feeLines: [], adjustmentLines: [] };
}

/**
 * Computes current Dubai month fee metrics for a restaurant owner's `/dashboard/billing` view.
 */
export async function computeCurrentMonthRestaurantFeeSummary(
  params: {
    restaurantId: string;
    now?: Date;
  },
  db: PrismaClient = prisma,
) {
  const { year, month } = getCurrentDubaiYearMonth(params.now);
  const { startUtc, endUtc } = getDubaiMonthBoundsUtc(year, month);

  const [monthFees, unappliedVoidCredits] = await Promise.all([
    db.platformFee.findMany({
      where: {
        restaurantId: params.restaurantId,
        recordedAt: { gte: startUtc, lt: endUtc },
      },
      orderBy: { recordedAt: "desc" },
    }),
    db.platformFee.findMany({
      where: {
        restaurantId: params.restaurantId,
        isVoided: true,
        invoiceId: { not: null },
        voidCreditInvoiceId: null,
        invoice: {
          status: { in: ["ISSUED", "PAID"] },
          OR: [{ year: { lt: year } }, { year, month: { lt: month } }],
        },
      },
    }),
  ]);

  let activeOrderCount = 0;
  let voidedOrderCount = 0;
  let grossSalesFils = 0;
  let activeFeesFils = 0;

  for (const fee of monthFees) {
    if (fee.isVoided) {
      voidedOrderCount++;
    } else {
      activeOrderCount++;
      grossSalesFils += aedToFils(fee.orderSubtotalAed);
      activeFeesFils += aedToFils(fee.feeAmountAed);
    }
  }

  let pendingCreditFils = 0;
  for (const credit of unappliedVoidCredits) {
    pendingCreditFils += aedToFils(credit.feeAmountAed);
  }

  const netEstimatedDueFils = activeFeesFils - pendingCreditFils;

  return {
    year,
    month,
    periodStartUtc: startUtc,
    periodEndUtc: endUtc,
    activeOrderCount,
    voidedOrderCount,
    grossSalesAed: filsToAedString(grossSalesFils),
    activeFeesAed: filsToAedString(activeFeesFils),
    pendingAdjustmentsAed: filsToAedString(-pendingCreditFils),
    netEstimatedDueAed: filsToAedString(netEstimatedDueFils),
  };
}

/**
 * Generates (or idempotently returns / regenerates a DRAFT) monthly invoice for `(restaurantId, year, month)`:
 * - Month boundaries use `Asia/Dubai` (`UTC+04:00`) midnight, NOT UTC midnight.
 * - Invoice numbers are strictly sequential (`INV-000001`, `INV-000002`, ...) under `pg_advisory_xact_lock`.
 * - If an `ISSUED` or `PAID` invoice already exists for `(restaurantId, year, month)`, it is FROZEN and
 *   returned untouched (`idempotentReuse: true`)—later voids never mutate an issued invoice.
 * - Voids that occurred AFTER a prior month's invoice was `ISSUED`/`PAID` are carried onto the next
 *   invoice as explicit negative `adjustmentsAed` lines (`voidCreditInvoiceId` prevents double-crediting).
 */
export async function generateMonthlyInvoice(
  params: {
    restaurantId: string;
    year: number;
    month: number;
    targetStatus?: "DRAFT" | "ISSUED";
    actorUserId?: string;
    actorEmail?: string;
  },
  db: PrismaClient = prisma,
) {
  const targetStatus: InvoiceStatus = params.targetStatus ?? "ISSUED";
  const { startUtc, endUtc } = getDubaiMonthBoundsUtc(params.year, params.month);

  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261117)`;

    const restaurant = await tx.restaurant.findUnique({
      where: { id: params.restaurantId },
      select: { id: true, nameEn: true },
    });
    if (!restaurant) {
      throw new Error("Restaurant not found");
    }

    const existing = await tx.invoice.findUnique({
      where: {
        restaurantId_year_month: {
          restaurantId: params.restaurantId,
          year: params.year,
          month: params.month,
        },
      },
    });

    // Frozen invoice invariant: ISSUED and PAID invoices NEVER change on repeat generation or post-issue voids
    if (existing && (existing.status === "ISSUED" || existing.status === "PAID")) {
      return {
        invoice: existing,
        idempotentReuse: true,
      };
    }

    // 1. Collect all non-voided PlatformFee rows recorded inside [startUtc, endUtc) in Asia/Dubai time
    const activePeriodFees = await tx.platformFee.findMany({
      where: {
        restaurantId: params.restaurantId,
        isVoided: false,
        recordedAt: { gte: startUtc, lt: endUtc },
        OR: [{ invoiceId: null }, ...(existing ? [{ invoiceId: existing.id }] : [])],
      },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            table: { select: { tableCode: true } },
          },
        },
      },
      orderBy: { recordedAt: "asc" },
    });

    // 2. Collect post-invoice voids from strictly earlier ISSUED/PAID invoices not yet credited
    const uncreditedPriorVoids = await tx.platformFee.findMany({
      where: {
        restaurantId: params.restaurantId,
        isVoided: true,
        invoiceId: { not: null },
        invoice: {
          status: { in: ["ISSUED", "PAID"] },
          OR: [{ year: { lt: params.year } }, { year: params.year, month: { lt: params.month } }],
        },
        OR: [
          { voidCreditInvoiceId: null },
          ...(existing ? [{ voidCreditInvoiceId: existing.id }] : []),
        ],
      },
      include: {
        invoice: { select: { invoiceNumber: true, year: true, month: true } },
        order: { select: { id: true, orderNumber: true } },
      },
      orderBy: { voidedAt: "asc" },
    });

    let grossSalesFils = 0;
    let periodFeesFils = 0;
    const feeLines: InvoiceFeeSnapshotLine[] = activePeriodFees.map((f) => {
      const subtotalFils = aedToFils(f.orderSubtotalAed);
      const feeFils = aedToFils(f.feeAmountAed);
      grossSalesFils += subtotalFils;
      periodFeesFils += feeFils;
      return {
        feeId: f.id,
        orderId: f.orderId,
        orderNumber: f.order.orderNumber,
        tableCode: f.order.table.tableCode,
        recordedAtIso: f.recordedAt.toISOString(),
        orderSubtotalAed: filsToAedString(subtotalFils),
        feePercentageApplied: f.feePercentageApplied.toFixed(2),
        feeCapAppliedAed: f.feeCapAppliedAed.toFixed(2),
        feeAmountAed: filsToAedString(feeFils),
      };
    });

    let totalVoidCreditFils = 0;
    const adjustmentLines: InvoiceVoidAdjustmentLine[] = uncreditedPriorVoids.map((v) => {
      const creditFils = aedToFils(v.feeAmountAed);
      totalVoidCreditFils += creditFils;
      return {
        feeId: v.id,
        orderId: v.orderId,
        orderNumber: v.order.orderNumber,
        originalInvoiceNumber: v.invoice?.invoiceNumber ?? "PRIOR",
        originalYear: v.invoice?.year ?? params.year,
        originalMonth: v.invoice?.month ?? params.month,
        voidedAtIso: (v.voidedAt ?? new Date()).toISOString(),
        creditAmountAed: filsToAedString(-creditFils),
      };
    });

    const adjustmentsFils = -totalVoidCreditFils;
    const netTotalFeesFils = periodFeesFils + adjustmentsFils;

    const snapshot: InvoiceLineItemsSnapshot = {
      timezone: "Asia/Dubai",
      feeLines,
      adjustmentLines,
    };

    const now = new Date();
    let savedInvoice;

    if (existing) {
      // Regenerating or issuing an existing DRAFT keeps its sequential invoiceNumber!
      await tx.platformFee.updateMany({
        where: { invoiceId: existing.id },
        data: { invoiceId: null },
      });
      await tx.platformFee.updateMany({
        where: { voidCreditInvoiceId: existing.id },
        data: { voidCreditInvoiceId: null },
      });

      savedInvoice = await tx.invoice.update({
        where: { id: existing.id },
        data: {
          periodStartUtc: startUtc,
          periodEndUtc: endUtc,
          totalOrders: activePeriodFees.length,
          grossSalesAed: filsToAedString(grossSalesFils),
          periodFeesAed: filsToAedString(periodFeesFils),
          adjustmentsAed: filsToAedString(adjustmentsFils),
          totalFeesAed: filsToAedString(netTotalFeesFils),
          lineItemsSnapshot: snapshot as unknown as Prisma.InputJsonValue,
          status: targetStatus,
          generatedAt: now,
        },
      });
    } else {
      const maxAgg = await tx.invoice.aggregate({
        _max: { sequenceNumber: true },
      });
      const nextSeq = (maxAgg._max.sequenceNumber ?? 0) + 1;
      const invoiceNumber = formatInvoiceNumber(nextSeq);

      savedInvoice = await tx.invoice.create({
        data: {
          sequenceNumber: nextSeq,
          invoiceNumber,
          restaurantId: params.restaurantId,
          year: params.year,
          month: params.month,
          periodStartUtc: startUtc,
          periodEndUtc: endUtc,
          totalOrders: activePeriodFees.length,
          grossSalesAed: filsToAedString(grossSalesFils),
          periodFeesAed: filsToAedString(periodFeesFils),
          adjustmentsAed: filsToAedString(adjustmentsFils),
          totalFeesAed: filsToAedString(netTotalFeesFils),
          lineItemsSnapshot: snapshot as unknown as Prisma.InputJsonValue,
          status: targetStatus,
          generatedAt: now,
        },
      });
    }

    if (activePeriodFees.length > 0) {
      await tx.platformFee.updateMany({
        where: { id: { in: activePeriodFees.map((f) => f.id) } },
        data: { invoiceId: savedInvoice.id },
      });
    }

    if (uncreditedPriorVoids.length > 0) {
      await tx.platformFee.updateMany({
        where: { id: { in: uncreditedPriorVoids.map((v) => v.id) } },
        data: { voidCreditInvoiceId: savedInvoice.id },
      });
    }

    if (params.actorUserId) {
      await tx.adminAuditLog.create({
        data: {
          actorUserId: params.actorUserId,
          actorEmail: params.actorEmail ?? "admin",
          action: targetStatus === "ISSUED" ? "INVOICE_ISSUED" : "INVOICE_DRAFT_GENERATED",
          targetType: "Invoice",
          targetId: savedInvoice.id,
          summary: `${savedInvoice.invoiceNumber} (${params.year}-${String(params.month).padStart(2, "0")}) for ${restaurant.nameEn}: AED ${savedInvoice.totalFeesAed} [${targetStatus}]`,
          afterJson: {
            invoiceNumber: savedInvoice.invoiceNumber,
            year: params.year,
            month: params.month,
            status: targetStatus,
            totalOrders: savedInvoice.totalOrders,
            periodFeesAed: savedInvoice.periodFeesAed.toFixed(2),
            adjustmentsAed: savedInvoice.adjustmentsAed.toFixed(2),
            totalFeesAed: savedInvoice.totalFeesAed.toFixed(2),
          },
        },
      });
    }

    return {
      invoice: savedInvoice,
      idempotentReuse: false,
    };
  });
}

/**
 * Transitions an invoice (`DRAFT -> ISSUED` via fresh calculation, or `ISSUED -> PAID`) and records an audit entry.
 */
export async function transitionInvoiceStatus(
  params: {
    invoiceId: string;
    nextStatus: "ISSUED" | "PAID";
    actorUserId: string;
    actorEmail: string;
  },
  db: PrismaClient = prisma,
) {
  const current = await db.invoice.findUnique({
    where: { id: params.invoiceId },
    include: { restaurant: { select: { nameEn: true } } },
  });

  if (!current) {
    throw new Error("Invoice not found");
  }

  if (params.nextStatus === "ISSUED") {
    if (current.status === "ISSUED" || current.status === "PAID") {
      return current;
    }
    const gen = await generateMonthlyInvoice(
      {
        restaurantId: current.restaurantId,
        year: current.year,
        month: current.month,
        targetStatus: "ISSUED",
        actorUserId: params.actorUserId,
        actorEmail: params.actorEmail,
      },
      db,
    );
    return gen.invoice;
  }

  // nextStatus === "PAID"
  if (current.status === "PAID") {
    return current;
  }
  if (current.status !== "ISSUED") {
    throw new Error("Issue a DRAFT invoice before marking it PAID.");
  }

  const paidAt = new Date();
  return db.$transaction(async (tx) => {
    const updated = await tx.invoice.update({
      where: { id: current.id },
      data: {
        status: "PAID",
        paidAt,
      },
    });

    await tx.adminAuditLog.create({
      data: {
        actorUserId: params.actorUserId,
        actorEmail: params.actorEmail,
        action: "INVOICE_MARKED_PAID",
        targetType: "Invoice",
        targetId: current.id,
        summary: `Marked ${current.invoiceNumber} (${current.restaurant.nameEn}) as PAID (AED ${current.totalFeesAed.toFixed(2)})`,
        beforeJson: { status: current.status },
        afterJson: { status: "PAID", paidAt: paidAt.toISOString() },
      },
    });

    return updated;
  });
}
