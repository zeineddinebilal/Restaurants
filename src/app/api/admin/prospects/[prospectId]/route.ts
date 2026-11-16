import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  generateProspectConvertInvite,
  updateProspectPatchSchema,
  updateProspectWithAudit,
} from "@/lib/admin/prospects";
import { requireApiRole } from "@/lib/auth/rbac";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ prospectId: string }> },
) {
  const authCheck = await requireApiRole(["ADMIN"]);
  if (!authCheck.ok) return authCheck.response;

  const { prospectId } = await context.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  // Action: Convert to restaurant (generates or regenerates 14-day owner signup invite link)
  const convertParsed = z
    .object({
      action: z.literal("convert_invite"),
      regenerate: z.boolean().optional(),
    })
    .safeParse(body);
  if (convertParsed.success) {
    const res = await generateProspectConvertInvite({
      prospectId,
      actorUserId: authCheck.user.id,
      actorEmail: authCheck.user.email ?? "admin",
      regenerate: convertParsed.data.regenerate,
    });
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: res.status });
    }
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3000";
    const proto =
      req.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
    const origin = process.env.NEXT_PUBLIC_APP_URL?.trim() || `${proto}://${host}`;
    const inviteUrl = `${origin.replace(/\/+$/, "")}/register?role=RESTAURANT_OWNER&prospectInvite=${encodeURIComponent(res.inviteToken)}`;
    return NextResponse.json({
      inviteToken: res.inviteToken,
      inviteUrl,
      inviteExpiresAt: res.inviteExpiresAt.toISOString(),
    });
  }

  const parsed = updateProspectPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const result = await updateProspectWithAudit({
    prospectId,
    patch: parsed.data,
    actorUserId: authCheck.user.id,
    actorEmail: authCheck.user.email ?? "admin",
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ prospect: result.prospect });
}
