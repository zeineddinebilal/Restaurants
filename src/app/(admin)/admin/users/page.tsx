import { type AdminUserRow, UsersAdminClient } from "@/app/(admin)/admin/users/UsersAdminClient";
import { requirePageRole } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { getI18nContext } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const [adminUser, { locale }, users] = await Promise.all([
    requirePageRole(["ADMIN"]),
    getI18nContext(),
    prisma.user.findMany({
      orderBy: [{ role: "asc" }, { createdAt: "desc" }],
      take: 500,
    }),
  ]);

  const rows: AdminUserRow[] = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    isActive: u.isActive,
    createdAtIso: u.createdAt.toISOString(),
  }));

  return <UsersAdminClient locale={locale} currentAdminId={adminUser.id} initialUsers={rows} />;
}
