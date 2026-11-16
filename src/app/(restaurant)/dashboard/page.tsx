import {
  RestaurantSetupClient,
  type SerializedRestaurantSummary,
} from "@/app/(restaurant)/dashboard/RestaurantSetupClient";
import { requirePageRole } from "@/lib/auth/rbac";
import { getI18nContext } from "@/lib/i18n/server";
import { loadManagedRestaurants } from "@/lib/restaurant/loader";

export default async function RestaurantDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ restaurantId?: string; inviteNotice?: string }>;
}) {
  const [user, { locale }, sp] = await Promise.all([
    requirePageRole(["RESTAURANT_OWNER", "ADMIN"]),
    getI18nContext(),
    searchParams,
  ]);

  const { restaurants, activeRestaurant } = await loadManagedRestaurants(user, sp.restaurantId);

  let serializedActive: SerializedRestaurantSummary | null = null;
  if (activeRestaurant) {
    const allItems = activeRestaurant.categories.flatMap((c) => c.items);
    serializedActive = {
      id: activeRestaurant.id,
      slug: activeRestaurant.slug,
      nameEn: activeRestaurant.nameEn,
      nameAr: activeRestaurant.nameAr,
      cuisine: activeRestaurant.cuisine,
      descriptionEn: activeRestaurant.descriptionEn,
      descriptionAr: activeRestaurant.descriptionAr,
      allergenPersonInCharge: activeRestaurant.allergenPersonInCharge,
      existingPaymentProvider: activeRestaurant.existingPaymentProvider,
      existingPaymentUrl: activeRestaurant.existingPaymentUrl,
      status: activeRestaurant.status,
      branches: activeRestaurant.branches.map((b) => ({
        id: b.id,
        nameEn: b.nameEn,
        nameAr: b.nameAr,
        city: b.city,
        addressEn: b.addressEn,
        addressAr: b.addressAr,
        isActive: b.isActive,
      })),
      members: activeRestaurant.members.map((m) => ({
        id: m.id,
        branchId: m.branchId,
        isActive: m.isActive,
        user: m.user,
      })),
      stats: {
        totalDishes: allItems.length,
        verifiedDishes: allItems.filter((i) => i.verificationStatus === "RESTAURANT_VERIFIED")
          .length,
        publishedDishes: allItems.filter((i) => i.isPublished).length,
        activeTables: activeRestaurant.tables.filter((t) => t.isActive).length,
      },
    };
  }

  return (
    <RestaurantSetupClient
      locale={locale}
      restaurants={restaurants.map((r) => ({ id: r.id, nameEn: r.nameEn, nameAr: r.nameAr }))}
      active={serializedActive}
      inviteExpiredNotice={sp.inviteNotice === "expired"}
    />
  );
}
