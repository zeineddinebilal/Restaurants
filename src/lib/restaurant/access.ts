import { NextResponse } from "next/server";
import { type AuthenticatedUser, canAccessRestaurant, requireApiRole } from "@/lib/auth/rbac";

/**
 * Verifies the caller is an active RESTAURANT_OWNER or ADMIN and owns `restaurantId`.
 */
export async function requireRestaurantOwnerApi(
  restaurantId: string,
): Promise<{ ok: true; user: AuthenticatedUser } | { ok: false; response: NextResponse }> {
  const authResult = await requireApiRole(["RESTAURANT_OWNER", "ADMIN"]);
  if (!authResult.ok) {
    return authResult;
  }

  const allowed = await canAccessRestaurant({
    userId: authResult.user.id,
    userRole: authResult.user.role,
    restaurantId,
    ownerOnly: true,
  });

  if (!allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "You do not have permission to manage this restaurant." },
        { status: 403 },
      ),
    };
  }

  return authResult;
}

export function slugifyRestaurantName(input: string): string {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "restaurant";
}
