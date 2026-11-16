import {
  type AuditLogView,
  SettingsAdminClient,
} from "@/app/(admin)/admin/settings/SettingsAdminClient";
import { requirePageRole } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { getI18nContext } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const [, { locale }, setting, auditLogs] = await Promise.all([
    requirePageRole(["ADMIN"]),
    getI18nContext(),
    prisma.platformSetting.findUnique({ where: { id: "default" } }),
    prisma.adminAuditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  const logs: AuditLogView[] = auditLogs.map((l) => ({
    id: l.id,
    actorEmail: l.actorEmail,
    action: l.action,
    targetType: l.targetType,
    summary: l.summary,
    createdAtIso: l.createdAt.toISOString(),
  }));

  return (
    <SettingsAdminClient
      locale={locale}
      initialSettings={{
        feePercentage: setting ? setting.feePercentage.toFixed(2) : "10.00",
        feeCapAed: setting ? setting.feeCapAed.toFixed(2) : "1.00",
        currency: setting?.currency ?? "AED",
        tableSessionTtlHours: setting?.tableSessionTtlHours ?? 4,
      }}
      auditLogs={logs}
    />
  );
}
