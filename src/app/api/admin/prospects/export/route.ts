import { NextResponse } from "next/server";
import { exportProspectsToCsv } from "@/lib/admin/prospects";
import { requireApiRole } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";

export async function GET() {
  const authCheck = await requireApiRole(["ADMIN"]);
  if (!authCheck.ok) return authCheck.response;

  const prospects = await prisma.prospect.findMany({
    orderBy: [{ top30Rank: "asc" }, { city: "asc" }, { name: "asc" }],
  });

  const csv = exportProspectsToCsv(prospects);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="prospects-export.csv"',
      "Cache-Control": "no-store",
    },
  });
}
