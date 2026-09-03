# MTA My Way — IngressRoute Rules, Service Mappings & Route-Isolation Verdict

**Consolidated document** — extends the earlier route-map writeup (bead
mtamyway-7bd2a141) into the single authoritative reference for this umbrella.
Covers: final IngressRoute rules table, service→deployment mappings,
live-vs-manifest reconciliation, and the route-leakage verdict.

**Date:** 2026-09-02 (live state re-read during consolidation; §1–§2
re-verified the same day under sub-child mtamyway-0b795445 and again
2026-09-03 under sub-child mtamyway-90809e33)
**Beads:** umbrella mtamyway-d26515d5 (parent mtamyway-6895e35e) · child 1
mtamyway-e4710698 (live entrypoint attempt → DNS-blocked, evidence in
`docs/notes/public-entrypoint-live-verification.md`) · child 2
mtamyway-77ee82ce (manifest/router-config isolation) · child 3
mtamyway-fab296c6 (this doc), split into four section children — sub-child 1
mtamyway-0b795445 covers §1–§2
**Method:** `declarative-config/k8s/apexalgo-iad/mta-my-way/` manifests +
read-only kubectl (`http://traefik-apexalgo-iad:8001`) + `dig`/RDAP. **No
cluster mutation was performed.** Supersedes, and reconciles, the two ad-hoc
reports `docs/ingressroute-validation-findings.md` and
`docs/api-health-route-isolation-report.md` (both still on disk — their removal
is the follow-up child's job, not this one's).

## 1. Scope correction: the routes live in `apexalgo-iad`, not `ardenone-cluster`

The original task pointed at `http://traefik-ardenone-cluster:8001`. That
cluster has **no** mta-my-way resources at all — no namespace, no IngressRoutes,
no services (`get ns | grep -i mta` → empty; `get ingressroutes -A | grep -i
mta` → empty; `get all -n mta-my-way` → `No resources found`). Every mta-my-way
resource lives in the **apexalgo-iad** cluster, matching the manifest directory
`declarative-config/k8s/apexalgo-iad/mta-my-way/`. All live state below was read
from `http://traefik-apexalgo-iad:8001`.

Re-verified under mtamyway-0b795445 (2026-09-02): the ardenone-cluster negative
result still holds (`get ns | grep -i mta` and `get ingressroutes -A | grep -i
mta` both empty; no mta `IngressRouteTCP`/`IngressRouteUDP` either — the only
TCP route on either cluster is the unrelated `devpod-observer/kubectl-proxy-tcp`),
and on apexalgo-iad the single IngressRoute still carries exactly the four rules
of §2, with EndpointSlices at `mta-my-way` 0 endpoints, `mta-my-way-core` 3/3
`ready=false`/`serving=false`, `mta-my-way-stateful` 1 not-ready endpoint
(internal, unrouted), and `mta-my-way-sse` still the namespace's only
middleware. Its `last-applied-configuration` annotation still matches the
current `ingressroute.yaml` spec, so live and git agree at this re-read too.

Re-verified again under mtamyway-90809e33 (2026-09-03): same negatives and
same four rules, row for row. apexalgo-iad still has exactly one IngressRoute
(`mta-my-way/mta-my-way`) and one middleware (`mta-my-way-sse`), no
`IngressRouteTCP/UDP` matching mta, entryPoints `websecure` / TLS
`certResolver: letsencrypt`, and the same external-dns annotations
(`hostname: mtamyway.com`, tunnel-UUID `target`, `ttl: "300"`); live spec
diffs clean against the git `ingressroute.yaml`. Backend state per §2 row:
`mta-my-way` EndpointSlice **0 endpoints**; `mta-my-way-core` **3 endpoints,
all not ready** (pods `0/1` — two CrashLoopBackOff, one ImagePullBackOff);
`mta-my-way-stateful` **1 endpoint, not ready** (pod `0/1`
ImagePullBackOff), still in no rule. (This read corroborated readiness via
pod status and the v1 Endpoints object — core/stateful list only
notReadyAddresses, legacy lists none — because the EndpointSlice's
`ready`/`serving` conditions were unset at read time.) Both ad-hoc reports
remain on disk untouched; their deletion stays with the follow-up child.

## 2. Final IngressRoute rules table

There is exactly **one** IngressRoute — `mta-my-way/mta-my-way` — and no
separate "stateful" IngressRoute exists. Searched: every live IngressRoute in
apexalgo-iad (`get ingressroutes -A` filtered on "mta"), every
`IngressRouteTCP/UDP` (none), the whole declarative-config tree (`grep -rnil
mta` → only `k8s/apexalgo-iad/mta-my-way/ingressroute.yaml`), and full git
history for ever-added `*mta*` manifests. The "public vs stateful" split lives
at the **service** level, not the ingress level.

Shared by all rules: host `mtamyway.com` · entryPoints `websecure` · TLS
`certResolver: letsencrypt`. Annotations: `external-dns…/hostname:
mtamyway.com`, `…/target: cef7d924-cd61-43dc-89ad-1df7de2699bf.cfargotunnel.com`,
`…/ttl: "300"`.

| # | Path match | Middlewares | Target service | Port | Backend state (live) | Predicted live result * |
|---|---|---|---|---|---|---|
| 1 | `PathPrefix(/push/)` | none | `mta-my-way` (legacy monolith) | 3000 | **DEAD — 0 endpoints** (152+ days) | 502/503 from Traefik (no upstream) |
| 2 | `PathPrefix(/auth/)` | none | `mta-my-way` (legacy monolith) | 3000 | **DEAD — 0 endpoints** | 502/503 from Traefik |
| 3 | `PathPrefix(/password-reset/)` | none | `mta-my-way` (legacy monolith) | 3000 | **DEAD — 0 endpoints** | 502/503 from Traefik |
| 4 | catch-all — everything else: `/`, `/arrivals`, `/stations`, `/alerts`, PWA assets, **and** the app's real `/api/*` paths | `mta-my-way-sse` (headers: `X-Accel-Buffering: no`, `Cache-Control: no-cache`) | `mta-my-way-core` | 3000 | **UNHEALTHY — 3 endpoints, all `ready=false`/`serving=false`** | 502/503 from Traefik |

\* "Predicted" because live HTTP responses cannot be observed today — the host
does not resolve (§6). Traefik returns a gateway error when a routed service
has no ready endpoints; the exact code depends on Traefik version/config, hence
502 **or** 503.

Single middleware in the namespace, attached only to rule 4:
`mta-my-way-sse` → `spec.headers.customRequestHeaders: {X-Accel-Buffering:
"no"}`, `customResponseHeaders: {X-Accel-Buffering: "no", Cache-Control:
"no-cache"}` (live spec identical to `ingressroute.yaml`).

`mta-my-way-stateful` (:3001) appears in **no** rule — internal only, by design.

### Path mismatch (rules vs what the app serves)

The app registers everything under `/api/*` (`packages/server/src/app.ts`:
`/api/push/*`, `/api/auth/*`, `/api/auth/password/*` at `app.ts:2935–2968`,
`/api/trips*`, `/api/journal/*`) plus `/health` and `/api/health` at their own
paths. Rules 1–3 match `/push/`, `/auth/`, `/password-reset/` — with no
`stripPrefix`/rewrite middleware, so even a healthy legacy backend would have
returned 404 for every request those rules capture. The correct prefixes are
`/api/push/`, `/api/auth/`, `/api/auth/password-reset/` (or a catch-all `/api/`
split). The parent bead's expected rule set (`/api/arrivals` public /
`/auth`, `/session`, `/admin` stateful) also does not match the live config.

## 3. Service → deployment mapping

All three services and their backing deployments, live state as of the
consolidation re-read:

| Service (live) | Port | Selector | Backing Deployment | Replicas desired/ready | Image | Manifest in git? | Referenced by IngressRoute? |
|---|---|---|---|---|---|---|---|
| `mta-my-way` | 3000 | `app.kubernetes.io/name=mta-my-way` | `mta-my-way` (legacy monolith) | 0 / 0 (all 7 ReplicaSets desired 0) | `ronaldraygun/mta-my-way:0.0.82` | **No** — deleted in monolith retire (`cb0fd902`, `4ac1d48d`, `b4c7faa8`) | Yes — rules 1–3 (dead backend) |
| `mta-my-way-core` | 3000 | `app.kubernetes.io/name=mta-my-way-core` | `mta-my-way-core` | 2 / 0 | `ronaldraygun/mta-my-way:0.0.289` | Yes — `service-core.yaml`, `deployment-core.yaml` | Yes — rule 4 (catch-all) |
| `mta-my-way-stateful` | 3001 | `app.kubernetes.io/name=mta-my-way-stateful` | `mta-my-way-stateful` | 1 / 0 | `ronaldraygun/mta-my-way:0.0.289` | Yes — `service-stateful.yaml`, `deployment-stateful.yaml` | **No — internal only** |

### Environment wiring (the internal-only stateful path)

| Deployment | Key env (manifest = live) | Meaning |
|---|---|---|
| `mta-my-way-core` | `CORE_ONLY=true`, `STATEFUL_SERVICE_URL=http://mta-my-way-stateful:3001` (`deployment-core.yaml:67`,`:70`) | Stateless tier. Never mounts push/trips/journal routes (`app.ts:2014`, `app.ts:2179`); reaches the stateful subsystem only over cluster-internal DNS via `STATEFUL_SERVICE_URL` (`packages/server/src/services/stateful-client.ts:31–32`) |
| `mta-my-way-stateful` | `CORE_ONLY=false`, `PORT=3001` (`deployment-stateful.yaml:60`,`:63`) | Stateful tier (SQLite single-writer, `replicas: 1`, PVC + Recreate) |

## 4. Live-vs-manifest reconciliation

| Object | Git manifest | Live | Agreement |
|---|---|---|---|
| IngressRoute `mta-my-way` | `ingressroute.yaml` (4 rules, TLS, annotations) | Identical — `last-applied-configuration` annotation matches the current manifest, and a manual spec diff is clean | ✅ match |
| Middleware `mta-my-way-sse` | `ingressroute.yaml` | Spec matches | ✅ match |
| Service + Deployment `mta-my-way` (legacy) | **Removed from git** (monolith retire) | **Still live** (age 153d, deployment 0/0, service no endpoints) | ❌ **orphan** — ArgoCD cannot prune it (see InvalidSpecError below) |
| Service + Deployment `mta-my-way-core` | `service-core.yaml` / `deployment-core.yaml` (:3000, replicas 2, env above) | Matches (selector/ports/env/image) | ✅ match |
| Service + Deployment `mta-my-way-stateful` | `service-stateful.yaml` / `deployment-stateful.yaml` (:3001, replicas 1, env above) | Matches | ✅ match |
| Rollout state | One desired ReplicaSet per deployment | **Three `mta-my-way-core` ReplicaSets simultaneously at `DESIRED 1`** (`6bd9f88b54`, `7fbcbdb69c`, `9b48f8bdc`) + three older at 0 | ❌ stuck mid-rollout — no pod ever became ready, so the rollout never advanced |
| external-dns record | Annotation targets the Cloudflare tunnel UUID | `mtamyway.com` **NXDOMAIN**; tunnel UUID has **no record**; `external-dns-apexalgo-iad` pod `0/1 CreateContainerConfigError` for **4d18h** (re-verified) | ❌ annotation never materialized |
| ArgoCD app `mta-my-way` | managed by declarative-config | sync `Unknown`, health `Unknown`, condition `InvalidSpecError: error getting cluster by server "https://hcp-99476ebb-….spot.rackspace.com": cluster … not found` (re-verified) | ❌ **reconciliation stopped entirely** — no git change (including the monolith retire) has reached the cluster |

Live pod detail (re-read during consolidation; shifted slightly since the first
read): core pods `…-xkztj` CrashLoopBackOff (75 restarts, exit
`ERR_MODULE_NOT_FOUND: file:///app/packages/server/dist/proto/compiled.js` —
broken image, not broken node), `…-7ftcx` ImagePullBackOff (node rewrites the
image to `localhost:7439/…` and the local registry mirror answers **not found**
for `0.0.289`), `…-hdg4b` was Pending on insufficient CPU at first read and has
since scheduled onto another node and joined the CrashLoop (12 restarts).
Stateful pod `…-xglg5` ImagePullBackOff — not ingress-referenced, but core's
stateful proxying depends on it, so it is equally down.

## 5. Route-leakage verdict

**Verdict: no leakage of the stateful subsystem through the public host —
PROVEN at the router-config/manifest level. Live HTTP confirmation BLOCKED,
with the blocker evidence in §6 (this is the umbrella's sanctioned fallback
path).**

What decides it:

1. **The stateful service is in no router rule — proven by exhaustive
   enumeration.** The cluster has exactly one IngressRoute (§2), verified
   live and matching git. It references exactly two services: `mta-my-way`
   (:3000, rules 1–3) and `mta-my-way-core` (:3000, rule 4). `mta-my-way-stateful`
   (:3001) appears in no rule, in no other IngressRoute/IngressRouteTCP/UDP in
   the cluster, and in no manifest in git. Traefik routes only to services named
   in rules, so **no public request can reach `mta-my-way-stateful` through the
   router** — this is a property of the router config, not of request outcomes.
2. **The app's real stateful paths fall to core, which does not serve them.**
   `/api/push/*`, `/api/trips*`, `/api/journal/*` (and `/api/auth/*` beyond the
   password endpoints) match the catch-all → `mta-my-way-core`, which runs
   `CORE_ONLY=true` and never mounts those routes (`app.ts:2014`, `:2179`) —
   404 at the application. Core's only bridge to stateful is
   `STATEFUL_SERVICE_URL` over cluster-internal DNS, reachable only from inside
   the cluster.
3. **Caveat A — the legacy stateful-ish paths *are* routed, but to a dead
   backend.** `/push/`, `/auth/`, `/password-reset/` have rules pointing at
   `mta-my-way`, which has had zero endpoints for 152+ days. Predicted outcome
   is a Traefik 502/503 — i.e. no data exposure, but for "backend is dead"
   reasons rather than isolation reasons. Even if revived, the legacy
   deployment runs image `0.0.82`, which predates the current app's route set.
4. **Caveat B — live HTTP could not be observed at all.** Child 1's curl attempt
   (`docs/notes/public-entrypoint-live-verification.md`) hit the documented
   completable-blocker outcome: all 12 public and stateful paths fail at DNS
   resolution (curl exit 6, `http_code=000`). "Stateful paths return no 2xx" is
   therefore **trivially true today but vacuous** — nothing resolves, so no
   path of any kind returns anything. The non-vacuous isolation proof is the
   router-config enumeration in point 1 plus the application-level
   route-mounting verified in code (`CORE_ONLY` conditional mounting,
   `app.ts:2014`, `:2179`).

## 6. Remaining blockers (why live verification is impossible today)

1. **DNS — the public host does not exist because the domain is not
   registered.** `mtamyway.com` is NXDOMAIN on three independent resolvers, has
   **no NS delegation**, and the Verisign .com registry RDAP returns **404** —
   the domain is **not registered** (child 1's RDAP evidence, root cause of the
   DNS failure). The external-dns target
   `cef7d924-….cfargotunnel.com` also has zero answers — no record for the
   tunnel UUID. `cloudflared` itself is healthy (3× Running in `traefik`,
   token-based), so the tunnel leg works once DNS exists.
2. **external-dns for this cluster is down.** `utilities/external-dns-apexalgo-iad-6ffc7c97b-vgb2z`
   is `0/1 CreateContainerConfigError` for 4d18h (re-verified) — likely a
   missing/misnamed secret key in its env. Even with the domain registered and
   delegated, no record would be created. (The other instance,
   `externaldns-ardenone-com`, is Running — it manages a different zone.)
3. **No healthy backend behind any rule.** Legacy: 0 endpoints, 153d. Core: 0/2
   ready — one pod CrashLooping on a broken image (missing
   `dist/proto/compiled.js`), one pull-failing on the `localhost:7439` registry
   mirror, one CPU-starved until it could schedule and then CrashLooping too.
   Stateful: ImagePullBackOff.
4. **ArgoCD has stopped reconciling the app.** `InvalidSpecError` — the
   registered Rackspace Spot control-plane URL no longer exists. Consequences
   visible in the cluster: the retired monolith Deployment/Service are still
   live, three core ReplicaSets coexist mid-rollout, and no git fix has reached
   the cluster. **Every remediation depends on fixing this first.**

## 7. Umbrella acceptance criteria — verified live vs manifest level

Umbrella mtamyway-d26515d5, criterion by criterion:

| # | Criterion | Outcome | Level |
|---|---|---|---|
| 1 | curl-based verification against the public entrypoint: public paths return expected success statuses; stateful paths on the public host do not route | **Half-blocked, half-vacuous.** Child 1 executed the curls — all 12 paths fail at DNS (exit 6, `http_code=000`), so the success-status half is **unachievable** and the do-not-route half passes only **vacuously** (nothing resolves). Evidence: `docs/notes/public-entrypoint-live-verification.md`. | attempted live; blocked by DNS |
| 2 | If live verification is blocked, record the blocker with evidence and verify at the manifest/router-config level instead | **DONE.** Blockers recorded with fresh evidence (§6); router-config isolation verified (§2, §5). | **manifest/router-config** |
| 3 | Consolidated document with the final rules table, service mappings, route-leakage verdict | **DONE** — this document (§2, §3, §5). | manifest + live read |
| 4 | The two prior ad-hoc reports are reconciled or superseded by the consolidated doc | **DONE** — reconciled in §8. Physical deletion deliberately deferred to the follow-up child per the split plan. | n/a |

Child-level roll-up: child 1 (live entrypoint) → executed, closed on the
documented blocker path with `docs/notes/public-entrypoint-live-verification.md`;
child 2 (manifest/router-config isolation) → done, findings folded into
§2/§4/§5; child 3 (this doc) → consolidation; child 4 → delete the two ad-hoc
reports.

## 8. Reconciliation of the two ad-hoc reports

### `docs/ingressroute-validation-findings.md` (2026-09-01, bead mtamyway-6895e35e)

Consistent with this document — no endpoints for 152+ days, path mismatch,
unhealthy deployments. **Superseded by this doc** (which adds the exhaustive
single-IngressRoute proof, the exact rules/middlewares, the ArgoCD/DNS blockers,
and the verdict). One correction to carry forward: its "Zero-Scale Deployments"
is imprecise — only the legacy monolith is truly scaled to zero (`0/0` desired).
Core and stateful have non-zero *desired* replicas (2 and 1) and **zero ready
pods** because of CrashLoop/ImagePull failures. Scaling up is not the fix;
fixing the image, the registry mirror, and scheduling is.

### `docs/api-health-route-isolation-report.md` (2026-09-01)

Two different reliability tiers in one document:

- **Application-level claims — valid, grounded in code.** The `CORE_ONLY`
  conditional mounting (`app.ts:2014`, `:2179`; `config.ts:58`), the
  auth/CSRF/same-origin/rate-limit/validation layers, and the endpoint
  inventory match the codebase. Its e2e test claims apply to the application
  process, not to the public entrypoint.
- **Routing-level claims — wrong, superseded by this doc.** Its "Traffic
  Splitting Architecture" section describes rules `/api/push/*` → full
  deployment, `/api/trips*` → full, `/api/journal/*` → full, `/api/auth/*` →
  full, `/*` → core. **No such IngressRoute exists.** The real rules are §2:
  `/push/`, `/auth/`, `/password-reset/` → the retired legacy service (dead),
  catch-all → core. Its "✅ All public API endpoints healthy" verdict likewise
  does not apply to the live public entrypoint, which has no DNS and no healthy
  backend — that verdict can only have come from tests against a locally run
  server.

Both files remain on disk untouched; the follow-up child deletes them once this
document lands.

## 9. Recommended remediation (ordered by dependency)

1. **Re-register the apexalgo-iad cluster in ArgoCD** (its control-plane URL
   changed) so reconciliation resumes; prune the orphaned monolith
   Deployment/Service once sync works.
2. **Fix the image:** make `0.0.289`+ include
   `packages/server/dist/proto/compiled.js` (build step emitting `dist/proto/`),
   and populate/repair the node-local registry mirror at `localhost:7439` (or
   drop the mirror) so new tags are pullable.
3. **Fix core scheduling:** free or request less CPU on apexalgo-iad nodes so
   the core pod schedules reliably.
4. **Register and delegate `mtamyway.com`, and fix external-dns**
   (`CreateContainerConfigError`) so the external-dns annotation can create the
   tunnel CNAME. Registration is a registrar purchase — an operator action.
5. **Correct the route paths** to the app's real `/api/…` prefixes (and
   consider re-pointing rules 1–3 at `mta-my-way-core`, which already proxies
   stateful calls to `mta-my-way-stateful:3001` — the legacy service should then
   be deleted, not revived).
6. **Only then re-run live curl verification** against the public entrypoint to
   convert §5's router-config-level verdict into live-HTTP evidence.

## 10. Evidence commands

All read-only, against `http://traefik-apexalgo-iad:8001`:
`get ingressroutes/middlewares/services/endpointslices/deployments/replicasets/pods/events -n mta-my-way`,
`get applications -n argocd mta-my-way -o json`,
`logs <pod> -n mta-my-way [--previous]`,
`get pods -n utilities | grep external-dns`. DNS via `dig` (default resolver
and `@1.1.1.1`); registration via Verisign .com RDAP. Manifests read from
`declarative-config/k8s/apexalgo-iad/mta-my-way/`. App routes:
`packages/server/src/app.ts`, `packages/server/src/config.ts`,
`packages/server/src/services/stateful-client.ts`.
