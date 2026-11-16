import type { PrismaClient, RestaurantStatus, Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { aedToFils, filsToAedString, percentageToBps } from "@/lib/money";

export const platformSettingsInputSchema = z.object({
  feePercentage: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, "Fee percentage must be a non-negative number up to 2 decimals.")
    .refine((val) => {
      try {
        const bps = percentageToBps(val);
        return bps >= 0 && bps <= 10000;
      } catch {
        return false;
      }
    }, "Fee percentage must be between 0% and 100%."),
  feeCapAed: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, "Fee cap must be a non-negative AED amount up to 2 decimals.")
    .refine((val) => {
      try {
        const fils = aedToFils(val);
        return fils >= 0 && fils <= 10_000_00; // 0 to AED 10,000.00
      } catch {
        return false;
      }
    }, "Fee cap must be >= AED 0.00."),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter ISO code (e.g. AED)."),
  tableSessionTtlHours: z.number().int().min(1).max(24),
});

export type PlatformSettingsInput = z.infer<typeof platformSettingsInputSchema>;

/**
 * Updates `PlatformSetting` (`id = "default"`), affecting ONLY future order acceptances
 * (existing `PlatformFee` rows keep their snapshotted `feePercentageApplied` & `feeCapAppliedAed`),
 * and writes an immutable `AdminAuditLog` entry of who changed what and when.
 */
export async function updatePlatformSettingsWithAudit(
  params: {
    input: unknown;
    actorUserId: string;
    actorEmail: string;
  },
  db: PrismaClient = prisma,
) {
  const parsed = platformSettingsInputSchema.safeParse(params.input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message || "Invalid platform settings",
    };
  }

  const normalizedPct = filsToAedString(percentageToBps(parsed.data.feePercentage));
  const normalizedCap = filsToAedString(aedToFils(parsed.data.feeCapAed));

  const updated = await db.$transaction(async (tx) => {
    const previous = await tx.platformSetting.findUnique({
      where: { id: "default" },
    });

    const next = await tx.platformSetting.upsert({
      where: { id: "default" },
      update: {
        feePercentage: normalizedPct,
        feeCapAed: normalizedCap,
        currency: parsed.data.currency,
        tableSessionTtlHours: parsed.data.tableSessionTtlHours,
      },
      create: {
        id: "default",
        feePercentage: normalizedPct,
        feeCapAed: normalizedCap,
        currency: parsed.data.currency,
        tableSessionTtlHours: parsed.data.tableSessionTtlHours,
      },
    });

    await tx.adminAuditLog.create({
      data: {
        actorUserId: params.actorUserId,
        actorEmail: params.actorEmail,
        action: "PLATFORM_SETTINGS_UPDATED",
        targetType: "PlatformSetting",
        targetId: "default",
        summary: `Updated fee settings to ${normalizedPct}% capped at ${parsed.data.currency} ${normalizedCap} (session TTL ${parsed.data.tableSessionTtlHours}h)`,
        beforeJson: previous
          ? {
              feePercentage: previous.feePercentage.toFixed(2),
              feeCapAed: previous.feeCapAed.toFixed(2),
              currency: previous.currency,
              tableSessionTtlHours: previous.tableSessionTtlHours,
            }
          : undefined,
        afterJson: {
          feePercentage: next.feePercentage.toFixed(2),
          feeCapAed: next.feeCapAed.toFixed(2),
          currency: next.currency,
          tableSessionTtlHours: next.tableSessionTtlHours,
        },
      },
    });

    return next;
  });

  return { ok: true as const, settings: updated };
}

/**
 * Approves or suspends a restaurant and records an audit log entry.
 */
export async function updateRestaurantStatusWithAudit(
  params: {
    restaurantId: string;
    status: RestaurantStatus;
    actorUserId: string;
    actorEmail: string;
  },
  db: PrismaClient = prisma,
) {
  return db.$transaction(async (tx) => {
    const existing = await tx.restaurant.findUnique({
      where: { id: params.restaurantId },
      select: { id: true, nameEn: true, slug: true, status: true },
    });

    if (!existing) {
      return { ok: false as const, status: 404 as const, error: "Restaurant not found" };
    }

    const updated = await tx.restaurant.update({
      where: { id: existing.id },
      data: { status: params.status },
    });

    await tx.adminAuditLog.create({
      data: {
        actorUserId: params.actorUserId,
        actorEmail: params.actorEmail,
        action: `RESTAURANT_${params.status}`,
        targetType: "Restaurant",
        targetId: existing.id,
        summary: `Changed restaurant "${existing.nameEn}" (${existing.slug}) status from ${existing.status} to ${params.status}`,
        beforeJson: { status: existing.status },
        afterJson: { status: params.status },
      },
    });

    return { ok: true as const, restaurant: updated };
  });
}

/**
 * Activates/deactivates or updates role on a user account with self-deactivation protection and audit logging.
 */
export async function updateUserAccountWithAudit(
  params: {
    targetUserId: string;
    isActive?: boolean;
    role?: Role;
    actorUserId: string;
    actorEmail: string;
  },
  db: PrismaClient = prisma,
) {
  if (params.targetUserId === params.actorUserId) {
    if (params.isActive === false) {
      return {
        ok: false as const,
        status: 400 as const,
        error: "You cannot deactivate your own admin account.",
      };
    }
    if (params.role && params.role !== "ADMIN") {
      return {
        ok: false as const,
        status: 400 as const,
        error: "You cannot remove ADMIN role from your own account.",
      };
    }
  }

  return db.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({
      where: { id: params.targetUserId },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });

    if (!existing) {
      return { ok: false as const, status: 404 as const, error: "User not found" };
    }

    const nextActive = params.isActive ?? existing.isActive;
    const nextRole = params.role ?? existing.role;

    const updated = await tx.user.update({
      where: { id: existing.id },
      data: {
        isActive: nextActive,
        role: nextRole,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    await tx.adminAuditLog.create({
      data: {
        actorUserId: params.actorUserId,
        actorEmail: params.actorEmail,
        action: "USER_ACCOUNT_UPDATED",
        targetType: "User",
        targetId: existing.id,
        summary: `Updated user ${existing.email}: isActive=${nextActive}, role=${nextRole}`,
        beforeJson: { isActive: existing.isActive, role: existing.role },
        afterJson: { isActive: nextActive, role: nextRole },
      },
    });

    return { ok: true as const, user: updated };
  });
}
