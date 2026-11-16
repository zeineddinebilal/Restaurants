/**
 * Parses a scanned QR string or manually entered table link into a safe internal
 * `/r/{restaurantSlug}/t/{tableCode}` path. Rejects external/malformed URLs.
 */
export function parseQrTableTarget(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let pathname = trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      pathname = parsed.pathname;
    } catch {
      return null;
    }
  }

  const match = /^\/?r\/([a-z0-9-]+)\/t\/([A-Za-z0-9_-]+)\/?$/.exec(pathname);
  if (!match) {
    return null;
  }

  return `/r/${encodeURIComponent(match[1]!)}/t/${encodeURIComponent(match[2]!)}`;
}
