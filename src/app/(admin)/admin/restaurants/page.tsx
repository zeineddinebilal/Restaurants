import {
  type AdminRestaurantRow,
  RestaurantsAdminClient,
} from "@/app/(admin)/admin/restaurants/RestaurantsAdminClient";
import { requirePageRole } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { getI18nContext } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function AdminRestaurantsPage() {
  const [, { locale }, restaurants] = await Promise.all([
    requirePageRole(["ADMIN"]),
    getI18nContext(),
    prisma.restaurant.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: {
        owner: { select: { name: true, email: true } },
        _count: { select: { menuItems: true, orders: true } },
      },
    }),
  ]);

  const rows: AdminRestaurantRow[] = restaurants.map((r) => ({
    id: r.id,
    slug: r.slug,
    nameEn: r.nameEn,
    nameAr: r.nameAr,
    cuisine: r.cuisine,
    status: r.status,
    isDemo: r.isDemo,
    ownerEmail: r.owner.email,
    ownerName: r.owner.name,
    menuItemCount: r._count.menuItems,
    orderCount: r._count.orders,
    createdAtIso: r.createdAt.toISOString(),
  }));

  return <RestaurantsAdminClient locale={locale} initialRestaurants={rows} />;
}
