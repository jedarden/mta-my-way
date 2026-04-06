/**
 * In-memory token bucket rate limiter for Hono.
 *
 * 60 requests per minute per IP. Resets on pod restart — acceptable
 * for single-container deployment. Cloudflare WAF is the first line
 * of defense; this is the second.
 */

import type { MiddlewareHandler } from "hono";

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

const TOKENS_PER_MINUTE = 60;
const REFILL_INTERVAL_MS = 1000; // Refill 1 token per second
const MAX_TOKENS = TOKENS_PER_MINUTE;

const buckets = new Map<string, TokenBucket>();

// Prune stale buckets every 5 minutes
const PRUNE_INTERVAL_MS = 300_000;
let lastPrune = Date.now();

function getClientIp(c: { req: { header(name: string): string | undefined } }): string {
  // Cloudflare tunnel sets CF-Connecting-IP
  return (
    c.req.header("CF-Connecting-IP") ||
    c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function refillBucket(bucket: TokenBucket, now: number): void {
  const elapsed = now - bucket.lastRefill;
  const tokensToAdd = Math.floor(elapsed / REFILL_INTERVAL_MS);
  if (tokensToAdd > 0) {
    bucket.tokens = Math.min(MAX_TOKENS, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now - (elapsed % REFILL_INTERVAL_MS);
  }
}

/**
 * Token bucket rate limiter middleware.
 * Returns 429 with structured error when rate limit is exceeded.
 */
export function rateLimiter(): MiddlewareHandler {
  return async (c, next) => {
    const now = Date.now();
    const ip = getClientIp(c);

    // Periodic prune of old buckets to prevent memory leak
    if (now - lastPrune > PRUNE_INTERVAL_MS) {
      for (const [key, bucket] of buckets) {
        if (now - bucket.lastRefill > MAX_TOKENS * REFILL_INTERVAL_MS * 2) {
          buckets.delete(key);
        }
      }
      lastPrune = now;
    }

    let bucket = buckets.get(ip);
    if (!bucket) {
      bucket = { tokens: MAX_TOKENS, lastRefill: now };
      buckets.set(ip, bucket);
    }

    refillBucket(bucket, now);

    if (bucket.tokens <= 0) {
      return c.json(
        {
          error: "Too many requests",
          retryAfter: Math.ceil((MAX_TOKENS - bucket.tokens) * (REFILL_INTERVAL_MS / 1000)),
        },
        429
      );
    }

    bucket.tokens -= 1;
    await next();
  };
}
