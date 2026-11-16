import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateUserAccountWithAudit } from "@/lib/admin/service";
import { requireApiRole } from "@/lib/auth/rbac";

const patchUserSchema = z
  .object({
    isActive: z.boolean().optional(),
    role: z.enum(["DINER", "RESTAURANT_OWNER", "RESTAURANT_STAFF", "ADMIN"]).optional(),
  })
  .refine((v) => v.isActive !== undefined || v.role !== undefined, {
    message: "Provide isActive or role to update.",
  });

export async function PATCH(req: NextRequest, context: { params: Promise<{ userId: string }> }) {
  const authCheck = await requireApiRole(["ADMIN"]);
  if (!authCheck.ok) return authCheck.response;

  const { userId } = await context.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = patchUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const result = await updateUserAccountWithAudit({
    targetUserId: userId,
    isActive: parsed.data.isActive,
    role: parsed.data.role,
    actorUserId: authCheck.user.id,
    actorEmail: authCheck.user.email ?? "admin",
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ user: result.user });
}
