/**
 * Parses a scanned QR string or manually entered table link into a safe internal
 * `/r/{restaurantSlug}/t/{tableCode}` path (preserving `?k={tableToken}` if present).
 * Rejects external/malformed URLs.
 */
export function parseQrTableTarget(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let pathname = trimmed;
  let kParam: string | null = null;

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      pathname = parsed.pathname;
      kParam = parsed.searchParams.get("k");
    } catch {
      return null;
    }
  } else {
    const qIdx = trimmed.indexOf("?");
    if (qIdx >= 0) {
      pathname = trimmed.slice(0, qIdx);
      const sp = new URLSearchParams(trimmed.slice(qIdx + 1));
      kParam = sp.get("k");
    }
  }

  const match = /^\/?r\/([a-z0-9-]+)\/t\/([A-Za-z0-9_-]+)\/?$/.exec(pathname);
  if (!match) {
    return null;
  }

  const basePath = `/r/${encodeURIComponent(match[1]!)}/t/${encodeURIComponent(match[2]!)}`;
  if (kParam && /^[A-Za-z0-9_-]{8,80}$/.test(kParam.trim())) {
    return `${basePath}?k=${encodeURIComponent(kParam.trim())}`;
  }
  return basePath;
}
