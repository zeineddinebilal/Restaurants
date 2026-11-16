import { NextRequest, NextResponse } from "next/server";
import { updatePlatformSettingsWithAudit } from "@/lib/admin/service";
import { requireApiRole } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";

export async function GET() {
  const authCheck = await requireApiRole(["ADMIN"]);
  if (!authCheck.ok) return authCheck.response;

  const [settings, auditLogs] = await Promise.all([
    prisma.platformSetting.findUnique({ where: { id: "default" } }),
    prisma.adminAuditLog.findMany({
      where: { targetType: "PlatformSetting" },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  return NextResponse.json({
    settings: settings
      ? {
          feePercentage: settings.feePercentage.toFixed(2),
          feeCapAed: settings.feeCapAed.toFixed(2),
          currency: settings.currency,
          tableSessionTtlHours: settings.tableSessionTtlHours,
          updatedAt: settings.updatedAt.toISOString(),
        }
      : {
          feePercentage: "10.00",
          feeCapAed: "1.00",
          currency: "AED",
          tableSessionTtlHours: 4,
          updatedAt: null,
        },
    auditLogs,
  });
}

export async function PUT(req: NextRequest) {
  const authCheck = await requireApiRole(["ADMIN"]);
  if (!authCheck.ok) return authCheck.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const result = await updatePlatformSettingsWithAudit({
    input: body,
    actorUserId: authCheck.user.id,
    actorEmail: authCheck.user.email ?? "admin",
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    settings: {
      feePercentage: result.settings.feePercentage.toFixed(2),
      feeCapAed: result.settings.feeCapAed.toFixed(2),
      currency: result.settings.currency,
      tableSessionTtlHours: result.settings.tableSessionTtlHours,
      updatedAt: result.settings.updatedAt.toISOString(),
    },
  });
}
