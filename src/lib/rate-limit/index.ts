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
 * In-memory sliding-window rate limiter used for auth, order creation
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

  // Periodic lightweight cleanup to bound memory
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
