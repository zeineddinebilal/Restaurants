export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAtMs: number;
}

interface Bucket {
  timestamps: number[];
}

const buckets = new Map<string, Bucket>();

/**
 * Extracts a trustworthy client IP from request headers behind Render's proxy.
 * 1. Prefers Render's `true-client-ip` header when present.
 * 2. Falls back to the LAST entry of `x-forwarded-for` (appended by the edge proxy,
 *    preventing client-spoofed leading entries from bypassing rate limits).
 * 3. Falls back to `"unknown"`.
 */
export function getClientIp(headers: Pick<Headers, "get">): string {
  const trueClientIp = headers.get("true-client-ip")?.trim();
  if (trueClientIp) {
    return trueClientIp;
  }

  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length > 0) {
      return parts[parts.length - 1]!;
    }
  }

  return "unknown";
}

/**
 * In-memory per-instance sliding-window rate limiter used for auth, order creation
 * (per guestToken and per tableId), and AI endpoints.
 */
export function checkRateLimit(params: {
  key: string;
  limit: number;
  windowMs: number;
  nowMs?: number;
}): RateLimitResult {
  const { key, limit, windowMs, nowMs = Date.now() } = params;
  const windowStart = nowMs - windowMs;

  const existing = buckets.get(key);
  const validTimestamps = existing ? existing.timestamps.filter((t) => t > windowStart) : [];

  if (validTimestamps.length >= limit) {
    buckets.set(key, { timestamps: validTimestamps });
    const oldestInWindow = validTimestamps[0] ?? nowMs;
    return {
      allowed: false,
      remaining: 0,
      resetAtMs: oldestInWindow + windowMs,
    };
  }

  validTimestamps.push(nowMs);
  buckets.set(key, { timestamps: validTimestamps });

  if (buckets.size > 5000) {
    for (const [k, b] of buckets.entries()) {
      const pruned = b.timestamps.filter((t) => t > windowStart);
      if (pruned.length === 0) {
        buckets.delete(k);
      } else {
        buckets.set(k, { timestamps: pruned });
      }
    }
  }

  return {
    allowed: true,
    remaining: Math.max(0, limit - validTimestamps.length),
    resetAtMs: nowMs + windowMs,
  };
}

export function resetRateLimitBucketsForTest(): void {
  buckets.clear();
}
