import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  updatePlatformSettingsWithAudit,
  updateRestaurantStatusWithAudit,
  updateUserAccountWithAudit,
} from "@/lib/admin/service";
import { loadLiveAuthenticatedUserById, requireApiRole } from "@/lib/auth/rbac";
import {
  generateMonthlyInvoice,
  getDubaiMonthBoundsUtc,
  parseInvoiceSnapshot,
} from "@/lib/billing/invoices";
import { startEphemeralPrismaPostgres } from "@/lib/__tests__/helpers/local-pg";

describe("Phase 7 — Asia/Dubai Month Boundaries, Frozen Invoices, Void Credits & Admin RBAC", () => {
  it("computes exact Asia/Dubai (UTC+4) midnight month boundaries", () => {
    const nov2026 = getDubaiMonthBoundsUtc(2026, 11);
    // 2026-11-01 00:00:00 Asia/Dubai == 2026-10-31 20:00:00.000Z
    assert.equal(nov2026.startUtc.toISOString(), "2026-10-31T20:00:00.000Z");
    // 2026-12-01 00:00:00 Asia/Dubai == 2026-11-30 20:00:00.000Z
    assert.equal(nov2026.endUtc.toISOString(), "2026-11-30T20:00:00.000Z");

    const dec2026 = getDubaiMonthBoundsUtc(2026, 12);
    assert.equal(dec2026.startUtc.toISOString(), "2026-11-30T20:00:00.000Z");
    assert.equal(dec2026.endUtc.toISOString(), "2026-12-31T20:00:00.000Z");
  });

  it("enforces Dubai month boundaries, sequential idempotent invoices, frozen ISSUED invoices, post-invoice void credits, and live DB ADMIN-only 403", async () => {
    const env = await startEphemeralPrismaPostgres();
    try {
      const [adminUser, ownerUser] = await Promise.all([
        env.prisma.user.create({
          data: {
            email: "admin@test.local",
            name: "Platform Admin",
            role: "ADMIN",
            isActive: true,
          },
        }),
        env.prisma.user.create({
          data: {
            email: "owner@test.local",
            name: "Restaurant Owner",
            role: "RESTAURANT_OWNER",
            isActive: true,
          },
        }),
      ]);

      // 1. Live DB role check: RESTAURANT_OWNER gets 403 on ADMIN-only routes
      const ownerAttempt = await requireApiRole(["ADMIN"], () =>
        loadLiveAuthenticatedUserById(ownerUser.id, env.prisma),
      );
      assert.equal(ownerAttempt.ok, false);
      if (!ownerAttempt.ok) {
        assert.equal(ownerAttempt.response.status, 403);
      }

      const adminAttempt = await requireApiRole(["ADMIN"], () =>
        loadLiveAuthenticatedUserById(adminUser.id, env.prisma),
      );
      assert.equal(adminAttempt.ok, true);

      // 2. Admin cannot deactivate or demote themselves
      const selfDeactivate = await updateUserAccountWithAudit(
        {
          targetUserId: adminUser.id,
          isActive: false,
          actorUserId: adminUser.id,
          actorEmail: adminUser.email,
        },
        env.prisma,
      );
      assert.equal(selfDeactivate.ok, false);
      if (!selfDeactivate.ok) {
        assert.equal(selfDeactivate.status, 400);
      }

      // 3. Settings range validation & audit log
      const badPct = await updatePlatformSettingsWithAudit(
        {
          input: {
            feePercentage: "105.00",
            feeCapAed: "1.00",
            currency: "AED",
            tableSessionTtlHours: 4,
          },
          actorUserId: adminUser.id,
          actorEmail: adminUser.email,
        },
        env.prisma,
      );
      assert.equal(badPct.ok, false);

      const goodSettings = await updatePlatformSettingsWithAudit(
        {
          input: {
            feePercentage: "8.50",
            feeCapAed: "1.25",
            currency: "AED",
            tableSessionTtlHours: 4,
          },
          actorUserId: adminUser.id,
          actorEmail: adminUser.email,
        },
        env.prisma,
      );
      assert.equal(goodSettings.ok, true);

      // 4. Create restaurant, table, session, and orders right around Dubai midnight boundaries
      const restaurant = await env.prisma.restaurant.create({
        data: {
          slug: "cedar-test-kitchen",
          nameEn: "Cedar Test Kitchen",
          nameAr: "مطبخ الأرز",
          status: "PENDING",
          ownerId: ownerUser.id,
        },
      });

      const approved = await updateRestaurantStatusWithAudit(
        {
          restaurantId: restaurant.id,
          status: "APPROVED",
          actorUserId: adminUser.id,
          actorEmail: adminUser.email,
        },
        env.prisma,
      );
      assert.equal(approved.ok, true);

      const table = await env.prisma.diningTable.create({
        data: {
          restaurantId: restaurant.id,
          tableCode: "T1",
          displayName: "Table 1",
        },
      });
      const session = await env.prisma.tableSession.create({
        data: {
          restaurantId: restaurant.id,
          tableId: table.id,
          shareCode: "SHARE-P7",
        },
      });

      // Order A: recorded 2026-10-31T21:30:00Z -> in UTC it's Oct 31, in Dubai (UTC+4) it's Nov 1 01:30!
      const orderNovDubai = await env.prisma.order.create({
        data: {
          restaurantId: restaurant.id,
          tableSessionId: session.id,
          tableId: table.id,
          status: "ACCEPTED",
          subtotalAed: "50.00",
        },
      });
      const feeNov = await env.prisma.platformFee.create({
        data: {
          orderId: orderNovDubai.id,
          restaurantId: restaurant.id,
          orderSubtotalAed: "50.00",
          feePercentageApplied: "10.00",
          feeCapAppliedAed: "1.00",
          feeAmountAed: "1.00",
          recordedAt: new Date("2026-10-31T21:30:00.000Z"),
        },
      });

      // Order B: recorded 2026-11-30T21:15:00Z -> in UTC it's Nov 30, in Dubai (UTC+4) it's Dec 1 01:15!
      const orderDecDubai = await env.prisma.order.create({
        data: {
          restaurantId: restaurant.id,
          tableSessionId: session.id,
          tableId: table.id,
          status: "ACCEPTED",
          subtotalAed: "8.00",
        },
      });
      await env.prisma.platformFee.create({
        data: {
          orderId: orderDecDubai.id,
          restaurantId: restaurant.id,
          orderSubtotalAed: "8.00",
          feePercentageApplied: "10.00",
          feeCapAppliedAed: "1.00",
          feeAmountAed: "0.80",
          recordedAt: new Date("2026-11-30T21:15:00.000Z"),
        },
      });

      // October 2026 Dubai invoice must have 0 orders (Order A belongs to November in Asia/Dubai!)
      const octInv = await generateMonthlyInvoice(
        {
          restaurantId: restaurant.id,
          year: 2026,
          month: 10,
          targetStatus: "ISSUED",
          actorUserId: adminUser.id,
          actorEmail: adminUser.email,
        },
        env.prisma,
      );
      assert.equal(octInv.invoice.invoiceNumber, "INV-000001");
      assert.equal(octInv.invoice.totalOrders, 0);
      assert.equal(octInv.invoice.totalFeesAed.toFixed(2), "0.00");

      // November 2026 Dubai invoice picks up ONLY Order A (AED 1.00) and excludes Order B (Dec 1 Dubai)
      const novInv = await generateMonthlyInvoice(
        {
          restaurantId: restaurant.id,
          year: 2026,
          month: 11,
          targetStatus: "ISSUED",
          actorUserId: adminUser.id,
          actorEmail: adminUser.email,
        },
        env.prisma,
      );
      assert.equal(novInv.invoice.invoiceNumber, "INV-000002");
      assert.equal(novInv.invoice.totalOrders, 1);
      assert.equal(novInv.invoice.totalFeesAed.toFixed(2), "1.00");

      // Idempotency: generating November 2026 again returns the exact same INV-000002 without duplicating
      const novRepeat = await generateMonthlyInvoice(
        {
          restaurantId: restaurant.id,
          year: 2026,
          month: 11,
          targetStatus: "ISSUED",
        },
        env.prisma,
      );
      assert.equal(novRepeat.idempotentReuse, true);
      assert.equal(novRepeat.invoice.id, novInv.invoice.id);
      assert.equal(novRepeat.invoice.invoiceNumber, "INV-000002");

      // 5. Void Order A AFTER November invoice was ISSUED:
      //    - November invoice MUST remain frozen at AED 1.00
      //    - December invoice MUST apply -1.00 adjustment against December's 0.80 fee => net -0.20
      await env.prisma.platformFee.update({
        where: { id: feeNov.id },
        data: {
          isVoided: true,
          voidedAt: new Date("2026-12-02T10:00:00.000Z"),
        },
      });

      const novStillFrozen = await generateMonthlyInvoice(
        {
          restaurantId: restaurant.id,
          year: 2026,
          month: 11,
          targetStatus: "ISSUED",
        },
        env.prisma,
      );
      assert.equal(novStillFrozen.idempotentReuse, true);
      assert.equal(novStillFrozen.invoice.totalFeesAed.toFixed(2), "1.00");

      // Generate December first as DRAFT, then promote to ISSUED (keeps sequential INV-000003)
      const decDraft = await generateMonthlyInvoice(
        {
          restaurantId: restaurant.id,
          year: 2026,
          month: 12,
          targetStatus: "DRAFT",
        },
        env.prisma,
      );
      assert.equal(decDraft.invoice.invoiceNumber, "INV-000003");
      assert.equal(decDraft.invoice.status, "DRAFT");
      assert.equal(decDraft.invoice.periodFeesAed.toFixed(2), "0.80");
      assert.equal(decDraft.invoice.adjustmentsAed.toFixed(2), "-1.00");
      assert.equal(decDraft.invoice.totalFeesAed.toFixed(2), "-0.20");

      const decIssued = await generateMonthlyInvoice(
        {
          restaurantId: restaurant.id,
          year: 2026,
          month: 12,
          targetStatus: "ISSUED",
          actorUserId: adminUser.id,
          actorEmail: adminUser.email,
        },
        env.prisma,
      );
      assert.equal(decIssued.invoice.id, decDraft.invoice.id);
      assert.equal(decIssued.invoice.invoiceNumber, "INV-000003");
      assert.equal(decIssued.invoice.status, "ISSUED");

      const decSnap = parseInvoiceSnapshot(decIssued.invoice.lineItemsSnapshot);
      assert.equal(decSnap.feeLines.length, 1);
      assert.equal(decSnap.adjustmentLines.length, 1);
      assert.equal(decSnap.adjustmentLines[0]!.originalInvoiceNumber, "INV-000002");
      assert.equal(decSnap.adjustmentLines[0]!.creditAmountAed, "-1.00");

      // January 2027 must NOT double-credit the void that was already credited on INV-000003
      const janIssued = await generateMonthlyInvoice(
        {
          restaurantId: restaurant.id,
          year: 2027,
          month: 1,
          targetStatus: "ISSUED",
        },
        env.prisma,
      );
      assert.equal(janIssued.invoice.invoiceNumber, "INV-000004");
      assert.equal(janIssued.invoice.adjustmentsAed.toFixed(2), "0.00");

      // Verify AdminAuditLog captured settings, restaurant approval, and invoice actions
      const auditCount = await env.prisma.adminAuditLog.count();
      assert.ok(auditCount >= 4);
    } finally {
      await env.stop();
    }
  });
});
