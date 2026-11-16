import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  type SerializedTableWithQr,
  TablesManagerClient,
} from "@/app/(restaurant)/dashboard/tables/TablesManagerClient";
import { requirePageRole } from "@/lib/auth/rbac";
import { pickLocalized } from "@/lib/i18n/dictionaries";
import { getI18nContext } from "@/lib/i18n/server";
import { buildTableQrPath, buildTableQrUrl, generateQrCodeSvg } from "@/lib/qr";
import { loadManagedRestaurants } from "@/lib/restaurant/loader";

export default async function RestaurantTablesPage({
  searchParams,
}: {
  searchParams: Promise<{ restaurantId?: string }>;
}) {
  const [user, { locale }, hdrs, sp] = await Promise.all([
    requirePageRole(["RESTAURANT_OWNER", "ADMIN"]),
    getI18nContext(),
    headers(),
    searchParams,
  ]);

  const { activeRestaurant } = await loadManagedRestaurants(user, sp.restaurantId);
  if (!activeRestaurant) {
    redirect("/dashboard");
  }

  const host = hdrs.get("x-forwarded-host") || hdrs.get("host") || "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  const origin = process.env.NEXT_PUBLIC_APP_URL?.trim() || `${proto}://${host}`;

  const branchMap = new Map(
    activeRestaurant.branches.map((b) => [b.id, pickLocalized(b.nameEn, b.nameAr, locale)]),
  );

  const tablesWithQr: SerializedTableWithQr[] = await Promise.all(
    activeRestaurant.tables.map(async (t) => {
      const qrPath = buildTableQrPath(activeRestaurant.slug, t.tableCode, t.qrToken);
      const qrUrl = buildTableQrUrl(origin, activeRestaurant.slug, t.tableCode, t.qrToken);
      const qrSvg = await generateQrCodeSvg(qrUrl);
      return {
        id: t.id,
        tableCode: t.tableCode,
        displayName: t.displayName,
        capacity: t.capacity,
        branchId: t.branchId,
        branchName: t.branchId ? (branchMap.get(t.branchId) ?? null) : null,
        isActive: t.isActive,
        qrPath,
        qrUrl,
        qrSvg,
      };
    }),
  );

  return (
    <TablesManagerClient
      locale={locale}
      restaurantId={activeRestaurant.id}
      restaurantName={pickLocalized(activeRestaurant.nameEn, activeRestaurant.nameAr, locale)}
      branches={activeRestaurant.branches.map((b) => ({
        id: b.id,
        nameEn: b.nameEn,
        nameAr: b.nameAr,
      }))}
      tables={tablesWithQr}
    />
  );
}
