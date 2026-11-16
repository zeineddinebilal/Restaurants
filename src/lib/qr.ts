import crypto from "node:crypto";
import QRCode from "qrcode";

/**
 * Generates a random 128-bit (32 hex chars) secret QR token for a DiningTable.
 */
export function generateTableQrToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function verifyTableQrToken(provided: string | null | undefined, expected: string): boolean {
  const cleanProvided = provided?.trim();
  if (!cleanProvided || !expected) return false;
  const a = Buffer.from(cleanProvided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function buildTableQrPath(
  restaurantSlug: string,
  tableCode: string,
  qrToken?: string | null,
): string {
  const base = `/r/${encodeURIComponent(restaurantSlug)}/t/${encodeURIComponent(tableCode)}`;
  if (qrToken?.trim()) {
    return `${base}?k=${encodeURIComponent(qrToken.trim())}`;
  }
  return base;
}

export function buildTableQrUrl(
  baseOrigin: string,
  restaurantSlug: string,
  tableCode: string,
  qrToken?: string | null,
): string {
  const cleanOrigin = baseOrigin.replace(/\/$/, "");
  return `${cleanOrigin}${buildTableQrPath(restaurantSlug, tableCode, qrToken)}`;
}

export async function generateQrCodeSvg(targetUrl: string): Promise<string> {
  return QRCode.toString(targetUrl, {
    type: "svg",
    margin: 1,
    width: 240,
    errorCorrectionLevel: "M",
    color: {
      dark: "#1f1916",
      light: "#ffffff",
    },
  });
}
