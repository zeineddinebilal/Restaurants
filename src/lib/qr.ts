import QRCode from "qrcode";

export function buildTableQrPath(restaurantSlug: string, tableCode: string): string {
  return `/r/${encodeURIComponent(restaurantSlug)}/t/${encodeURIComponent(tableCode)}`;
}

export function buildTableQrUrl(
  baseOrigin: string,
  restaurantSlug: string,
  tableCode: string,
): string {
  const cleanOrigin = baseOrigin.replace(/\/$/, "");
  return `${cleanOrigin}${buildTableQrPath(restaurantSlug, tableCode)}`;
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
