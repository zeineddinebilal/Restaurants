import type { PrismaClient, Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db";
import { isLocale } from "@/lib/i18n/dictionaries";

export interface AuthenticatedUser {
  id: string;
  email?: string | null;
  name?: string | null;
  role: Role;
  locale: "en" | "ar";
  isActive: boolean;
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

/**
 * Pure authorization check used by both API routes and page guards.
 * Rejects missing sessions, inactive accounts, and unauthorized roles.
 */
export function evaluateRoleGuard(params: {
  user: AuthenticatedUser | null | undefined;
  allowedRoles: readonly Role[];
}):
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; status: 401 | 403; reason: "UNAUTHENTICATED" | "INACTIVE" | "FORBIDDEN" } {
  const { user, allowedRoles } = params;
  if (!user?.id) {
    return { ok: false, status: 401, reason: "UNAUTHENTICATED" };
  }
  if (!user.isActive) {
    return { ok: false, status: 403, reason: "INACTIVE" };
  }
  if (!hasAllowedRole(user.role, allowedRoles)) {
    return { ok: false, status: 403, reason: "FORBIDDEN" };
  }
  return { ok: true, user };
}

export async function loadLiveAuthenticatedUserById(
  userId: string,
  db: PrismaClient = prisma,
): Promise<AuthenticatedUser | null> {
  const dbUser = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      locale: true,
      isActive: true,
    },
  });

  if (!dbUser) {
    return null;
  }

  return {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    role: dbUser.role,
    locale: isLocale(dbUser.locale) ? dbUser.locale : "en",
    isActive: dbUser.isActive,
  };
}

/**
 * Resolves the live user record from DB for the active session so role changes
 * or account suspensions take effect immediately on guarded pages and API routes.
 */
export async function getLiveAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const session = await auth();
  if (!session?.user?.id || session.user.isActive === false) {
    return null;
  }

  return loadLiveAuthenticatedUserById(session.user.id, prisma);
}

export async function requireApiRole(
  allowedRoles: readonly Role[],
  resolveUser: () => Promise<AuthenticatedUser | null> = getLiveAuthenticatedUser,
): Promise<{ ok: true; user: AuthenticatedUser } | { ok: false; response: NextResponse }> {
  const liveUser = await resolveUser();
  const check = evaluateRoleGuard({ user: liveUser, allowedRoles });

  if (!check.ok) {
    const message =
      check.reason === "UNAUTHENTICATED"
        ? "Authentication required"
        : check.reason === "INACTIVE"
          ? "Account is suspended or inactive"
          : "Forbidden for current role";
    return {
      ok: false,
      response: NextResponse.json({ error: message }, { status: check.status }),
    };
  }

  return { ok: true, user: check.user };
}

/**
 * Server Component page guard that enforces authentication, active status, and role.
 */
export async function requirePageRole(allowedRoles: readonly Role[]): Promise<AuthenticatedUser> {
  const liveUser = await getLiveAuthenticatedUser();
  if (!liveUser || !liveUser.isActive) {
    redirect("/login");
  }
  if (!hasAllowedRole(liveUser.role, allowedRoles)) {
    redirect(getDefaultHomeForRole(liveUser.role));
  }
  return liveUser;
}

export function evaluateRestaurantMembership(params: {
  userId: string;
  userRole: Role;
  ownerOnly?: boolean;
  restaurant: {
    ownerId: string;
    activeMemberUserIds: readonly string[];
  } | null;
}): boolean {
  if (params.userRole === "ADMIN") {
    return Boolean(params.restaurant);
  }
  if (!params.restaurant) {
    return false;
  }
  if (params.restaurant.ownerId === params.userId) {
    return true;
  }
  if (params.ownerOnly) {
    return false;
  }
  return params.restaurant.activeMemberUserIds.includes(params.userId);
}

/**
 * Enforces that a user is either ADMIN, the restaurant owner, or an ACTIVE (`isActive: true`)
 * staff member of `restaurantId`. Prevents cross-restaurant access and immediately blocks
 * deactivated staff.
 */
export async function canAccessRestaurant(params: {
  userId: string;
  userRole: Role;
  restaurantId: string;
  ownerOnly?: boolean;
}): Promise<boolean> {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: params.restaurantId },
    select: {
      ownerId: true,
      members: {
        where: { userId: params.userId, isActive: true },
        select: { userId: true },
      },
    },
  });

  return evaluateRestaurantMembership({
    userId: params.userId,
    userRole: params.userRole,
    ownerOnly: params.ownerOnly,
    restaurant: restaurant
      ? {
          ownerId: restaurant.ownerId,
          activeMemberUserIds: restaurant.members.map((m) => m.userId),
        }
      : null,
  });
}
