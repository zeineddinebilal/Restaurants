import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateRestaurantStatusWithAudit } from "@/lib/admin/service";
import { requireApiRole } from "@/lib/auth/rbac";

const patchRestaurantSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "SUSPENDED"]),
});

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ restaurantId: string }> },
) {
  const authCheck = await requireApiRole(["ADMIN"]);
  if (!authCheck.ok) return authCheck.response;

  const { restaurantId } = await context.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = patchRestaurantSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid restaurant status" }, { status: 400 });
  }

  const result = await updateRestaurantStatusWithAudit({
    restaurantId,
    status: parsed.data.status,
    actorUserId: authCheck.user.id,
    actorEmail: authCheck.user.email ?? "admin",
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ restaurant: result.restaurant });
}
