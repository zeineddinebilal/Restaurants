import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  buildProspectNormalizedKey,
  importProspectsCsvWithAudit,
  previewProspectCsvImport,
  PROSPECT_STATUSES,
} from "@/lib/admin/prospects";
import { requireApiRole } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";

const createSingleProspectSchema = z.object({
  mode: z.literal("create"),
  name: z.string().trim().min(2).max(160),
  area: z.string().trim().max(120).default(""),
  district: z.string().trim().max(120).optional(),
  city: z.string().trim().min(2).max(80).default("Dubai"),
  cuisine: z.string().trim().max(120).optional(),
  existingQrProvider: z.string().trim().max(120).optional(),
  whyFitNotes: z.string().trim().max(800).optional(),
  top30Rank: z.number().int().min(1).max(1000).nullable().optional(),
  status: z.enum(PROSPECT_STATUSES).default("GREY"),
  phone: z.string().trim().max(80).optional(),
  contactPerson: z.string().trim().max(120).optional(),
});

const csvActionSchema = z.object({
  mode: z.enum(["preview_csv", "import_csv"]),
  csvText: z.string().min(4).max(4_000_000),
});

export async function POST(req: NextRequest) {
  const authCheck = await requireApiRole(["ADMIN"]);
  if (!authCheck.ok) return authCheck.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const csvParsed = csvActionSchema.safeParse(body);
  if (csvParsed.success) {
    try {
      if (csvParsed.data.mode === "preview_csv") {
        const preview = await previewProspectCsvImport(csvParsed.data.csvText);
        return NextResponse.json({ preview });
      }
      const imported = await importProspectsCsvWithAudit({
        csvText: csvParsed.data.csvText,
        actorUserId: authCheck.user.id,
        actorEmail: authCheck.user.email ?? "admin",
      });
      return NextResponse.json({ imported });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "CSV import failed" },
        { status: 400 },
      );
    }
  }

  const singleParsed = createSingleProspectSchema.safeParse(body);
  if (!singleParsed.success) {
    return NextResponse.json({ error: "Invalid prospect payload" }, { status: 400 });
  }

  const d = singleParsed.data;
  const normalizedKey = buildProspectNormalizedKey(d.name, d.area || d.district || "");

  const created = await prisma.prospect.upsert({
    where: { normalizedKey },
    update: {
      city: d.city,
      cuisine: d.cuisine || null,
      existingQrProvider: d.existingQrProvider || null,
      whyFitNotes: d.whyFitNotes || null,
      top30Rank: d.top30Rank ?? null,
      status: d.status,
      phone: d.phone || null,
      contactPerson: d.contactPerson || null,
      lastUpdatedById: authCheck.user.id,
      lastUpdatedByEmail: authCheck.user.email ?? "admin",
    },
    create: {
      normalizedKey,
      name: d.name,
      area: d.area || d.district || "",
      district: d.district || null,
      city: d.city,
      cuisine: d.cuisine || null,
      existingQrProvider: d.existingQrProvider || null,
      whyFitNotes: d.whyFitNotes || null,
      top30Rank: d.top30Rank ?? null,
      status: d.status,
      source: "admin",
      phone: d.phone || null,
      contactPerson: d.contactPerson || null,
      lastUpdatedById: authCheck.user.id,
      lastUpdatedByEmail: authCheck.user.email ?? "admin",
    },
  });

  await prisma.adminAuditLog.create({
    data: {
      actorUserId: authCheck.user.id,
      actorEmail: authCheck.user.email ?? "admin",
      action: "PROSPECT_UPSERTED",
      targetType: "Prospect",
      targetId: created.id,
      summary: `Saved prospect "${created.name}" (${created.city}) [${created.status}]`,
    },
  });

  return NextResponse.json({ prospect: created }, { status: 201 });
}
