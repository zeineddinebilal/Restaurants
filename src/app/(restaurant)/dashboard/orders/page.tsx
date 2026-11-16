import Link from "next/link";
import {
  LiveOrdersStaffClient,
  type StaffOrderCard,
} from "@/app/(restaurant)/dashboard/orders/LiveOrdersStaffClient";
import { requirePageRole } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { pickLocalized } from "@/lib/i18n/dictionaries";
import { getI18nContext } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function StaffLiveOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ restaurantId?: string }>;
}) {
  const [user, { locale }, sp] = await Promise.all([
    requirePageRole(["RESTAURANT_STAFF", "RESTAURANT_OWNER", "ADMIN"]),
    getI18nContext(),
    searchParams,
  ]);

  const accessibleRestaurants = await prisma.restaurant.findMany({
    where:
      user.role === "ADMIN"
        ? {}
        : {
            OR: [{ ownerId: user.id }, { members: { some: { userId: user.id, isActive: true } } }],
          },
    orderBy: { createdAt: "asc" },
    select: { id: true, nameEn: true, nameAr: true },
  });

  const activeRestaurant =
    (sp.restaurantId ? accessibleRestaurants.find((r) => r.id === sp.restaurantId) : undefined) ??
    accessibleRestaurants[0] ??
    null;

  if (!activeRestaurant) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <p className="text-sm text-[var(--text-secondary)]">
          No restaurant assigned to this account yet.{" "}
          {user.role === "RESTAURANT_OWNER" && (
            <Link href="/dashboard" className="font-bold text-[var(--accent-primary)] underline">
              Create your restaurant first.
            </Link>
          )}
        </p>
      </div>
    );
  }

  const rawOrders = await prisma.order.findMany({
    where: { restaurantId: activeRestaurant.id },
    orderBy: { sentAt: "desc" },
    take: 80,
    include: {
      table: { select: { tableCode: true, displayName: true } },
      tableSession: {
        include: {
          participants: {
            include: {
              dinerProfile: { select: { dietaryRestrictions: true, allergens: true } },
            },
          },
        },
      },
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          menuItem: { select: { nameEn: true, nameAr: true } },
        },
      },
      platformFee: true,
    },
  });

  const serializedOrders: StaffOrderCard[] = rawOrders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    subtotalAed: o.subtotalAed.toFixed(2),
    notes: o.notes,
    cancelReason: o.cancelReason,
    sentAt: o.sentAt.toISOString(),
    table: o.table,
    participants: o.tableSession.participants.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      dietaryRestrictions: p.dinerProfile?.dietaryRestrictions ?? [],
      allergens: p.dinerProfile?.allergens ?? [],
    })),
    items: o.items.map((it) => ({
      id: it.id,
      nameEn: it.menuItem.nameEn,
      nameAr: it.menuItem.nameAr,
      participantName: it.participantName,
      quantity: it.quantity,
      unitPriceAed: it.unitPriceAed.toFixed(2),
      lineTotalAed: it.lineTotalAed.toFixed(2),
      selectedModifiers: it.selectedModifiers,
      specialInstructions: it.specialInstructions,
    })),
    platformFee: o.platformFee
      ? {
          feeAmountAed: o.platformFee.feeAmountAed.toFixed(2),
          isVoided: o.platformFee.isVoided,
        }
      : null,
  }));

  return (
    <LiveOrdersStaffClient
      locale={locale}
      restaurantId={activeRestaurant.id}
      restaurantName={pickLocalized(activeRestaurant.nameEn, activeRestaurant.nameAr, locale)}
      initialOrders={serializedOrders}
    />
  );
}
