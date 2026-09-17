# GTFS feed 403 — request contract and reproduction

Captured 2026-09-17 for bead `mtamyway-16a9001f` (split child of pulse finding
`mtamyway-ff2cff3c`: `"Feed fetch failed" … "HTTP 403 Forbidden"`, feed `gtfs`,
poller.ts). This note documents the wire contract so the 403 can be reproduced
and fixed without touching the live MTA service.

## Affected poller path

`packages/server/src/poller.ts`:

```
startPoller() → runPoll()
  → Promise.allSettled(SUBWAY_FEEDS.map(fetchFeed))     // poller.ts:82
  → fetchFeed(config)
    → retry(() => tracedFetch(config.url, { headers, signal, method }))  // poller.ts:209
    → !response.ok → throw Error("HTTP 403 Forbidden"), .status = 403     // poller.ts:218-225
  → catch → recordFeedFailure + recordFeedError("http_error")
          + logger.error("Feed fetch failed", …)         // poller.ts:283 — the pulse signature
```

`SUBWAY_FEEDS` is the only affected URL source: the alerts feed
(`MTA_ALERTS_FEED_URL`) and the ENE feed are full literal URLs and are
correctly shaped. The fixture downloader
(`packages/server/src/test/fixtures/feeds/download-fixtures.ts:112`) builds the
same broken shape as SUBWAY_FEEDS, but only ever runs as a maintainer tool.

## Wire contract

There are no credential values in this contract — the MTA has required no API
key since 2025, so the request carries no auth material at all:

| Input | Value |
|---|---|
| URL | `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2F<feed>` (per `SUBWAY_FEEDS[i].url`) |
| Method | `GET` |
| Headers | exactly `{ Accept: "application/x-protobuf" }` — no Authorization / x-api-key / token / cookie |
| Timeout | `AbortSignal.timeout(15_000)` |
| Retry | shared `retry` with the poller's `isRetryable`: network + timeout errors, 429, 5xx only |

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
segment is rejected with 403. The template's extra `/` reintroduces exactly
that literal slash. The fix (later work) is a one-character change in
`feeds.ts` — drop the `/` from the template or the trailing `%2F` from the
base — after which the defect-pin assertions in
`packages/server/src/gtfs-feed-403.test.ts` ("pins the wire-URL defect…")
should be flipped to require the corrected shape.

## Error-path behavior (already correct, pinned by the test)

A 403 is non-retryable (only 429 and 5xx retry), so each forbidden feed costs
exactly one wire attempt. The error is classified `http_error` in
`recordFeedError` (neither `rate_limited` nor `server_error`), the failure is
recorded in the feed cache with message `HTTP 403 Forbidden`, and
`Promise.allSettled` semantics keep the rest of the poll running — the cycle
completes with `feeds_ok`/`feeds_failed` counts reflecting the split.

## Deterministic reproduction

`packages/server/src/gtfs-feed-403.test.ts` (server vitest project, fully
offline — responses are mocked at the `tracedFetch` seam):

1. **Request shape** — every configured feed is fetched exactly once with the
   documented URL set, `GET`, and the exact `Accept`-only header object.
2. **Defect pin** — every `SUBWAY_FEEDS` URL contains `%2F/`; the alerts
   literal does not.
3. **403 on one feed** — the pulse log signature (`"Feed fetch failed"`,
   `feed: "gtfs"`, `error: "HTTP 403 Forbidden"`), `recordFeedFailure`,
   `recordFeedError(…, "http_error")`, and the other 7 feeds still succeeding.
4. **403 on all feeds** — one attempt per feed, no retry across the full
   backoff ladder, `feeds_ok: 0 / feeds_failed: 8`, poll completes.
