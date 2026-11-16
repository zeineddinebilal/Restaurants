import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { z } from "zod";
import { getBrandName } from "@/config/brand";
import { DEFAULT_GEMINI_MODEL, getGeminiConfig, runStructuredAgent } from "@/lib/agents/gemini";
import { createSignedGuestCookieValue, verifySignedGuestCookieValue } from "@/lib/auth/guest";
import { getDefaultHomeForRole, hasAllowedRole } from "@/lib/auth/rbac";
import { getDirection, pickLocalized } from "@/lib/i18n/dictionaries";
import { checkRateLimit, resetRateLimitBucketsForTest } from "@/lib/rate-limit";
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

  it("enforces role checks and role home routing", () => {
    assert.equal(hasAllowedRole("ADMIN", ["ADMIN"]), true);
    assert.equal(hasAllowedRole("DINER", ["ADMIN", "RESTAURANT_OWNER"]), false);
    assert.equal(getDefaultHomeForRole("DINER"), "/home");
    assert.equal(getDefaultHomeForRole("RESTAURANT_OWNER"), "/dashboard");
    assert.equal(getDefaultHomeForRole("RESTAURANT_STAFF"), "/dashboard/orders");
    assert.equal(getDefaultHomeForRole("ADMIN"), "/admin");
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

  it("executes the initial Prisma PostgreSQL migration cleanly on real PostgreSQL (PGlite)", async () => {
    const migrationPath = path.join(
      process.cwd(),
      "prisma",
      "migrations",
      "20261116000000_init",
      "migration.sql",
    );
    const sql = fs.readFileSync(migrationPath, "utf8");
    const pg = new PGlite();
    await pg.exec(sql);

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
