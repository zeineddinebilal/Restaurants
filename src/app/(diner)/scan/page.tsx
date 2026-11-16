import { QrScannerClient } from "@/app/(diner)/scan/QrScannerClient";
import { prisma } from "@/lib/db";
import { getI18nContext } from "@/lib/i18n/server";

export default async function QrScanPage() {
  const [{ locale }, demoRestaurant] = await Promise.all([
    getI18nContext(),
    process.env.DEMO_MODE === "true"
      ? prisma.restaurant.findFirst({
          where: { isDemo: true, status: "APPROVED" },
          select: { slug: true },
        })
      : Promise.resolve(null),
  ]);

  const demoTableHref = demoRestaurant ? `/r/${demoRestaurant.slug}/t/T1` : null;

  return <QrScannerClient locale={locale} demoTableHref={demoTableHref} />;
}
