# Security Implementation

This document describes the security model implemented for MTA My Way.

## Defense in Depth

The security model uses multiple layers:

```
                    ┌─────────────────────────────────────┐
                    │         Cloudflare Edge             │
                    │  - TLS termination                  │
                    │  - DDoS protection                  │
                    │  - WAF rate limiting (100/min/IP)   │
                    │  - Bot Management                   │
                    └─────────────────┬───────────────────┘
                                      │
                                      ▼
                    ┌─────────────────────────────────────┐
                    │         Hono Application            │
                    │  - Token bucket rate limiter        │
                    │  - Zod input validation             │
                    │  - CSP headers                      │
                    │  - Security headers                 │
                    └─────────────────────────────────────┘
```

## Layer 1: Cloudflare WAF

### Rate Limiting Rule

Configure in the Cloudflare dashboard under **Security > WAF > Rate Limiting Rules**:

| Field | Value |
|-------|-------|
| Rule name | `mta-my-way-api-rate-limit` |
| Expression | `(http.request.uri.path contains "/api/")` |
| Rate | 100 requests per 1 minute per IP |
| Action | Block |
| Response | 429 Too Many Requests |

### Configuration Steps

1. Navigate to the Cloudflare dashboard for your domain
2. Go to **Security > WAF > Rate Limiting Rules**
3. Click **Create rate limiting rule**
4. Set the rule name to `mta-my-way-api-rate-limit`
5. Under **When incoming requests match**, use custom expression:
   ```
   (http.request.uri.path contains "/api/")
   ```
6. Under **Rate limiting**, set:
   - **Requests**: 100
   - **Period**: 1 minute
   - **Group by**: IP
7. Under **Action**, select **Block**
8. Click **Deploy**

### Bot Management

Cloudflare's free tier Bot Management is enabled automatically. It provides:
- Browser integrity checks
- Known bot identification
- Challenge pages for suspicious traffic

## Layer 2: Hono Application

### Rate Limiting

Location: `packages/server/src/middleware/rate-limiter.ts`

- **Algorithm**: Token bucket
- **Limit**: 60 requests per minute per IP
- **Refill**: 1 token per second
- **Max bucket**: 60 tokens
- **IP extraction**: `CF-Connecting-IP` > `X-Forwarded-For` > fallback to "unknown"
- **Response**: 429 with `{ error: "Too many requests", retryAfter: <seconds> }`
- **Cleanup**: Stale buckets pruned every 5 minutes

The in-memory rate limiter resets on pod restart. This is acceptable for a single-container deployment where Cloudflare WAF is the primary defense.

### Input Validation

Location: `packages/shared/src/schemas/`

All API inputs are validated with Zod schemas:

| Endpoint | Schema File | Schema Name |
|----------|-------------|-------------|
| `POST /api/push/subscribe` | `push.ts` | `pushSubscribeRequestSchema` |
| `DELETE /api/push/unsubscribe` | `push.ts` | `pushUnsubscribeRequestSchema` |
| `PATCH /api/push/subscription` | `push.ts` | `pushUpdateRequestSchema` |
| `POST /api/commute/analyze` | `commute.ts` | `commuteAnalyzeRequestSchema` |

Validation middleware (`packages/server/src/middleware/validation.ts`) returns structured errors:

```json
{
  "error": "Validation failed",
  "details": [
    { "field": "subscription.endpoint", "message": "Invalid url" }
  ]
}
```

### Content Security Policy

Location: `packages/server/src/middleware/security-headers.ts`

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
connect-src 'self';
font-src 'self';
manifest-src 'self';
worker-src 'self'
```

Note: `'unsafe-inline'` for styles is required for Tailwind CSS. This is safe because:
1. No user input is rendered into styles
2. CSP blocks inline scripts (no XSS vector)
3. Tailwind generates all styles at build time

### Security Headers

All responses include:

| Header | Value | Purpose |
|--------|-------|---------|
| `X-Content-Type-Options` | `nosniff` | Prevents MIME sniffing |
| `X-Frame-Options` | `DENY` | Prevents clickjacking |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limits referrer leakage |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Forces HTTPS for 1 year |

## Data Privacy

### No PII Stored Server-Side

- **Push subscriptions**: Keyed by SHA-256 hash of the endpoint URL. The endpoint is stored but not used for identification.
- **Favorites**: Stored in browser localStorage, never sent to the server.
- **Commute journal**: Browser localStorage only.
- **Geolocation**: Used client-side only, never transmitted.

### Trip Share Links

Location: `packages/server/src/trip-lookup.ts`

- Trip data is ephemeral (in-memory, no persistence)
- **24-hour TTL enforced**: Trips older than 24 hours from first access return `null`
- Stale entries pruned every 5 minutes
- No user identity associated with shared trips

### Push Subscription Storage

Location: `packages/server/src/push/subscriptions.ts`

```sql
CREATE TABLE push_subscriptions (
  endpoint_hash TEXT PRIMARY KEY,  -- SHA-256 of endpoint
  endpoint TEXT NOT NULL,          -- Full endpoint URL (for sending)
  p256dh TEXT NOT NULL,            -- VAPID public key
  auth TEXT NOT NULL,              -- VAPID auth secret
  favorites TEXT NOT NULL,         -- JSON array of station/line tuples
  quiet_hours TEXT NOT NULL,       -- JSON object
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

No user identity, email, or device ID is stored. Subscriptions are identified solely by their cryptographic endpoint hash.

## Summary Checklist

- [x] Cloudflare WAF: rate-limit rule for /api/* at 100 req/min per IP
- [x] Hono middleware: in-memory token bucket rate limiter (60 req/min per IP)
- [x] Zod schemas for all API inputs (push subscription, commute analysis)
- [x] Return 400 with structured error for invalid payloads
- [x] CSP headers: default-src 'self', script-src 'self', style-src 'self' 'unsafe-inline'
- [x] Security headers: X-Content-Type-Options, X-Frame-Options, Referrer-Policy, HSTS
- [x] Trip share link TTL: 24h expiry enforced server-side
- [x] Audit: No PII stored server-side (push subs keyed by hash, no user identity)
