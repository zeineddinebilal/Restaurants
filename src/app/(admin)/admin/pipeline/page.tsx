import { PipelineAdminClient } from "@/app/(admin)/admin/pipeline/PipelineAdminClient";
import { parseNotesHistory } from "@/lib/admin/prospects";
import { requirePageRole } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { getI18nContext } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function AdminSalesPipelinePage() {
  const [, { locale }] = await Promise.all([requirePageRole(["ADMIN"]), getI18nContext()]);

  const prospects = await prisma.prospect.findMany({
    orderBy: [{ top30Rank: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }],
    include: {
      convertedRestaurant: {
        select: {
          id: true,
          slug: true,
          nameEn: true,
          status: true,
        },
      },
    },
    take: 1000,
  });

  const serialized = prospects.map((p) => ({
    id: p.id,
    name: p.name,
    area: p.area,
    district: p.district,
    city: p.city,
    cuisine: p.cuisine,
    priceTier: p.priceTier,
    address: p.address,
    website: p.website,
    instagram: p.instagram,
    phone: p.phone,
    ownership: p.ownership,
    existingQrProvider: p.existingQrProvider,
    whyFitNotes: p.whyFitNotes,
    top30Rank: p.top30Rank,
    status: p.status as "GREEN" | "GREY" | "RED",
    source: p.source,
    contactPerson: p.contactPerson,
    dateApproached: p.dateApproached,
    outcomeNotes: p.outcomeNotes,
    rewardOrOffer: p.rewardOrOffer,
    notesHistory: parseNotesHistory(p.notesHistory),
    inviteToken: p.inviteToken,
    inviteExpiresAtIso: p.inviteExpiresAt ? p.inviteExpiresAt.toISOString() : null,
    convertedRestaurant: p.convertedRestaurant,
    lastUpdatedByEmail: p.lastUpdatedByEmail,
    updatedAtIso: p.updatedAt.toISOString(),
  }));

  return <PipelineAdminClient locale={locale} initialProspects={serialized} />;
}
