import { NextRequest, NextResponse } from "next/server";
import {
  createSignedGuestCookieValue,
  GUEST_COOKIE_NAME,
  verifySignedGuestCookieValue,
} from "@/lib/auth/guest";

export async function POST(req: NextRequest) {
  const existingCookie = req.cookies.get(GUEST_COOKIE_NAME)?.value;
  const existingGuestId = verifySignedGuestCookieValue(existingCookie);

  if (existingGuestId) {
    return NextResponse.json({ guestToken: existingGuestId });
  }

  const signed = createSignedGuestCookieValue();
  const guestToken = verifySignedGuestCookieValue(signed)!;

  const res = NextResponse.json({ guestToken }, { status: 201 });
  res.cookies.set(GUEST_COOKIE_NAME, signed, {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60,
  });
  return res;
}
