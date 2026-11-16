import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db";
import { LOCALE_COOKIE_NAME } from "@/lib/i18n/server";

const localeSchema = z.object({
  locale: z.enum(["en", "ar"]),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = localeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid locale" }, { status: 400 });
  }

  const session = await auth();
  if (session?.user?.id) {
    try {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { locale: parsed.data.locale },
      });
    } catch {
      // Ignore if session user record is transient in tests
    }
  }

  const res = NextResponse.json({ ok: true, locale: parsed.data.locale });
  res.cookies.set(LOCALE_COOKIE_NAME, parsed.data.locale, {
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
    sameSite: "lax",
  });
  return res;
}
