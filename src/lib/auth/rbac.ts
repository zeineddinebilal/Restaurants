import type { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db";

export interface AuthenticatedUser {
  id: string;
  email?: string | null;
  name?: string | null;
  role: Role;
  locale: "en" | "ar";
}

export function hasAllowedRole(userRole: Role, allowedRoles: readonly Role[]): boolean {
  return allowedRoles.includes(userRole);
}

export function getDefaultHomeForRole(role: Role): string {
  switch (role) {
    case "ADMIN":
      return "/admin";
    case "RESTAURANT_OWNER":
      return "/dashboard";
    case "RESTAURANT_STAFF":
      return "/dashboard/orders";
    case "DINER":
    default:
      return "/home";
  }
}

export async function requireApiRole(
  allowedRoles: readonly Role[],
): Promise<{ ok: true; user: AuthenticatedUser } | { ok: false; response: NextResponse }> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    };
  }

  if (!hasAllowedRole(session.user.role, allowedRoles)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden for current role" }, { status: 403 }),
    };
  }

  return {
    ok: true,
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role,
      locale: session.user.locale,
    },
  };
}

/**
 * Enforces that a user is either ADMIN or owns / is an active staff member
 * of the specified restaurantId. Prevents cross-restaurant data leakage.
 */
export async function canAccessRestaurant(params: {
  userId: string;
  userRole: Role;
  restaurantId: string;
  ownerOnly?: boolean;
}): Promise<boolean> {
  if (params.userRole === "ADMIN") {
    return true;
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: params.restaurantId },
    select: {
      ownerId: true,
      members: {
        where: { userId: params.userId },
        select: { role: true },
      },
    },
  });

  if (!restaurant) return false;
  if (restaurant.ownerId === params.userId) return true;
  if (params.ownerOnly) return false;

  return restaurant.members.length > 0;
}
