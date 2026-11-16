import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  convertProspectOnOwnerSignupTx,
  exportProspectsToCsv,
  generateProspectConvertInvite,
  importProspectsCsvWithAudit,
  parseNotesHistory,
  parseProspectsCsv,
  previewProspectCsvImport,
  submitWebsiteDemoRequest,
  updateProspectWithAudit,
} from "@/lib/admin/prospects";
import { startEphemeralPrismaPostgres } from "@/lib/__tests__/helpers/local-pg";

const SYNTHETIC_RESEARCH_CSV = [
  "#,Top 30 Rank,Name,District,Area,Cuisine,Price,Address,Website,Instagram,Ownership,QR / Digital Menu,Why They Fit,Status Flag,Status,Phone,Contact Person,Date Approached,Outcome Notes",
  '1,3,"Synthetic Cedar Bistro",JLT,"Cluster D, JLT",Lebanese,$$,"Cluster D, Promenade",https://cedar.example.com,@cedarbistro,Independent,Qlub,"Checkout-only QR; menu says ""ask our team"" for allergies",Potential,,+971 50 111 2222,Rami,,"Needs pre-order allergen filter"',
  '2,1,"Synthetic Marina Grill",Dubai Marina,Dubai Marina,Mediterranean,$$$,"Marina Walk",https://marina.example.com,@marinagrill,Small chain,Foodics Pay,"High group table volume; dairy/gluten questions",,GREY,+971 50 333 4444,,,',
  // Duplicate Name + Area row (later row updates phone/rank/notes instead of creating a duplicate)
  '3,2,"Synthetic Cedar Bistro",JLT,"Cluster D, JLT",Lebanese,$$,"Cluster D, Promenade",https://cedar.example.com,@cedarbistro,Independent,Qlub,"Updated field visit note",Potential,GREY,+971 50 999 8888,Rami Haddad,2026-11-15,"Warm reception"',
  '4,,"Closed Synthetic Cafe",Downtown,Downtown,Cafe,$,"Boulevard",,,Independent,None,"Closed permanently",Declined,RED,,,,',
].join("\r\n");

describe("Phase 7.6 — Research-Driven Upgrades (CRM, Allergen Matrix, Payment QR, Copy Guard)", () => {
  it("parses research CSV columns, handles quoted commas, maps statuses, and deduplicates by name + area", () => {
    const rows = parseProspectsCsv(SYNTHETIC_RESEARCH_CSV);
    assert.equal(rows.length, 3, "Duplicate Name + Area rows must be merged");

    const cedar = rows.find((r) => r.name === "Synthetic Cedar Bistro");
    assert.ok(cedar);
    assert.equal(cedar.top30Rank, 2);
    assert.equal(cedar.area, "Cluster D, JLT");
    assert.equal(cedar.existingQrProvider, "Qlub");
    assert.equal(cedar.phone, "+971 50 999 8888");
    assert.equal(cedar.contactPerson, "Rami Haddad");
    assert.equal(cedar.status, "GREY");

    const closed = rows.find((r) => r.name === "Closed Synthetic Cafe");
    assert.ok(closed);
    assert.equal(closed.status, "RED");
  });

  it("exports CSV safely and neutralizes spreadsheet formula injection while preserving +971 phone numbers", () => {
    const csv = exportProspectsToCsv([
      {
        id: "p_1",
        normalizedKey: "test::jlt",
        name: "=CMD|' /C calc'!A0",
        area: "JLT",
        district: "JLT",
        city: "Dubai",
        cuisine: "Lebanese",
        priceTier: "$$",
        address: "Cluster A",
        website: null,
        instagram: "@handle",
        phone: "+971 50 123 4567",
        ownership: "Independent",
        existingQrProvider: "Qlub",
        whyFitNotes: "Line 1, with comma",
        top30Rank: 1,
        status: "GREY",
        source: "admin",
        contactPerson: "\t=SUM(A1:A2)",
        dateApproached: "\r=1+1",
        outcomeNotes: null,
        rewardOrOffer: null,
        notesHistory: [],
        inviteToken: null,
        inviteExpiresAt: null,
        convertedRestaurantId: null,
        lastUpdatedById: null,
        lastUpdatedByEmail: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    // Formula injection (`=CMD...`, `@handle`, `\t...`, `\r...`) prefixed with single quote, while `+971...` phone stays clean
    assert.ok(csv.includes("'=CMD|"));
    assert.ok(csv.includes("'@handle"));
    assert.ok(csv.includes("'\t=SUM(A1:A2)"));
    assert.ok(csv.includes("'\r=1+1"));
    assert.ok(csv.includes("+971 50 123 4567"));
    assert.ok(csv.includes('"Line 1, with comma"'));
  });

  it("enforces the legal wording rule: never claims forbidden food-code compliance anywhere in repo", () => {
    const forbiddenPhrase = ["compliant with", "Dubai Food Code"].join(" ").toLowerCase();
    const rootsToScan = ["src", "prisma"];
    const rootFiles = ["README.md", "PLAN.md", "DEMO.md"];

    function walkFiles(dir: string): string[] {
      const out: string[] = [];
      if (!fs.existsSync(dir)) return out;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          out.push(...walkFiles(full));
        } else if (/\.(ts|tsx|md|sql|prisma)$/i.test(entry.name)) {
          out.push(full);
        }
      }
      return out;
    }

    const repoRoot = process.cwd();
    const files = [
      ...rootsToScan.flatMap((r) => walkFiles(path.join(repoRoot, r))),
      ...rootFiles.map((f) => path.join(repoRoot, f)).filter((p) => fs.existsSync(p)),
    ];

    for (const file of files) {
      const content = fs.readFileSync(file, "utf8").toLowerCase();
      assert.equal(
        content.includes(forbiddenPhrase),
        false,
        `Forbidden legal claim found in ${path.relative(repoRoot, file)}`,
      );
    }

    // Also verify no prospect CSV files exist in the repository
    const rootEntries = fs.readdirSync(repoRoot);
    for (const name of rootEntries) {
      assert.equal(/prospect.*\.csv$/i.test(name), false, `Prospect CSV must not exist: ${name}`);
    }
  });

  it("runs full PostgreSQL CRM lifecycle: CSV preview/import, audit logs, notes history, owner invite conversion -> GREEN, and website demo requests", async () => {
    const handle = await startEphemeralPrismaPostgres();
    try {
      const { prisma } = handle;

      const admin = await prisma.user.create({
        data: {
          email: "crm-admin@example.com",
          name: "CRM Admin",
          role: "ADMIN",
        },
      });

      // 1. Preview before import
      const preview = await previewProspectCsvImport(SYNTHETIC_RESEARCH_CSV, prisma);
      assert.equal(preview.totalUniqueRows, 3);
      assert.equal(preview.newCount, 3);
      assert.equal(preview.existingUpdateCount, 0);

      // 2. Import CSV with audit log
      const firstImport = await importProspectsCsvWithAudit(
        {
          csvText: SYNTHETIC_RESEARCH_CSV,
          actorUserId: admin.id,
          actorEmail: admin.email,
        },
        prisma,
      );
      assert.equal(firstImport.createdCount, 3);
      assert.equal(firstImport.updatedCount, 0);

      // Re-preview shows 0 new, 3 existing updates
      const secondPreview = await previewProspectCsvImport(SYNTHETIC_RESEARCH_CSV, prisma);
      assert.equal(secondPreview.newCount, 0);
      assert.equal(secondPreview.existingUpdateCount, 3);

      // 3. Inline update + timestamped note in notesHistory
      const marina = await prisma.prospect.findFirstOrThrow({
        where: { name: "Synthetic Marina Grill" },
      });
      const updatedRes = await updateProspectWithAudit(
        {
          prospectId: marina.id,
          patch: {
            contactPerson: "GM Tariq",
            rewardOrOffer: "First 30 days waived",
            newNote: "Visited before lunch service; interested in Qlub coexistence.",
          },
          actorUserId: admin.id,
          actorEmail: admin.email,
        },
        prisma,
      );
      assert.equal(updatedRes.ok, true);
      if (updatedRes.ok) {
        const notes = parseNotesHistory(updatedRes.prospect.notesHistory);
        assert.equal(notes.length, 1);
        assert.equal(notes[0]?.actorEmail, "crm-admin@example.com");
        assert.match(notes[0]?.text ?? "", /Qlub coexistence/);
      }

      // 4. Generate Convert-to-Restaurant invite, test regenerate (invalidates old token), expiry, and CAS race protection
      const initialInviteRes = await generateProspectConvertInvite(
        {
          prospectId: marina.id,
          actorUserId: admin.id,
          actorEmail: admin.email,
        },
        prisma,
      );
      assert.equal(initialInviteRes.ok, true);
      if (!initialInviteRes.ok) throw new Error("Expected initial invite token");

      // Regenerating issues a new 14-day token and invalidates the old one
      const inviteRes = await generateProspectConvertInvite(
        {
          prospectId: marina.id,
          actorUserId: admin.id,
          actorEmail: admin.email,
          regenerate: true,
        },
        prisma,
      );
      assert.equal(inviteRes.ok, true);
      if (!inviteRes.ok) throw new Error("Expected regenerated invite token");
      assert.notEqual(inviteRes.inviteToken, initialInviteRes.inviteToken);

      // Old invalidated token fails cleanly without creating a restaurant
      const oldTokenAttempt = await prisma.$transaction(async (tx) => {
        const u = await tx.user.create({
          data: { email: "old-token@example.com", name: "Old Token", role: "RESTAURANT_OWNER" },
        });
        return convertProspectOnOwnerSignupTx({
          tx,
          inviteToken: initialInviteRes.inviteToken,
          ownerUserId: u.id,
          ownerEmail: u.email,
        });
      });
      assert.equal(oldTokenAttempt.converted, false);

      // Expired token check (15 days in the future > 14-day TTL) fails cleanly
      const fifteenDaysLater = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
      const expiredAttempt = await prisma.$transaction(async (tx) => {
        const u = await tx.user.create({
          data: { email: "expired-token@example.com", name: "Expired", role: "RESTAURANT_OWNER" },
        });
        return convertProspectOnOwnerSignupTx({
          tx,
          inviteToken: inviteRes.inviteToken,
          ownerUserId: u.id,
          ownerEmail: u.email,
          now: fifteenDaysLater,
        });
      });
      assert.equal(expiredAttempt.converted, false);

      // Concurrent CAS race: two simultaneous signups with the exact same valid token -> ONLY ONE converts!
      const [raceA, raceB] = await Promise.all([
        prisma.$transaction(async (tx) => {
          const ownerA = await tx.user.create({
            data: { email: "tariq-a@example.com", name: "Tariq A", role: "RESTAURANT_OWNER" },
          });
          return convertProspectOnOwnerSignupTx({
            tx,
            inviteToken: inviteRes.inviteToken,
            ownerUserId: ownerA.id,
            ownerEmail: ownerA.email,
          });
        }),
        prisma.$transaction(async (tx) => {
          const ownerB = await tx.user.create({
            data: { email: "tariq-b@example.com", name: "Tariq B", role: "RESTAURANT_OWNER" },
          });
          return convertProspectOnOwnerSignupTx({
            tx,
            inviteToken: inviteRes.inviteToken,
            ownerUserId: ownerB.id,
            ownerEmail: ownerB.email,
          });
        }),
      ]);

      const winners = [raceA, raceB].filter((r) => r.converted);
      const losers = [raceA, raceB].filter((r) => !r.converted);
      assert.equal(winners.length, 1, "CAS must allow exactly ONE concurrent conversion");
      assert.equal(
        losers.length,
        1,
        "Second concurrent signup must not create a duplicate restaurant",
      );
      const convertedRestaurant = winners[0]!.restaurant;
      assert.equal(convertedRestaurant.nameEn, "Synthetic Marina Grill");

      const marinaRestaurantsCount = await prisma.restaurant.count({
        where: { nameEn: "Synthetic Marina Grill" },
      });
      assert.equal(marinaRestaurantsCount, 1);

      const marinaAfterConvert = await prisma.prospect.findUniqueOrThrow({
        where: { id: marina.id },
      });
      assert.equal(marinaAfterConvert.status, "GREEN");
      assert.equal(marinaAfterConvert.convertedRestaurantId, convertedRestaurant.id);
      assert.equal(marinaAfterConvert.inviteToken, null);

      // Re-importing CSV where Marina was GREY must NOT downgrade an already converted GREEN partner!
      await importProspectsCsvWithAudit(
        {
          csvText: SYNTHETIC_RESEARCH_CSV,
          actorUserId: admin.id,
          actorEmail: admin.email,
        },
        prisma,
      );
      const marinaAfterReimport = await prisma.prospect.findUniqueOrThrow({
        where: { id: marina.id },
      });
      assert.equal(marinaAfterReimport.status, "GREEN");

      // 5. Public website "Request a demo":
      // 5a. New restaurant -> creates GREY + source "website"
      const webRes = await submitWebsiteDemoRequest(
        {
          restaurantName: "Jumeirah Olive House",
          area: "Jumeirah 1",
          city: "Dubai",
          contactPerson: "Nadia",
          phone: "+971 55 222 3333",
          existingQrProvider: "FineDine",
          notes: "45-table terrace",
        },
        prisma,
      );
      assert.equal(webRes.ok, true);
      if (webRes.ok) {
        const webProspect = await prisma.prospect.findUniqueOrThrow({
          where: { id: webRes.prospectId },
        });
        assert.equal(webProspect.status, "GREY");
        assert.equal(webProspect.source, "website");
        assert.equal(webProspect.existingQrProvider, "FineDine");
      }

      // 5b. Existing curated CRM prospect -> NEVER overwrites non-empty contactPerson, phone, QR, or status; caps notesHistory at 200!
      const cedarBefore = await prisma.prospect.findFirstOrThrow({
        where: { name: "Synthetic Cedar Bistro" },
      });
      const prefilled205Notes = Array.from({ length: 205 }, (_, i) => ({
        id: `n_${i}`,
        text: `Historical note ${i}`,
        actorEmail: "admin@example.com",
        createdAtIso: new Date().toISOString(),
      }));
      await prisma.prospect.update({
        where: { id: cedarBefore.id },
        data: { status: "RED", notesHistory: prefilled205Notes },
      });

      const spoofAttempt = await submitWebsiteDemoRequest(
        {
          restaurantName: "Synthetic Cedar Bistro",
          area: "Cluster D, JLT",
          city: "Dubai",
          contactPerson: "Attacker Spoof",
          phone: "+971 50 000 0000",
          existingQrProvider: "SpoofQR",
          notes: "Trying to overwrite curated fields",
        },
        prisma,
      );
      assert.equal(spoofAttempt.ok, true);

      const cedarAfter = await prisma.prospect.findUniqueOrThrow({
        where: { id: cedarBefore.id },
      });
      assert.equal(
        cedarAfter.contactPerson,
        "Rami Haddad",
        "Must not overwrite non-empty contactPerson",
      );
      assert.equal(cedarAfter.phone, "+971 50 999 8888", "Must not overwrite non-empty phone");
      assert.equal(
        cedarAfter.existingQrProvider,
        "Qlub",
        "Must not overwrite non-empty QR provider",
      );
      assert.equal(cedarAfter.status, "RED", "Must not overwrite existing CRM status");
      const cappedNotes = parseNotesHistory(cedarAfter.notesHistory);
      assert.equal(cappedNotes.length, 200, "notesHistory must be capped at 200 entries");
      assert.match(cappedNotes[0]?.text ?? "", /Attacker Spoof/);

      // 6. Verify Restaurant allergenPersonInCharge, existingPaymentProvider, and MenuItem.caloriesKcal
      const updatedRest = await prisma.restaurant.update({
        where: { id: convertedRestaurant.id },
        data: {
          allergenPersonInCharge: "Chef Tariq",
          existingPaymentProvider: "FOODICS_PAY",
          existingPaymentUrl: "https://pay.foodics.example/table-1",
        },
      });
      assert.equal(updatedRest.allergenPersonInCharge, "Chef Tariq");
      assert.equal(updatedRest.existingPaymentProvider, "FOODICS_PAY");

      const cat = await prisma.menuCategory.create({
        data: {
          restaurantId: convertedRestaurant.id,
          nameEn: "Grills",
          nameAr: "مشاوي",
        },
      });
      const dish = await prisma.menuItem.create({
        data: {
          restaurantId: convertedRestaurant.id,
          categoryId: cat.id,
          nameEn: "Shish Tawook",
          nameAr: "شيش طاووق",
          priceAed: "42.00",
          caloriesKcal: 540,
          isPublished: true,
        },
      });
      assert.equal(dish.caloriesKcal, 540);

      // Verify AdminAuditLog recorded all CRM actions
      const auditCount = await prisma.adminAuditLog.count({
        where: { targetType: "Prospect" },
      });
      assert.ok(auditCount >= 4, `Expected >= 4 Prospect audit logs, got ${auditCount}`);
    } finally {
      await handle.stop();
    }
  });
});
