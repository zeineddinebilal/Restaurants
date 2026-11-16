import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { getDefaultHomeForRole, hasAllowedRole } from "@/lib/auth/rbac";
import { getI18nContext } from "@/lib/i18n/server";

export default async function RestaurantDashboardPage() {
  const [session, { dict }] = await Promise.all([auth(), getI18nContext()]);
  if (!session?.user) {
    redirect("/login");
  }
  if (!hasAllowedRole(session.user.role, ["RESTAURANT_OWNER", "ADMIN"])) {
    redirect(getDefaultHomeForRole(session.user.role));
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6">
      <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-8 shadow-sm">
        <span className="inline-flex rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold text-[var(--accent-primary)]">
          {dict.portals.roleBadge}: {session.user.role}
        </span>
        <h1 className="mt-4 text-3xl font-bold text-[var(--text-primary)]">
          {dict.portals.restaurantWelcome}
        </h1>
        <p className="mt-2 text-base text-[var(--text-secondary)]">
          {dict.portals.restaurantSubtitle}
        </p>
      </div>
    </div>
  );
}
