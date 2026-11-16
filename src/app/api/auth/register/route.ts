import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  convertProspectOnOwnerSignupTx,
  INVITE_EXPIRED_OR_USED_MESSAGE,
} from "@/lib/admin/prospects";
import { prisma } from "@/lib/db";
import { isLocale } from "@/lib/i18n/dictionaries";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(160),
  password: z.string().min(8).max(128),
  role: z.enum(["DINER", "RESTAURANT_OWNER"]).default("DINER"),
  locale: z.enum(["en", "ar"]).optional(),
  prospectInvite: z.string().trim().min(8).max(80).optional(),
});

export async function POST(req: NextRequest) {
  const clientIp = getClientIp(req.headers);

  const rl = checkRateLimit({
    key: `register:${clientIp}`,
    limit: 10,
    windowMs: 15 * 60 * 1000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many registration attempts. Please try again shortly." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const email = parsed.data.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists." },
      { status: 409 },
    );
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const locale = isLocale(parsed.data.locale) ? parsed.data.locale : "en";

  const result = await prisma.$transaction(async (tx) => {
    const effectiveRole = parsed.data.prospectInvite ? "RESTAURANT_OWNER" : parsed.data.role;

    const created = await tx.user.create({
      data: {
        name: parsed.data.name,
        email,
        passwordHash,
        role: effectiveRole,
        locale,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        locale: true,
      },
    });

    let inviteWarning: string | undefined;

    if (created.role === "DINER") {
      await tx.dinerProfile.create({
        data: {
          userId: created.id,
          displayName: created.name,
        },
      });
    } else if (parsed.data.prospectInvite) {
      const conversion = await convertProspectOnOwnerSignupTx({
        tx,
        inviteToken: parsed.data.prospectInvite,
        ownerUserId: created.id,
        ownerEmail: email,
      });
      if (!conversion.converted) {
        inviteWarning = INVITE_EXPIRED_OR_USED_MESSAGE;
      }
    }

    return { user: created, inviteWarning };
  });

  return NextResponse.json(
    {
      user: result.user,
      ...(result.inviteWarning ? { inviteWarning: result.inviteWarning } : {}),
    },
    { status: 201 },
  );
}
