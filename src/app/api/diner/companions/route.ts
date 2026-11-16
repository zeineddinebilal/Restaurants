import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  acceptCompanionInvite,
  createOrGetCompanionInvite,
  listConnectedCompanions,
  removeDiningCompanion,
} from "@/lib/diner/companions";
import { getActiveDinerProfile } from "@/lib/diner/profile";
import { generateQrCodeSvg } from "@/lib/qr";

const companionActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("accept"),
    code: z.string().trim().min(4).max(24),
  }),
  z.object({
    action: z.literal("remove"),
    companionProfileId: z.string().min(1),
  }),
]);

export async function GET(req: NextRequest) {
  const active = await getActiveDinerProfile();
  if (!active.isAuthenticated || !active.profile?.id) {
    return NextResponse.json(
      { error: "Sign in or create a quick account to save Dining Companions." },
      { status: 401 },
    );
  }

  const [companions, invite] = await Promise.all([
    listConnectedCompanions(active.profile.id),
    createOrGetCompanionInvite(active.profile.id),
  ]);

  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3000";
  const proto =
    req.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  const origin = process.env.NEXT_PUBLIC_APP_URL?.trim() || `${proto}://${host}`;
  const shareUrl = `${origin.replace(/\/+$/, "")}/companions/join?code=${encodeURIComponent(invite.code)}`;
  const qrSvg = await generateQrCodeSvg(shareUrl);

  return NextResponse.json({
    companions,
    invite: {
      code: invite.code,
      shareUrl,
      qrSvg,
      expiresAt: invite.expiresAt.toISOString(),
    },
  });
}

export async function POST(req: NextRequest) {
  const active = await getActiveDinerProfile();
  if (!active.isAuthenticated || !active.profile?.id) {
    return NextResponse.json(
      { error: "Sign in or create a quick account to connect with Dining Companions." },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = companionActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  if (parsed.data.action === "accept") {
    const res = await acceptCompanionInvite({
      accepterProfileId: active.profile.id,
      code: parsed.data.code,
    });
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: res.status });
    }
    return NextResponse.json({ ok: true, inviterDisplayName: res.inviterDisplayName });
  }

  await removeDiningCompanion({
    viewerProfileId: active.profile.id,
    companionProfileId: parsed.data.companionProfileId,
  });
  return NextResponse.json({ ok: true });
}
