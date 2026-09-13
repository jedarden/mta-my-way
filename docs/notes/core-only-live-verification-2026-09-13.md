# CORE_ONLY live-deployment verification — 2026-09-13 (mtamyway-7c6738b0)

Read-only evidence, child 1 of 4 of umbrella mtamyway-0cd48bf7. Live reads via
`kubectl --server=http://traefik-apexalgo-iad:8001` (get/jsonpath only, no
mutations), 2026-09-13 ~19:00 UTC. No code was changed; this file is the only
artifact.

## 1. What 221da5ec landed at HEAD — confirmed, nothing re-removed

`git show 221da5ec --stat`: 5 files, +124/−126 —

- `packages/server/src/routes/password-reset.routes.ts` −106: the four
  `CORE_ONLY` proxy-to-stateful branches removed; docstring (lines 7–9) now
  documents that the public ingress routes `/api/auth/*` to the stateful
  deployment and the handlers never execute in the CORE_ONLY core.
- `packages/server/src/routes/preferences.routes.ts` −29: same for the one
  proxy branch; docstring lines 9–11.
- `password-reset.routes.test.ts` +39: deployment-mode-independence tests.
- `docs/notes/ingressroute-route-map.md` §16 added; ADR-001 status updated.

Grep at HEAD: `process.env["CORE_ONLY"]` appears in exactly one non-test src
file — `packages/server/src/config.ts:58` (`parseBooleanEnv`), exported as
`CORE_ONLY` at config.ts:67. `app.ts:70` imports it from `./config.js`. Both
route files mention `CORE_ONLY` only inside docstrings. The stale-fact
correction in the dispatch prompt is accurate.

## 2. Cluster/namespace identification (from declarative-config, pre-kubectl)

The manifests live at `declarative-config/k8s/apexalgo-iad/mta-my-way/` →
cluster **apexalgo-iad**, namespace **mta-my-way**. The parent's suggested
`--server=http://traefik-apexalgo-iad:8001` was **correct**, not a copy-paste
error. `application.yaml.disabled` / `kustomization.yaml.disabled` sit in the
folder; the live IngressRoute's `argocd.argoproj.io/tracking-id` names ArgoCD
app `mta-my-way-ns-apexalgo-iad`.

## 3. Live deployments (read 2026-09-13 19:00 UTC)

| Deployment | Image | Desired/Ready | CORE_ONLY env | Env source |
|---|---|---|---|---|
| `mta-my-way-core` | `ronaldraygun/mta-my-way:0.0.289` | 2 / **0** | `true` (live env literal) | `deployment-core.yaml` env block |
| `mta-my-way-stateful` | `ronaldraygun/mta-my-way:0.0.289` | 1 / **0** | `false`, `PORT=3001` | `deployment-stateful.yaml` |
| `mta-my-way` (legacy monolith) | `0.0.82` | **0 / 0**, age 164d | — | manifests deleted from git |

- Core also sets `STATEFUL_SERVICE_URL=http://mta-my-way-stateful:3001` and
  `STATEFUL_TIMEOUT_MS=2000` (live). After 221da5ec no route handler consumes
  the stateful client for proxying: `callStatefulService` has zero callers in
  `app.ts`; `getStatefulStatus` (app.ts:1215, `/api/health`) is the sole
  consumer — §16.2's "survives for health reporting only" holds at HEAD.
- **Pods: nothing is ready anywhere.** Core: 2× CrashLoopBackOff (exit 1,
  91 and 43 restarts) + 1× ImagePullBackOff across **three ReplicaSets
  simultaneously DESIRED 1** (`6bd9f88b54`/`7fbcbdb69c`/`9b48f8bdc`) — the
  stuck-rollout shape route-map §3 noted on 09-03 persists. Stateful:
  ImagePullBackOff 3d17h. Pull error text: `localhost:7439/...0.0.289: not
  found` (node-side registry mirror has no such tag); Docker Hub's public
  tags API also 404s for the repo (private-or-absent — indistinguishable
  unauthenticated). Config verdicts below are unaffected, but no endpoint is
  actually answerable until the image/rollout recovers.
- **Prune drift:** the legacy `mta-my-way` Deployment (0/0) and Service
  (`mta-my-way`:3000) are still live although their manifests were deleted
  (declarative-config `2e6c0521` + `21f6deee` "retire the monolith"). The
  `ingressroute.yaml` header claim "the retired `mta-my-way` monolith service
  they used to target no longer has a Deployment" is wrong against the live
  cluster — the Deployment object exists, merely scaled to zero.

## 4. Live IngressRoute `mta-my-way/mta-my-way`

Exactly one IngressRoute cluster-wide references an mta service. Live rules
match git `ingressroute.yaml` @ `d23c4a87` cell-for-cell, and match route-map
§16.1:

| # | Match | Middlewares | Service | Port |
|---|---|---|---|---|
| 1 | `Host(mtamyway.com) && PathPrefix(/api/push/)` | — | `mta-my-way-stateful` | 3001 |
| 2 | `… PathPrefix(/api/auth/)` | — | `mta-my-way-stateful` | 3001 |
| 3 | `… PathPrefix(/api/preferences)` | — | `mta-my-way-stateful` | 3001 |
| 4 | `… PathPrefix(/api/trips)` | — | `mta-my-way-stateful` | 3001 |
| 5 | `… PathPrefix(/api/journal/)` | — | `mta-my-way-stateful` | 3001 |
| 6 | `… PathPrefix(/auth/)` | — | `mta-my-way-stateful` | 3001 |
| 7 | catch-all `Host(mtamyway.com)` | `mta-my-way-sse` | `mta-my-way-core` | 3000 |

entryPoints `websecure`, TLS `certResolver: letsencrypt`, three external-dns
annotations (Cloudflare Tunnel target). **`mta-my-way-stateful` DOES appear in
IngressRoute rules — six of them** (rules 1–6). If app-layer proxy wiring were
ever restored, the proxy target named by `STATEFUL_SERVICE_URL` is Service
`mta-my-way-stateful:3001` (ClusterIP 10.21.226.199) — the same object rules
1–6 already hit directly.

## 5. Definitive list — endpoints NOT mounted in the CORE_ONLY core

Everything below is inside one of the four `if (!CORE_ONLY)` gates in
`packages/server/src/app.ts` and therefore 404s **if a request reaches the
core**:

| Prefix / endpoint | Gate (app.ts lines) |
|---|---|
| `/api/push/*` incl. `/api/push/vapid-public-key` (mount at 1924) | 1919–2075 |
| `/api/trips*`, `/api/journal/*` (writes; same-origin-guarded) | 2084–2422 |
| `/auth/:providerId`, `/auth/:providerId/callback`, `/auth/signout`, `/api/auth/oauth/*` | 2694–2819 |
| `/api/auth/password/*`, `GET|PUT /api/preferences`, `GET /api/auth/session`, `POST /api/auth/session/revoke` | 2828–2894 |

Everything else (arrivals, stations, routes, alerts, commute, equipment,
positions, health/metrics, read-only `/api/trip/:tripId`, PWA assets) mounts
unconditionally → catch-all rule 7 → core, as designed. Note
`PathPrefix(/api/trips)` does **not** capture singular `/api/trip/:tripId`, so
the read-only trip lookup keeps flowing to the core.

**Reachability framing:** these endpoints are *not publicly unreachable* —
ingress rules 1–6 route their prefixes to the stateful deployment
(`CORE_ONLY=false`), which mounts every one of them. The parent audit's "the
core publicly 404s `/api/auth/password/*`, `/api/auth/session`,
`/api/preferences`" is true only as the counterfactual *if such a request
reached the core*; in the live topology it never does. That is precisely why
221da5ec's removal of the proxy branches was safe.

## 6. Route-map doc cross-check (lines ~136 and ~180)

- `docs/notes/ingressroute-route-map.md:136` — "`mta-my-way-stateful` (:3001)
  appears in **no** rule — internal only, by design": **historical, now
  false against live** (stateful is in 6 rules). The §2 table (lines 120–127),
  the 09-03 re-verification paragraphs (139–160) and §15.2/§15.4 are likewise
  superseded; §16 (lines 1263+) is the current record and **my independent
  live read confirms it unchanged** — no drift between §16 and the cluster.
- Line ~180 (§ "Path mismatch"): its complaint (rules matched `/push/`,
  `/auth/`, `/password-reset/` without strip) is resolved by `d23c4a87`'s
  rewrite — live rules now use the real `/api/*` prefixes.
- Doc's own caveat that responses are "Predicted" because the host does not
  resolve still applies — see §7.

## 7. Public reachability today — DNS is the blocker

`mtamyway.com` is **NXDOMAIN** at both 1.1.1.1 and 8.8.8.8, and Verisign RDAP
for the domain returns 404 — the domain is **not registered**. The
external-dns annotations (Cloudflare Tunnel) cannot publish a record for an
unregistered domain, so no public endpoint is reachable today regardless of
cluster config; every "publicly reachable/unreachable" verdict above is
config-level.

## 8. Drift register (new findings beyond the parent's stale-fact correction)

1. `deployment-core.yaml` comment — VAPID env "still needed for public key
   endpoint" — and `ingressroute.yaml` comment "(vapid-public-key is also
   served by the core)": both stale at HEAD. `/api/push/vapid-public-key` is
   mounted only inside the `!CORE_ONLY` gate (app.ts:1924) and
   `getVapidPublicKey`'s only consumer is app.ts:1929; the core serves no VAPID
   endpoint, making its `VAPID_PUBLIC_KEY` env unused.
2. Legacy `mta-my-way` Deployment/Service still live despite git deletion
   (ArgoCD prune drift) — contradicts the ingressroute.yaml header's "no
   longer has a Deployment".
3. Route-map §2/§15 superseded by §16 (doc-internal, already flagged by §16's
   header; lines 120–160/1161+ carry no inline marker).
