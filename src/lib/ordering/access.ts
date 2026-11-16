import { NextResponse } from "next/server";
import { getVerifiedGuestToken } from "@/lib/auth/guest";
import {
  type AuthenticatedUser,
  canAccessRestaurant,
  getLiveAuthenticatedUser,
  requireApiRole,
} from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { getAuthorizedTableSessionIdsFromCookie } from "@/lib/ordering/session";

/**
 * Verifies the caller is an active RESTAURANT_STAFF, RESTAURANT_OWNER, or ADMIN
 * with active access to `restaurantId`.
 */
export async function requireRestaurantStaffOrOwnerApi(
  restaurantId: string,
): Promise<{ ok: true; user: AuthenticatedUser } | { ok: false; response: NextResponse }> {
  const authResult = await requireApiRole(["RESTAURANT_STAFF", "RESTAURANT_OWNER", "ADMIN"]);
  if (!authResult.ok) return authResult;

  const allowed = await canAccessRestaurant({
    userId: authResult.user.id,
    userRole: authResult.user.role,
    restaurantId,
    ownerOnly: false,
  });

  if (!allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Forbidden: no active access to this restaurant's orders." },
        { status: 403 },
      ),
    };
  }

  return authResult;
}

/**
 * Verifies whether the current request (authenticated user, signed guest token,
 * or signed table-session cookie) is permitted to view/stream `order`.
 */
export async function canCurrentCallerViewOrder(order: {
  restaurantId: string;
  tableSessionId: string;
  placedByProfileId: string | null;
  placedByGuestToken: string | null;
}): Promise<boolean> {
  const sessionCookieIds = await getAuthorizedTableSessionIdsFromCookie();
  if (sessionCookieIds.has(order.tableSessionId)) {
    return true;
  }

  const liveUser = await getLiveAuthenticatedUser();
  if (liveUser) {
    if (
      liveUser.role === "ADMIN" ||
      liveUser.role === "RESTAURANT_OWNER" ||
      liveUser.role === "RESTAURANT_STAFF"
    ) {
      const staffAllowed = await canAccessRestaurant({
        userId: liveUser.id,
        userRole: liveUser.role,
        restaurantId: order.restaurantId,
        ownerOnly: false,
      });
      if (staffAllowed) return true;
    }

    const profile = await prisma.dinerProfile.findUnique({
      where: { userId: liveUser.id },
      select: { id: true },
    });
    if (profile) {
      if (order.placedByProfileId === profile.id) return true;
      const participant = await prisma.tableParticipant.findFirst({
        where: {
          tableSessionId: order.tableSessionId,
          dinerProfileId: profile.id,
        },
        select: { id: true },
      });
      if (participant) return true;
    }
  }

  const guestToken = await getVerifiedGuestToken();
  if (guestToken) {
    if (order.placedByGuestToken === guestToken) return true;
    const participant = await prisma.tableParticipant.findFirst({
      where: {
        tableSessionId: order.tableSessionId,
        guestToken,
      },
      select: { id: true },
    });
    if (participant) return true;
  }

  return false;
}
