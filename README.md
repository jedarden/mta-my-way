# MTA My Way

A mobile-first Progressive Web App (PWA) for daily NYC subway commuters. Design philosophy: **open and see your data in under three seconds** — your pinned stations front and center, no map to dismiss, no search to type.

Version 0.0.1

## Preview

Screenshots are available in `docs/`.

## Features

1. **Favorites-first home screen** — pinned stations with inline live arrival countdowns; GPS-powered 60-second onboarding for first-time users
2. **Real-time arrivals** — live countdowns per station, both directions; pull-to-refresh; 30s auto-refresh; offline fallback via PWA cache
3. **Transfer intelligence** — commute analyzer shows whether you should transfer using real-time train positions: RECOMMENDED / DIRECT / ALSO POSSIBLE, with walk-time comparison
4. **Predictive delay detection** — tracks vehicle positions across consecutive 30s polls; when a train's inter-station time exceeds 2× the scheduled baseline, generates early-warning synthetic alerts before MTA publishes them
5. **Smart alerts** — filtered to your exact stations, lines, and directions; plain-language rewrites of raw MTA alert text; push notifications via WebPush/VAPID
6. **Context-aware switching** — detects home/commute/transfer context from location, time patterns, and tap history; frequency-sorts favorites during commute hours
7. **Interactive transit map** — SVG map with pan/zoom, real-time pulsing train positions, line filtering, and tap-to-detail modal
8. **Trip journal** — automatic trip tracking with full history and statistics (average, median, std dev, trends)
9. **Subway Year** — shareable annual summary card (Spotify Wrapped-style), exportable as PNG; configurable time window
10. **Fare tracking** — OMNY fare cap progress and weekly spending
11. **Elevator/escalator status** — equipment status per station from the MTA ENE feed
12. **Health dashboard** — `/status` HTML page and `/api/health` JSON endpoint with per-feed circuit-breaker state

## Transit Data

All real-time data is from the [MTA GTFS-RT Protobuf API](https://api.mta.info/). An API key is optional but recommended to avoid rate limiting — register free at https://api.mta.info/

| Feed | Lines |
|------|-------|
| gtfs | 1 2 3 4 5 6 7 S GS |
| gtfs-ace | A C E H FS |
| gtfs-bdfm | B D F M |
| gtfs-g | G |
| gtfs-jz | J Z |
| gtfs-l | L |
| gtfs-nqrw | N Q R W |
| gtfs-si | SIR (Staten Island Railway) |

Polling intervals: 30s (arrivals), 60s (alerts), 300s (equipment). Static schedule from MTA's published GTFS ZIP.

## Quick Start

**Prerequisites:** Node.js ≥ 22, npm ≥ 10

```bash
git clone https://github.com/jedarden/mta-my-way.git
cd mta-my-way
npm install

# One-time: process GTFS static schedule data
npm run process-gtfs --workspace=packages/server

# Start development server
npm run dev --workspace=packages/server
```

App available at `http://localhost:3001`. Set `MTA_API_KEY` in your environment to avoid MTA rate limits during development.

## Docker

```bash
docker build -t mta-my-way .
docker run \
  -e ALLOWED_HOSTS=your.domain.com \
  -e MTA_API_KEY=your_key_here \
  -p 3000:3000 \
  mta-my-way
```

The container exposes port 3000.

## Environment Variables

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `PORT` | No | `3000` | HTTP listen port |
| `NODE_ENV` | No | — | `production` or `development` |
| `ALLOWED_HOSTS` | Yes (prod) | — | Comma-separated hostnames; server refuses to start without this in production |
| `MTA_API_KEY` | Recommended | — | MTA GTFS-RT API key; works without but may be rate-limited. Register at https://api.mta.info/ |
| `VAPID_PUBLIC_KEY` | For push | — | Generate: `npx web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | For push | — | Never commit to version control |
| `VAPID_SUBJECT` | For push | `mailto:mta-my-way@example.com` | Contact URI included in push requests |
| `PASSWORD_PEPPER` | Recommended | — | `openssl rand -hex 32` |
| `EMAIL_PROVIDER` | No | `console` | `ses`, `smtp`, `sendgrid`, or `console` |
| `EMAIL_FROM` | No | `noreply@mtamyway.com` | Sender address for transactional email |
| `LOG_LEVEL` | No | `info` | `debug`, `info`, `warn`, `error` |

## Development Commands

```bash
npm test                        # all unit/integration tests (Vitest)
npm run test:watch              # watch mode
cd tests/e2e && npm test        # Playwright E2E tests
npm run lint                    # Biome + ESLint
npm run format                  # Biome format --write
npm run typecheck               # tsc --build
```

**Code style:** Biome for formatting, TypeScript strict mode throughout. Commit prefix convention: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`.

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| GET | `/status` | Health dashboard (HTML) |
| GET | `/api/health` | Per-feed status and circuit-breaker state (JSON) |
| GET | `/api/metrics` | Prometheus metrics |
| GET | `/api/arrivals/:stationId` | Real-time arrivals for a station |
| GET | `/api/stations` | Full GTFS station list |
| GET | `/api/stations/search` | Type-ahead search by name, line, or cross-street |
| GET | `/api/routes` | Route index |
| POST | `/api/commute/analyze` | Analyze routes between origin and destination |
| GET | `/api/alerts` | All current MTA alerts |
| GET | `/api/alerts/:lineId` | Alerts filtered by line |
| GET | `/api/push/vapid-public-key` | VAPID public key for push registration |
| POST | `/api/push/subscribe` | Register device for push notifications |
| GET | `/api/trip/:tripId` | Live trip progress (stop-by-stop) |

## Observability

OpenTelemetry (OTLP gRPC), Prometheus `/api/metrics`, Pino structured JSON logging. See [docs/observability.md](docs/observability.md) for configuration details.

## Project Structure

```
mta-my-way/
├── packages/
│   ├── shared/           # TypeScript types and constants (feed config, polling intervals)
│   ├── server/
│   │   ├── src/          # Hono app, pollers, GTFS parsers, push engine, context engine
│   │   ├── data/         # Generated GTFS JSON + SQLite (subscriptions, trips, sessions)
│   │   └── scripts/      # process-gtfs.mjs
│   └── web/
│       └── src/
│           ├── screens/  # Home, Station, Map, Commute, Alerts, Journal, Stats, ...
│           ├── components/
│           ├── hooks/
│           └── stores/   # Zustand (favorites, journal, settings, fare)
├── tests/
│   └── e2e/              # Playwright tests
├── docs/
│   ├── plan/plan.md      # Architecture and roadmap
│   ├── testing.md
│   ├── security.md
│   └── observability.md
└── Dockerfile            # Multi-stage: build-web → build-server → runtime
```

## Documentation

- [Testing Guide](docs/testing.md)
- [Security](docs/security.md)
- [Observability](docs/observability.md)
- [Architecture Plan](docs/plan/plan.md)

## License

MIT
