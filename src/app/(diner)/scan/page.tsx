import { QrScannerClient } from "@/app/(diner)/scan/QrScannerClient";
import { prisma } from "@/lib/db";
import { getI18nContext } from "@/lib/i18n/server";

export default async function QrScanPage() {
  const [{ locale }, demoRestaurant] = await Promise.all([
    getI18nContext(),
    process.env.DEMO_MODE === "true"
      ? prisma.restaurant.findFirst({
          where: { isDemo: true, status: "APPROVED" },
          select: {
            slug: true,
            tables: {
              where: { isActive: true },
              orderBy: { tableCode: "asc" },
              take: 1,
              select: { tableCode: true, qrToken: true },
            },
          },
        })
      : Promise.resolve(null),
  ]);

  const demoTable = demoRestaurant?.tables[0];
  const demoTableHref =
    demoRestaurant && demoTable
      ? `/r/${demoRestaurant.slug}/t/${encodeURIComponent(demoTable.tableCode)}?k=${encodeURIComponent(demoTable.qrToken)}`
      : null;

  return <QrScannerClient locale={locale} demoTableHref={demoTableHref} />;
}
