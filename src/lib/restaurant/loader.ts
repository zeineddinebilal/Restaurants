import type { AuthenticatedUser } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";

export async function loadManagedRestaurants(user: AuthenticatedUser, requestedId?: string) {
  const where = user.role === "ADMIN" ? {} : { ownerId: user.id };

  const restaurants = await prisma.restaurant.findMany({
    where,
    orderBy: { createdAt: "asc" },
    include: {
      branches: { orderBy: { createdAt: "asc" } },
      tables: { orderBy: { tableCode: "asc" } },
      members: {
        orderBy: { createdAt: "asc" },
        include: {
          user: { select: { id: true, name: true, email: true, role: true, isActive: true } },
        },
      },
      categories: {
        orderBy: { sortOrder: "asc" },
        include: {
          items: {
            orderBy: { createdAt: "asc" },
            include: {
              modifiers: { orderBy: { createdAt: "asc" } },
              verifiedBy: { select: { id: true, name: true, email: true } },
            },
          },
        },
      },
    },
  });

  const activeRestaurant =
    (requestedId ? restaurants.find((r) => r.id === requestedId) : undefined) ??
    restaurants[0] ??
    null;

  return { restaurants, activeRestaurant };
}
