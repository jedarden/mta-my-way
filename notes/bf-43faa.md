# Playwright webServer Settings - Bead bf-43faa

Extracted from `/home/coding/mta-my-way/tests/e2e/playwright.config.ts`

## webServer Configuration (lines 56-64)

| Setting | Value | Line |
|---------|-------|------|
| timeout | `300 * 1000` (300 seconds / 5 minutes) | 60 |
| port | `3001` (implicit from `url`) | 58 |
| health-check URL | `/api/health` (documented) | 61-64 |
| reuseExistingServer | `!process.env.CI` (true locally, false in CI) | 59 |
| command | `cd ../.. && TEST_MODE=true npx tsx packages/server/src/index.ts` | 57 |

## Key Findings

1. **Health-check URL exists:** `/api/health` is explicitly documented as the health check endpoint (lines 61-64)
2. **Long timeout:** 300 seconds accounts for GTFS data loading, migrations, feed poller, VAPID key generation, and OpenTelemetry initialization
3. **reuseExistingServer:** Disabled in CI, enabled locally for faster dev iteration
4. **No retry settings at webServer level:** Retries are configured at test level (`retries: process.env.CI ? 2 : 0` at line 14), not on webServer
