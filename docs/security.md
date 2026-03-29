# Security Implementation

This document describes the security model for MTA My Way, including rate limiting, input validation, security headers, and data privacy measures.

## Defense in Depth

Security is implemented in layers:

1. **Cloudflare WAF** (first line of defense)
2. **Hono middleware** (second line of defense)
3. **Zod input validation** (third line of defense)

## Cloudflare WAF Configuration

Configure in the Cloudflare tunnel dashboard:

- **Rate-limit rule**: 100 requests/minute per IP for `/api/*` paths
- Returns 429 with a `Retry-After` header
- Cloudflare Bot Management (free tier) filters automated abuse

## Hono Rate Limiting

**File**: `packages/server/src/middleware/rate-limiter.ts`

In-memory token bucket rate limiter:
- **Limit**: 60 requests/minute per IP
- **Algorithm**: Token bucket (1 token/second refill)
- **Client identification**: Uses `CF-Connecting-IP` header from Cloudflare tunnel, falls back to `X-Forwarded-For`
- **Memory management**: Periodic pruning of stale buckets every 5 minutes

```typescript
// Example 429 response
{
  "error": "Too many requests",
  "retryAfter": 42
}
```

**Note**: In-memory rate limiter resets on pod restart — acceptable for single-container deployment. Cloudflare WAF is the first line of defense.

## Zod Input Validation

**Files**:
- `packages/shared/src/schemas/push.ts` — Push notification schemas
- `packages/shared/src/schemas/commute.ts` — Commute analysis schemas
- `packages/server/src/middleware/validation.ts` — Validation helper

All API inputs are validated against Zod schemas before processing. Invalid payloads return 400 with structured error details:

```typescript
// Example 400 response
{
  "error": "Validation failed",
  "details": [
    { "field": "subscription.endpoint", "message": "Must be a valid URL" },
    { "field": "favorites[0].lines", "message": "Array must contain at least 1 item(s)" }
  ]
}
```

### Push Subscription Schemas

- `pushSubscribeRequestSchema` — POST /api/push/subscribe
- `pushUnsubscribeRequestSchema` — DELETE /api/push/unsubscribe
- `pushUpdateRequestSchema` — PATCH /api/push/subscription

### Commute Analysis Schema

- `commuteAnalyzeRequestSchema` — POST /api/commute/analyze

## Security Headers

**File**: `packages/server/src/middleware/security-headers.ts`

All responses include:

| Header | Value | Purpose |
|--------|-------|---------|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; manifest-src 'self'; worker-src 'self'` | Prevents XSS attacks |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME type sniffing |
| `X-Frame-Options` | `DENY` | Prevents clickjacking |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Controls referrer information |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | HSTS for 1 year |

### CSP Notes

- `'unsafe-inline'` for styles is required for Tailwind CSS utility classes
- No `'unsafe-inline'` or `'unsafe-eval'` for scripts
- `data:` allowed for images (inline icons)

## Trip Share Link TTL

**File**: `packages/server/src/trip-lookup.ts`

Trip share links (`/trip/:tripId`) have a 24-hour TTL enforced server-side:

- First access records the timestamp
- Subsequent accesses check if 24 hours have elapsed
- Expired trips return 404
- Memory cleanup prunes stale entries every 5 minutes

```typescript
const TRIP_SHARE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
```

## Data Privacy (No PII Server-Side)

**File**: `packages/server/src/push/subscriptions.ts`

Push subscriptions are stored with privacy-by-design:

- **Keyed by SHA-256 hash** of the subscription endpoint URL
- **No user identity** stored (no email, device ID, or account)
- **No location data** — geolocation is client-side only, never sent to backend
- **No PII in favorites** — favorites/commutes stored in browser localStorage, never sent to server

```typescript
function hashEndpoint(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex");
}
```

### Data Stored Server-Side

| Data | Storage | PII? |
|------|---------|------|
| Push subscription keys | SQLite | No (hashed endpoint) |
| Favorite tuples (station/line/direction) | SQLite | No (transit data only) |
| Quiet hours settings | SQLite | No (preference only) |
| Morning scores | SQLite | No (preference only) |

### Data Stored Client-Side Only

- Full favorites list with labels
- Commute configurations
- Trip journal/history
- Fare tracking (OMNY cap)
- Tap history for context sorting
- Settings (theme, refresh interval, etc.)
- Geolocation coordinates

## Security Checklist

- [x] Cloudflare WAF: rate-limit rule for /api/* at 100 req/min per IP
- [x] Hono middleware: in-memory token bucket rate limiter (60 req/min per IP)
- [x] Zod schemas for all API inputs: push subscription payload, commute analysis request
- [x] Return 400 with structured error for invalid payloads
- [x] CSP headers: default-src 'self', script-src 'self', style-src 'self' 'unsafe-inline'
- [x] Security headers: X-Content-Type-Options, X-Frame-Options, Referrer-Policy
- [x] Trip share link TTL: 24h expiry enforced server-side
- [x] Audit: verify no PII stored server-side (push subs keyed by hash, no user identity)
