import crypto from "node:crypto";
import { cookies } from "next/headers";

export const GUEST_COOKIE_NAME = "pf_guest";

function getSigningSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim();
  if (secret && secret.length >= 16) {
    return secret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET must be set in production.");
  }
  return "dev-only-fallback-guest-signing-secret-32chars";
}

export function createSignedGuestCookieValue(
  guestId = `gst_${crypto.randomUUID().replace(/-/g, "")}`,
  secret = getSigningSecret(),
): string {
  const sig = crypto.createHmac("sha256", secret).update(guestId).digest("base64url");
  return `${guestId}.${sig}`;
}

export function verifySignedGuestCookieValue(
  cookieValue: string | undefined | null,
  secret = getSigningSecret(),
): string | null {
  if (!cookieValue) return null;
  const dotIndex = cookieValue.indexOf(".");
  if (dotIndex <= 0) return null;

  const guestId = cookieValue.slice(0, dotIndex);
  const providedSig = cookieValue.slice(dotIndex + 1);
  if (!/^gst_[a-zA-Z0-9_]+$/.test(guestId) || !providedSig) {
    return null;
  }

  const expectedSig = crypto.createHmac("sha256", secret).update(guestId).digest("base64url");
  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length) return null;
  return crypto.timingSafeEqual(a, b) ? guestId : null;
}

export async function getVerifiedGuestToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(GUEST_COOKIE_NAME)?.value;
  return verifySignedGuestCookieValue(raw);
}
