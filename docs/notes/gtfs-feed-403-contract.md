# GTFS feed 403 — request contract and reproduction

Captured 2026-09-17 for bead `mtamyway-16a9001f` (split child of pulse finding
`mtamyway-ff2cff3c`: `"Feed fetch failed" … "HTTP 403 Forbidden"`, feed `gtfs`,
poller.ts). This note documents the wire contract so the 403 can be reproduced
and fixed without touching the live MTA service. Request path and configuration
were checked against the source again for bead `mtamyway-d0fd5602`.

## Affected poller path

`packages/server/src/index.ts` starts this poller after the HTTP server begins
listening. The request path is:

```
index.ts: initPoller(stations, routes) → startPoller() → runPoll()
  → Promise.allSettled(SUBWAY_FEEDS.map(fetchFeed))     // poller.ts:82
  → fetchFeed(config)
    → retry(() => tracedFetch(config.url, { headers, signal, method }))  // poller.ts:209
    → tracedFetch adds trace context, then calls global fetch(url, options)
      // observability/tracing.ts
    → !response.ok → throw Error("HTTP 403 Forbidden"), .status = 403
  → catch → recordFeedFailure + recordFeedError("forbidden")
          + logger.error("Feed fetch failed", { feed, status: 403, latency_ms, error })
```

`SUBWAY_FEEDS` is the only URL source for the poller: the alerts feed
(`MTA_ALERTS_FEED_URL`) and the ENE feed are full literal URLs and are
correctly shaped. The fixture downloader
(`packages/server/src/test/fixtures/feeds/download-fixtures.ts`) builds its
URLs the same way and was corrected in the same commit as `feeds.ts`; it only
ever runs as a maintainer tool.

## Wire contract

There are no credential values in this contract. The MTA feed request carries
no application authentication material:

| Input | Value |
|---|---|
| Expected URL | `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2F<feed>`; for example, the `gtfs` feed ends in `nyct%2Fgtfs` |
| Configured URL | `SUBWAY_FEEDS[i].url` expands to exactly the expected shape — feed id concatenated directly onto `MTA_FEED_BASE_URL` (fixed under `mtamyway-40979fb6`, commit `de2de5f4`) |
| Method | `GET` |
| Explicit poller header | `Accept: application/x-protobuf` |
| Trace header | `tracedFetch` adds `traceparent` from its active span before calling global `fetch`; its value is generated per trace, not a credential |
| Auth headers | The poller supplies no `Authorization`, `x-api-key`, or `Cookie` header |
| Timeout | `AbortSignal.timeout(15_000)` |
| Retry | shared `retry` with the poller's `isRetryable`: network + timeout errors, 429, 5xx only |

The URL inputs are the hard-coded `MTA_FEED_BASE_URL` and eight `SUBWAY_FEEDS`
entries in `packages/shared/src/constants/feeds.ts`, imported by `poller.ts`
through `@mta-my-way/shared`. The poller does not read a feed URL or API key
from environment variables, a config file, or a credential store. In
particular, `MTA_API_KEY` does not affect this request. Trace context comes
from `packages/server/src/observability/tracing.ts`; its `traceparent` header
is added when a span is active. This poller runs inside child spans, so that
header is expected on its outbound calls. Headers inserted by the underlying
Node HTTP client are outside the explicit application contract.

## Root cause (live-verified 2026-09-17)

`SUBWAY_FEEDS` builds each URL as `` `${MTA_FEED_BASE_URL}/${feed.id}` ``
(`packages/shared/src/constants/feeds.ts:50` and siblings) while
`MTA_FEED_BASE_URL` already ends in the encoded segment `nyct%2F`. Every wire
URL therefore contains a literal `/` after the `%2F`:

| URL shape | Live result |
|---|---|
| `…/nyct%2F/gtfs` (current — `%2F` **plus** literal `/`) | **403 Forbidden** |
| `…/nyct%2Fgtfs` (encoded segment only) | **200 OK** |

This matches the constraint documented on `MTA_FEED_BASE_URL` since the 2025
endpoint change: path segments must use `%2F`, and a literal `/` in the path
segment is rejected with 403. The template's extra `/` reintroduced exactly
that literal slash. **Fixed under `mtamyway-40979fb6`** (commit `de2de5f4`):
`feeds.ts` (and the fixture downloader) now concatenate the feed id directly
onto the base, and the defect-pin assertions in
`packages/server/src/gtfs-feed-403.test.ts` require the corrected shape.

## Error-path behavior (explicit 403 handling, mtamyway-d4811957)

A 403 is non-retryable (only 429 and 5xx retry), so each forbidden feed costs
exactly one wire attempt. `classifyFeedError` in `poller.ts` names the bucket:
a completed 403 response is classified `forbidden` — a distinct, expected
feed rejection, not the generic `http_error` (which remains the bucket for
any other completed 4xx), not `rate_limited` (429), not `server_error` (5xx).
The classification lands in both the `recordFeedError` metric label and the
`feed.error_type` span attribute.

The failure diagnostic is an error-level structured log carrying exactly:

| Field | Content |
|---|---|
| `feed` | feed id (identity) |
| `status` | HTTP status, only when a response completed |
| `latency_ms` | time-to-failure |
| `error` | the thrown error message (`HTTP 403 Forbidden`) |

Redaction contract (pinned by the test suite): the diagnostic carries no
request headers, no credential material, and no response-body data — the
rejected body is never even read. The logger additionally redacts
sensitive-named context keys and serializes errors as name/message/stack/code
only. The request itself carries no credentials (Accept-only header contract
above), so there is no secret that could leak on this path. The failure is
recorded in the feed cache with message `HTTP 403 Forbidden`, and
`Promise.allSettled` semantics keep the rest of the poll running — a 403
never rejects the cycle; it completes with `feeds_ok`/`feeds_failed` counts
reflecting the split.

## Deterministic reproduction

`packages/server/src/gtfs-feed-403.test.ts` (server vitest project, fully
offline — responses are mocked at the `tracedFetch` seam):

1. **Request shape** — every configured feed reaches the mocked `tracedFetch`
   exactly once with the configured URL set, `GET`, and the `Accept`-only
   header object supplied by `poller.ts`. The mock does not exercise the later
   `traceparent` injection or global `fetch` call.
2. **Defect pin** — every `SUBWAY_FEEDS` URL contains `%2F/`; the alerts
   literal does not.
3. **403 on one feed** — the pulse log signature (`"Feed fetch failed"`,
   `feed: "gtfs"`, `status: 403`, `error: "HTTP 403 Forbidden"`),
   `recordFeedFailure`, `recordFeedError(…, "forbidden")`, the safe
   diagnostic shape, and the other 7 feeds still succeeding.
4. **403 on all feeds** — one attempt per feed, no retry across the full
   backoff ladder, `feeds_ok: 0 / feeds_failed: 8`, poll completes.
5. **Redaction scan** — across every diagnostic emitted during a fully
   forbidden poll: no credential-shaped key (mirror of the logger's
   `SENSITIVE_FIELDS`), no echoed request headers, no response-body read.
