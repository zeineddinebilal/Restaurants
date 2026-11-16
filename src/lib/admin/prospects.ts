import type { Prisma, PrismaClient, Prospect } from "@prisma/client";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { generateTableQrToken } from "@/lib/qr";
import { slugifyRestaurantName } from "@/lib/restaurant/access";

export const PROSPECT_STATUSES = ["GREEN", "GREY", "RED"] as const;
export type ProspectStatus = (typeof PROSPECT_STATUSES)[number];

export interface ProspectNoteEntry {
  id: string;
  text: string;
  actorEmail: string;
  createdAtIso: string;
}

export interface ParsedProspectRow {
  normalizedKey: string;
  name: string;
  area: string;
  district: string | null;
  city: string;
  cuisine: string | null;
  priceTier: string | null;
  address: string | null;
  website: string | null;
  instagram: string | null;
  phone: string | null;
  ownership: string | null;
  existingQrProvider: string | null;
  whyFitNotes: string | null;
  top30Rank: number | null;
  status: ProspectStatus;
  contactPerson: string | null;
  dateApproached: string | null;
  outcomeNotes: string | null;
  rewardOrOffer: string | null;
}

export function buildProspectNormalizedKey(name: string, area: string): string {
  const n = name.trim().toLowerCase().replace(/\s+/g, " ");
  const a = area.trim().toLowerCase().replace(/\s+/g, " ");
  return `${n}::${a}`;
}

export function normalizeProspectStatus(raw: string | null | undefined): ProspectStatus {
  const v = (raw ?? "").trim().toUpperCase();
  if (v === "GREEN" || v.includes("PARTNER") || v.includes("CONVERTED") || v.includes("🟢")) {
    return "GREEN";
  }
  if (
    v === "RED" ||
    v.includes("DECLINED") ||
    v.includes("CLOSED") ||
    v.includes("NOT INTERESTED") ||
    v.includes("🔴")
  ) {
    return "RED";
  }
  return "GREY";
}

/**
 * RFC-4180 compliant CSV tokenizer supporting UTF-8 BOM, quoted fields, commas, and multiline cells.
 */
export function parseCsvRecords(rawCsv: string): string[][] {
  const cleaned = rawCsv.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i]!;
    const next = cleaned[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentField += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentField += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      currentRow.push(currentField.trim());
      currentField = "";
    } else if (ch === "\r" && next === "\n") {
      currentRow.push(currentField.trim());
      if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = "";
      i++;
    } else if (ch === "\n" || ch === "\r") {
      currentRow.push(currentField.trim());
      if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = "";
    } else {
      currentField += ch;
    }
  }

  currentRow.push(currentField.trim());
  if (currentRow.some((cell) => cell.length > 0)) {
    rows.push(currentRow);
  }

  return rows;
}

function cleanOptionalCell(val: string | undefined, maxLen = 400): string | null {
  const trimmed = (val ?? "").trim();
  return trimmed ? trimmed.slice(0, maxLen) : null;
}

/**
 * Parses a prospect research CSV and deduplicates rows by `name + area` (later rows merge/win).
 */
export function parseProspectsCsv(csvText: string): ParsedProspectRow[] {
  const records = parseCsvRecords(csvText);
  if (records.length < 2) return [];

  const headerRow = records[0]!.map((h) => h.trim().toLowerCase());
  function colIndex(...candidates: string[]): number {
    for (const c of candidates) {
      const idx = headerRow.indexOf(c.toLowerCase());
      if (idx >= 0) return idx;
    }
    return -1;
  }

  const idxName = colIndex("name", "restaurant", "restaurant name");
  if (idxName < 0) {
    throw new Error('CSV must include a "Name" column.');
  }

  const idxTop30 = colIndex("top 30 rank", "top30rank", "rank");
  const idxCity = colIndex("city");
  const idxDistrict = colIndex("district");
  const idxArea = colIndex("area", "neighborhood", "neighbourhood");
  const idxCuisine = colIndex("cuisine");
  const idxPrice = colIndex("price", "price tier");
  const idxAddress = colIndex("address");
  const idxWebsite = colIndex("website");
  const idxInstagram = colIndex("instagram");
  const idxOwnership = colIndex("ownership");
  const idxQr = colIndex("qr / digital menu", "existing qr provider", "qr provider", "qr");
  const idxWhyFit = colIndex("why they fit", "why fit", "notes");
  const idxStatusFlag = colIndex("status flag");
  const idxStatus = colIndex("status");
  const idxPhone = colIndex("phone", "telephone", "whatsapp");
  const idxContact = colIndex("contact person", "contact");
  const idxDateApproached = colIndex("date approached");
  const idxOutcome = colIndex("outcome notes", "outcome");
  const idxReward = colIndex("reward / offer", "reward", "offer");

  const deduped = new Map<string, ParsedProspectRow>();

  for (let r = 1; r < records.length; r++) {
    const row = records[r]!;
    const name = (row[idxName] ?? "").trim();
    if (!name) continue;

    const district = idxDistrict >= 0 ? cleanOptionalCell(row[idxDistrict], 120) : null;
    const rawArea = idxArea >= 0 ? (row[idxArea] ?? "").trim() : "";
    const area = (rawArea || district || "").slice(0, 120);
    const city = (idxCity >= 0 ? (row[idxCity] ?? "").trim() : "") || "Dubai";

    const rankRaw = idxTop30 >= 0 ? Number.parseInt((row[idxTop30] ?? "").trim(), 10) : NaN;
    const top30Rank = Number.isFinite(rankRaw) && rankRaw > 0 ? rankRaw : null;

    const statusStr =
      (idxStatus >= 0 ? row[idxStatus] : "") ||
      (idxStatusFlag >= 0 ? row[idxStatusFlag] : "") ||
      "GREY";

    const normalizedKey = buildProspectNormalizedKey(name, area);
    deduped.set(normalizedKey, {
      normalizedKey,
      name: name.slice(0, 160),
      area,
      district,
      city: city.slice(0, 80),
      cuisine: idxCuisine >= 0 ? cleanOptionalCell(row[idxCuisine], 120) : null,
      priceTier: idxPrice >= 0 ? cleanOptionalCell(row[idxPrice], 40) : null,
      address: idxAddress >= 0 ? cleanOptionalCell(row[idxAddress], 300) : null,
      website: idxWebsite >= 0 ? cleanOptionalCell(row[idxWebsite], 300) : null,
      instagram: idxInstagram >= 0 ? cleanOptionalCell(row[idxInstagram], 160) : null,
      phone: idxPhone >= 0 ? cleanOptionalCell(row[idxPhone], 80) : null,
      ownership: idxOwnership >= 0 ? cleanOptionalCell(row[idxOwnership], 80) : null,
      existingQrProvider: idxQr >= 0 ? cleanOptionalCell(row[idxQr], 120) : null,
      whyFitNotes: idxWhyFit >= 0 ? cleanOptionalCell(row[idxWhyFit], 800) : null,
      top30Rank,
      status: normalizeProspectStatus(statusStr),
      contactPerson: idxContact >= 0 ? cleanOptionalCell(row[idxContact], 120) : null,
      dateApproached: idxDateApproached >= 0 ? cleanOptionalCell(row[idxDateApproached], 80) : null,
      outcomeNotes: idxOutcome >= 0 ? cleanOptionalCell(row[idxOutcome], 800) : null,
      rewardOrOffer: idxReward >= 0 ? cleanOptionalCell(row[idxReward], 240) : null,
    });
  }

  return Array.from(deduped.values());
}

function escapeCsvCell(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return "";
  let str = String(val);
  // Neutralize spreadsheet formula injection (`=`, `+` non-phone, `@`)
  if (/^[=@]/.test(str) || (/^[+-]/.test(str) && !/^\+?\d[\d\s()-]{5,}$/.test(str))) {
    str = `'${str}`;
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportProspectsToCsv(prospects: readonly Prospect[]): string {
  const headers = [
    "#",
    "Top 30 Rank",
    "City",
    "Name",
    "District",
    "Area",
    "Cuisine",
    "Price",
    "Address",
    "Website",
    "Instagram",
    "Ownership",
    "QR / Digital Menu",
    "Why They Fit",
    "Status",
    "Phone",
    "Contact Person",
    "Date Approached",
    "Outcome Notes",
    "Reward / Offer",
  ];

  const lines = [headers.map(escapeCsvCell).join(",")];
  prospects.forEach((p, idx) => {
    lines.push(
      [
        idx + 1,
        p.top30Rank ?? "",
        p.city,
        p.name,
        p.district ?? "",
        p.area,
        p.cuisine ?? "",
        p.priceTier ?? "",
        p.address ?? "",
        p.website ?? "",
        p.instagram ?? "",
        p.ownership ?? "",
        p.existingQrProvider ?? "",
        p.whyFitNotes ?? "",
        p.status,
        p.phone ?? "",
        p.contactPerson ?? "",
        p.dateApproached ?? "",
        p.outcomeNotes ?? "",
        p.rewardOrOffer ?? "",
      ]
        .map(escapeCsvCell)
        .join(","),
    );
  });

  return lines.join("\r\n");
}

export function parseNotesHistory(raw: unknown): ProspectNoteEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is ProspectNoteEntry =>
    Boolean(x && typeof x === "object" && "text" in x && typeof x.text === "string"),
  );
}

export async function previewProspectCsvImport(csvText: string, db: PrismaClient = prisma) {
  const parsedRows = parseProspectsCsv(csvText);
  if (parsedRows.length === 0) {
    return { totalUniqueRows: 0, newCount: 0, existingUpdateCount: 0, sampleRows: [] };
  }

  const existing = await db.prospect.findMany({
    where: {
      normalizedKey: { in: parsedRows.map((r) => r.normalizedKey) },
    },
    select: { normalizedKey: true },
  });
  const existingKeySet = new Set(existing.map((e) => e.normalizedKey));

  let newCount = 0;
  let existingUpdateCount = 0;
  for (const r of parsedRows) {
    if (existingKeySet.has(r.normalizedKey)) existingUpdateCount++;
    else newCount++;
  }

  return {
    totalUniqueRows: parsedRows.length,
    newCount,
    existingUpdateCount,
    sampleRows: parsedRows.slice(0, 15),
  };
}

export async function importProspectsCsvWithAudit(
  params: {
    csvText: string;
    actorUserId: string;
    actorEmail: string;
  },
  db: PrismaClient = prisma,
) {
  const parsedRows = parseProspectsCsv(params.csvText);
  if (parsedRows.length === 0) {
    throw new Error("No valid prospect rows found in CSV.");
  }

  return db.$transaction(async (tx) => {
    let createdCount = 0;
    let updatedCount = 0;

    for (const row of parsedRows) {
      const existing = await tx.prospect.findUnique({
        where: { normalizedKey: row.normalizedKey },
      });

      if (existing) {
        await tx.prospect.update({
          where: { id: existing.id },
          data: {
            name: row.name,
            area: row.area,
            district: row.district ?? existing.district,
            city: row.city || existing.city,
            cuisine: row.cuisine ?? existing.cuisine,
            priceTier: row.priceTier ?? existing.priceTier,
            address: row.address ?? existing.address,
            website: row.website ?? existing.website,
            instagram: row.instagram ?? existing.instagram,
            phone: row.phone ?? existing.phone,
            ownership: row.ownership ?? existing.ownership,
            existingQrProvider: row.existingQrProvider ?? existing.existingQrProvider,
            whyFitNotes: row.whyFitNotes ?? existing.whyFitNotes,
            top30Rank: row.top30Rank ?? existing.top30Rank,
            // Never downgrade an already converted GREEN restaurant partner during CSV re-import
            status: existing.convertedRestaurantId ? "GREEN" : row.status,
            contactPerson: row.contactPerson ?? existing.contactPerson,
            dateApproached: row.dateApproached ?? existing.dateApproached,
            outcomeNotes: row.outcomeNotes ?? existing.outcomeNotes,
            rewardOrOffer: row.rewardOrOffer ?? existing.rewardOrOffer,
            lastUpdatedById: params.actorUserId,
            lastUpdatedByEmail: params.actorEmail,
          },
        });
        updatedCount++;
      } else {
        await tx.prospect.create({
          data: {
            ...row,
            source: "csv_import",
            lastUpdatedById: params.actorUserId,
            lastUpdatedByEmail: params.actorEmail,
          },
        });
        createdCount++;
      }
    }

    await tx.adminAuditLog.create({
      data: {
        actorUserId: params.actorUserId,
        actorEmail: params.actorEmail,
        action: "PROSPECT_CSV_IMPORT",
        targetType: "Prospect",
        targetId: "batch",
        summary: `Imported ${parsedRows.length} unique prospects (${createdCount} new, ${updatedCount} deduplicated updates)`,
        afterJson: { createdCount, updatedCount },
      },
    });

    return { createdCount, updatedCount, total: parsedRows.length };
  });
}

export const updateProspectPatchSchema = z.object({
  status: z.enum(PROSPECT_STATUSES).optional(),
  top30Rank: z.number().int().min(1).max(1000).nullable().optional(),
  contactPerson: z.string().trim().max(120).nullable().optional(),
  dateApproached: z.string().trim().max(80).nullable().optional(),
  outcomeNotes: z.string().trim().max(800).nullable().optional(),
  rewardOrOffer: z.string().trim().max(240).nullable().optional(),
  existingQrProvider: z.string().trim().max(120).nullable().optional(),
  newNote: z.string().trim().min(1).max(600).optional(),
});

export async function updateProspectWithAudit(
  params: {
    prospectId: string;
    patch: z.infer<typeof updateProspectPatchSchema>;
    actorUserId: string;
    actorEmail: string;
  },
  db: PrismaClient = prisma,
) {
  return db.$transaction(async (tx) => {
    const existing = await tx.prospect.findUnique({ where: { id: params.prospectId } });
    if (!existing) {
      return { ok: false as const, status: 404 as const, error: "Prospect not found" };
    }

    const history = parseNotesHistory(existing.notesHistory);
    if (params.patch.newNote) {
      history.unshift({
        id: crypto.randomBytes(6).toString("hex"),
        text: params.patch.newNote,
        actorEmail: params.actorEmail,
        createdAtIso: new Date().toISOString(),
      });
    }

    const updated = await tx.prospect.update({
      where: { id: existing.id },
      data: {
        status: params.patch.status ?? existing.status,
        top30Rank:
          params.patch.top30Rank !== undefined ? params.patch.top30Rank : existing.top30Rank,
        contactPerson:
          params.patch.contactPerson !== undefined
            ? params.patch.contactPerson
            : existing.contactPerson,
        dateApproached:
          params.patch.dateApproached !== undefined
            ? params.patch.dateApproached
            : existing.dateApproached,
        outcomeNotes:
          params.patch.outcomeNotes !== undefined
            ? params.patch.outcomeNotes
            : existing.outcomeNotes,
        rewardOrOffer:
          params.patch.rewardOrOffer !== undefined
            ? params.patch.rewardOrOffer
            : existing.rewardOrOffer,
        existingQrProvider:
          params.patch.existingQrProvider !== undefined
            ? params.patch.existingQrProvider
            : existing.existingQrProvider,
        notesHistory: history as unknown as Prisma.InputJsonValue,
        lastUpdatedById: params.actorUserId,
        lastUpdatedByEmail: params.actorEmail,
      },
    });

    await tx.adminAuditLog.create({
      data: {
        actorUserId: params.actorUserId,
        actorEmail: params.actorEmail,
        action: "PROSPECT_UPDATED",
        targetType: "Prospect",
        targetId: existing.id,
        summary: `Updated prospect "${existing.name}" (${existing.area || existing.city}) -> status ${updated.status}`,
        beforeJson: { status: existing.status },
        afterJson: {
          status: updated.status,
          addedNote: Boolean(params.patch.newNote),
        },
      },
    });

    return { ok: true as const, prospect: updated };
  });
}

export async function generateProspectConvertInvite(
  params: {
    prospectId: string;
    actorUserId: string;
    actorEmail: string;
  },
  db: PrismaClient = prisma,
) {
  return db.$transaction(async (tx) => {
    const existing = await tx.prospect.findUnique({ where: { id: params.prospectId } });
    if (!existing) {
      return { ok: false as const, status: 404 as const, error: "Prospect not found" };
    }

    const token = existing.inviteToken ?? crypto.randomBytes(16).toString("hex");
    const updated = await tx.prospect.update({
      where: { id: existing.id },
      data: {
        inviteToken: token,
        lastUpdatedById: params.actorUserId,
        lastUpdatedByEmail: params.actorEmail,
      },
    });

    await tx.adminAuditLog.create({
      data: {
        actorUserId: params.actorUserId,
        actorEmail: params.actorEmail,
        action: "PROSPECT_CONVERT_INVITE_CREATED",
        targetType: "Prospect",
        targetId: existing.id,
        summary: `Generated owner signup invite link for "${existing.name}"`,
      },
    });

    return { ok: true as const, inviteToken: updated.inviteToken! };
  });
}

/**
 * Called inside the `/api/auth/register` transaction when an owner signs up through a
 * Sales Pipeline invite link (`?prospectInvite={token}`):
 * - Creates the owner's `Restaurant` + `Branch` + `T1` `DiningTable`
 * - Links `Prospect.convertedRestaurantId = createdRestaurant.id`
 * - Automatically turns `Prospect.status = "GREEN"`!
 */
export async function convertProspectOnOwnerSignupTx(params: {
  tx: Prisma.TransactionClient;
  inviteToken: string;
  ownerUserId: string;
  ownerEmail: string;
}) {
  const prospect = await params.tx.prospect.findUnique({
    where: { inviteToken: params.inviteToken.trim() },
  });

  if (!prospect || prospect.convertedRestaurantId) {
    return null;
  }

  const baseSlug = slugifyRestaurantName(prospect.name);
  const existingSlug = await params.tx.restaurant.findUnique({ where: { slug: baseSlug } });
  const slug = existingSlug ? `${baseSlug}-${Math.floor(1000 + Math.random() * 9000)}` : baseSlug;

  const createdRestaurant = await params.tx.restaurant.create({
    data: {
      slug,
      nameEn: prospect.name,
      nameAr: prospect.name,
      cuisine: prospect.cuisine || "Lebanese",
      status: "PENDING",
      ownerId: params.ownerUserId,
    },
  });

  const branch = await params.tx.branch.create({
    data: {
      restaurantId: createdRestaurant.id,
      nameEn: `${prospect.area || prospect.city} Branch`,
      nameAr: `فرع ${prospect.area || prospect.city}`,
      city: prospect.city || "Dubai",
      addressEn: prospect.address || null,
      isActive: true,
    },
  });

  await params.tx.diningTable.create({
    data: {
      restaurantId: createdRestaurant.id,
      branchId: branch.id,
      tableCode: "T1",
      displayName: "Table 1",
      capacity: 4,
      qrToken: generateTableQrToken(),
      isActive: true,
    },
  });

  const history = parseNotesHistory(prospect.notesHistory);
  history.unshift({
    id: crypto.randomBytes(6).toString("hex"),
    text: `Owner signed up via invite link (${params.ownerEmail}) — auto-converted to GREEN partner.`,
    actorEmail: "system",
    createdAtIso: new Date().toISOString(),
  });

  await params.tx.prospect.update({
    where: { id: prospect.id },
    data: {
      status: "GREEN",
      convertedRestaurantId: createdRestaurant.id,
      notesHistory: history as unknown as Prisma.InputJsonValue,
    },
  });

  return createdRestaurant;
}

export const publicDemoRequestSchema = z.object({
  restaurantName: z.string().trim().min(2).max(160),
  area: z.string().trim().min(2).max(120),
  city: z.string().trim().min(2).max(80).default("Dubai"),
  contactPerson: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(60),
  existingQrProvider: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(600).optional(),
});

export async function submitWebsiteDemoRequest(rawInput: unknown, db: PrismaClient = prisma) {
  const parsed = publicDemoRequestSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message || "Please complete all required fields.",
    };
  }

  const d = parsed.data;
  const normalizedKey = buildProspectNormalizedKey(d.restaurantName, d.area);
  const existing = await db.prospect.findUnique({ where: { normalizedKey } });

  const history = parseNotesHistory(existing?.notesHistory);
  history.unshift({
    id: crypto.randomBytes(6).toString("hex"),
    text: `Website demo request from ${d.contactPerson} (${d.phone})${d.notes ? `: ${d.notes}` : ""}`,
    actorEmail: "website",
    createdAtIso: new Date().toISOString(),
  });

  const saved = existing
    ? await db.prospect.update({
        where: { id: existing.id },
        data: {
          contactPerson: d.contactPerson,
          phone: d.phone,
          existingQrProvider: d.existingQrProvider || existing.existingQrProvider,
          notesHistory: history as unknown as Prisma.InputJsonValue,
        },
      })
    : await db.prospect.create({
        data: {
          normalizedKey,
          name: d.restaurantName,
          area: d.area,
          city: d.city,
          contactPerson: d.contactPerson,
          phone: d.phone,
          existingQrProvider: d.existingQrProvider || null,
          whyFitNotes: d.notes || null,
          status: "GREY",
          source: "website",
          notesHistory: history as unknown as Prisma.InputJsonValue,
        },
      });

  return { ok: true as const, prospectId: saved.id };
}
