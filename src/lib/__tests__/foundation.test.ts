import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { z } from "zod";
import { getBrandName } from "@/config/brand";
import { DEFAULT_GEMINI_MODEL, getGeminiConfig, runStructuredAgent } from "@/lib/agents/gemini";
import {
  isVerifiedGoogleSignIn,
  JWT_REFRESH_INTERVAL_MS,
  type RefreshableJwtToken,
  refreshJwtTokenClaims,
} from "@/lib/auth/config";
import { createSignedGuestCookieValue, verifySignedGuestCookieValue } from "@/lib/auth/guest";
import {
  evaluateRestaurantMembership,
  evaluateRoleGuard,
  getDefaultHomeForRole,
  hasAllowedRole,
} from "@/lib/auth/rbac";
import { getDirection, pickLocalized } from "@/lib/i18n/dictionaries";
import { checkRateLimit, getClientIp, resetRateLimitBucketsForTest } from "@/lib/rate-limit";
import { canUploadPhotos, StorageNotConfiguredError, uploadDishPhoto } from "@/lib/storage";

describe("Phase 2 Foundation — Brand, i18n/RTL, Auth/RBAC, Storage, AI, and Postgres DDL", () => {
  it("resolves English and Arabic brand names and RTL directions", () => {
    assert.ok(getBrandName("en").length > 0);
    assert.ok(getBrandName("ar").length > 0);
    assert.equal(getDirection("en"), "ltr");
    assert.equal(getDirection("ar"), "rtl");
    assert.equal(pickLocalized("Hummus", "حمص", "ar"), "حمص");
    assert.equal(pickLocalized("Hummus", "", "ar"), "Hummus");
    assert.equal(pickLocalized("Hummus", "حمص", "en"), "Hummus");
  });

  it("signs and verifies guest session tokens and rejects tampering", () => {
    const secret = "test-secret-with-at-least-32-characters!!";
    const signed = createSignedGuestCookieValue("gst_abc123", secret);
    assert.equal(verifySignedGuestCookieValue(signed, secret), "gst_abc123");

    assert.equal(verifySignedGuestCookieValue(`gst_evil.${signed.split(".")[1]}`, secret), null);
    assert.equal(verifySignedGuestCookieValue("invalid_token", secret), null);
  });

  it("enforces role checks, active user status, and active staff membership", () => {
    assert.equal(hasAllowedRole("ADMIN", ["ADMIN"]), true);
    assert.equal(hasAllowedRole("DINER", ["ADMIN", "RESTAURANT_OWNER"]), false);
    assert.equal(getDefaultHomeForRole("DINER"), "/home");
    assert.equal(getDefaultHomeForRole("RESTAURANT_OWNER"), "/dashboard");
    assert.equal(getDefaultHomeForRole("RESTAURANT_STAFF"), "/dashboard/orders");
    assert.equal(getDefaultHomeForRole("ADMIN"), "/admin");

    // Inactive user is rejected even if role matches
    const inactiveCheck = evaluateRoleGuard({
      user: { id: "u1", role: "ADMIN", locale: "en", isActive: false },
      allowedRoles: ["ADMIN"],
    });
    assert.deepEqual(inactiveCheck, { ok: false, status: 403, reason: "INACTIVE" });

    // Removed / deactivated staff loses restaurant access immediately
    assert.equal(
      evaluateRestaurantMembership({
        userId: "staff_removed",
        userRole: "RESTAURANT_STAFF",
        restaurant: { ownerId: "owner_1", activeMemberUserIds: ["staff_active"] },
      }),
      false,
    );
    assert.equal(
      evaluateRestaurantMembership({
        userId: "staff_active",
        userRole: "RESTAURANT_STAFF",
        restaurant: { ownerId: "owner_1", activeMemberUserIds: ["staff_active"] },
      }),
      true,
    );
    // Owner-only operations block staff
    assert.equal(
      evaluateRestaurantMembership({
        userId: "staff_active",
        userRole: "RESTAURANT_STAFF",
        ownerOnly: true,
        restaurant: { ownerId: "owner_1", activeMemberUserIds: ["staff_active"] },
      }),
      false,
    );
  });

  it("refreshes stale JWT roles after 5 minutes and invalidates suspended users", async () => {
    const t0 = 1_000_000;
    let dbLoads = 0;

    // Initial sign-in populates refreshedAt without querying DB
    const initial = await refreshJwtTokenClaims({
      token: {} as RefreshableJwtToken,
      initialUser: { id: "u1", role: "ADMIN", locale: "en", isActive: true },
      loadUserById: async () => {
        dbLoads++;
        return null;
      },
      nowMs: t0,
    });
    assert.ok(initial);
    assert.equal(initial.role, "ADMIN");
    assert.equal(dbLoads, 0);

    // Within 5 minutes: uses cached token without DB hit
    const fresh = await refreshJwtTokenClaims({
      token: { ...initial },
      loadUserById: async () => {
        dbLoads++;
        return null;
      },
      nowMs: t0 + JWT_REFRESH_INTERVAL_MS - 1000,
    });
    assert.ok(fresh);
    assert.equal(dbLoads, 0);

    // After 5 minutes: reloads from DB and picks up demoted role
    const demoted = await refreshJwtTokenClaims({
      token: { ...initial },
      loadUserById: async (id) => {
        dbLoads++;
        return { id, role: "DINER", locale: "ar", isActive: true };
      },
      nowMs: t0 + JWT_REFRESH_INTERVAL_MS + 1,
    });
    assert.ok(demoted);
    assert.equal(dbLoads, 1);
    assert.equal(demoted.role, "DINER");
    assert.equal(demoted.locale, "ar");

    // Suspended user returns null (session invalidated)
    const suspended = await refreshJwtTokenClaims({
      token: { ...initial },
      loadUserById: async (id) => ({ id, role: "DINER", locale: "en", isActive: false }),
      nowMs: t0 + JWT_REFRESH_INTERVAL_MS + 1,
    });
    assert.equal(suspended, null);
  });

  it("requires email_verified === true for Google OAuth account linking", () => {
    assert.equal(
      isVerifiedGoogleSignIn("google", "user@example.com", { email_verified: false }),
      false,
    );
    assert.equal(isVerifiedGoogleSignIn("google", "user@example.com", {}), false);
    assert.equal(
      isVerifiedGoogleSignIn("google", "user@example.com", { email_verified: true }),
      true,
    );
    assert.equal(isVerifiedGoogleSignIn("credentials", "user@example.com", undefined), true);
  });

  it("extracts trustworthy client IP (true-client-ip -> last XFF -> unknown)", () => {
    const withTrueClient = new Headers({
      "true-client-ip": "203.0.113.50",
      "x-forwarded-for": "1.2.3.4, 198.51.100.9",
    });
    assert.equal(getClientIp(withTrueClient), "203.0.113.50");

    // Spoofed leading XFF entry is ignored in favor of the last proxy-appended IP
    const spoofedXff = new Headers({
      "x-forwarded-for": "127.0.0.1, 10.0.0.5, 198.51.100.42",
    });
    assert.equal(getClientIp(spoofedXff), "198.51.100.42");

    assert.equal(getClientIp(new Headers()), "unknown");
  });

  it("disables photo uploads in production when S3 is not configured", async () => {
    const prodNoS3 = { nodeEnv: "production" };
    assert.deepEqual(canUploadPhotos(prodNoS3), {
      enabled: false,
      mode: "disabled",
      reason:
        "Photo storage is disabled in production until S3 environment variables are configured.",
    });

    await assert.rejects(
      () =>
        uploadDishPhoto({
          buffer: Buffer.from([1, 2, 3]),
          contentType: "image/png",
          restaurantId: "rest_1",
          config: prodNoS3,
        }),
      StorageNotConfiguredError,
    );

    const devNoS3 = { nodeEnv: "development" };
    assert.equal(canUploadPhotos(devNoS3).mode, "local-dev");
  });

  it("degrades gracefully when GEMINI_API_KEY is missing", async () => {
    const prevKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    try {
      const cfg = getGeminiConfig();
      assert.equal(cfg.configured, false);
      assert.equal(cfg.model, process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL);

      const res = await runStructuredAgent({
        agentName: "testAgent",
        systemInstruction: "Return JSON",
        contents: "Hello",
        schema: z.object({ ok: z.boolean() }),
      });

      assert.deepEqual(res, {
        ok: false,
        reason: "AI_NOT_CONFIGURED",
        message: "AI not configured",
      });
    } finally {
      if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
    }
  });

  it("rate limits burst requests within a sliding window", () => {
    resetRateLimitBucketsForTest();
    assert.equal(
      checkRateLimit({ key: "t1", limit: 2, windowMs: 60_000, nowMs: 1000 }).allowed,
      true,
    );
    assert.equal(
      checkRateLimit({ key: "t1", limit: 2, windowMs: 60_000, nowMs: 2000 }).allowed,
      true,
    );
    assert.equal(
      checkRateLimit({ key: "t1", limit: 2, windowMs: 60_000, nowMs: 3000 }).allowed,
      false,
    );
    assert.equal(
      checkRateLimit({ key: "t1", limit: 2, windowMs: 60_000, nowMs: 62_000 }).allowed,
      true,
    );
  });

  it("executes all Prisma PostgreSQL migrations cleanly on real PostgreSQL (PGlite)", async () => {
    const migrationsDir = path.join(process.cwd(), "prisma", "migrations");
    const dirs = fs
      .readdirSync(migrationsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();

    const pg = new PGlite();
    for (const dir of dirs) {
      const sql = fs.readFileSync(path.join(migrationsDir, dir, "migration.sql"), "utf8");
      await pg.exec(sql);
    }

    await pg.query(
      `INSERT INTO "PlatformSetting" ("id", "feePercentage", "feeCapAed", "currency", "tableSessionTtlHours", "updatedAt")
       VALUES ('default', 10.00, 1.00, 'AED', 4, NOW())`,
    );

    const settings = await pg.query<{ feePercentage: string; feeCapAed: string }>(
      `SELECT "feePercentage"::text, "feeCapAed"::text FROM "PlatformSetting" WHERE "id" = 'default'`,
    );
    assert.deepEqual(settings.rows[0], {
      feePercentage: "10.00",
      feeCapAed: "1.00",
    });

    await pg.close();
  });
});
