import { requirePageRole } from "@/lib/auth/rbac";
import { getI18nContext } from "@/lib/i18n/server";

export default async function DinerHomePage() {
  const [user, { dict }] = await Promise.all([
    requirePageRole(["DINER", "RESTAURANT_OWNER", "RESTAURANT_STAFF", "ADMIN"]),
    getI18nContext(),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6">
      <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-8 shadow-sm">
        <span className="inline-flex rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold text-[var(--accent-primary)]">
          {dict.portals.roleBadge}: {user.role}
        </span>
        <h1 className="mt-4 text-3xl font-bold text-[var(--text-primary)]">
          {dict.portals.dinerWelcome}
        </h1>
        <p className="mt-2 text-base text-[var(--text-secondary)]">{dict.portals.dinerSubtitle}</p>
      </div>
    </div>
  );
}
