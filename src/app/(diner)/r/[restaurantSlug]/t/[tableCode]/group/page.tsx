import { notFound } from "next/navigation";
import { GroupTableClient } from "@/app/(diner)/r/[restaurantSlug]/t/[tableCode]/group/GroupTableClient";
import { prisma } from "@/lib/db";
import { pickLocalized } from "@/lib/i18n/dictionaries";
import { getI18nContext } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function GroupTablePage({
  params,
}: {
  params: Promise<{ restaurantSlug: string; tableCode: string }>;
}) {
  const [{ restaurantSlug, tableCode }, { locale }] = await Promise.all([params, getI18nContext()]);

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: restaurantSlug },
    include: {
      tables: {
        where: { tableCode: { equals: tableCode, mode: "insensitive" }, isActive: true },
        take: 1,
      },
    },
  });

  if (!restaurant || restaurant.status === "SUSPENDED" || restaurant.tables.length === 0) {
    notFound();
  }

  return (
    <GroupTableClient
      locale={locale}
      restaurantSlug={restaurant.slug}
      restaurantName={pickLocalized(restaurant.nameEn, restaurant.nameAr, locale)}
      tableCode={restaurant.tables[0]!.tableCode}
    />
  );
}
