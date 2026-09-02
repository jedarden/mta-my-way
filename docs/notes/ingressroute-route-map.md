# IngressRoute → Backend Route Map

**Date:** 2026-09-02
**Bead:** mtamyway-7bd2a141 (parent: mtamyway-6895e35e)
**Method:** declarative-config manifests + read-only kubectl (`http://traefik-apexalgo-iad:8001`). No cluster mutation performed.

## Scope correction: the routes live in `apexalgo-iad`, not `ardenone-cluster`

The task pointed at `http://traefik-ardenone-cluster:8001`. That cluster has **no**
mta-my-way resources at all — no namespace, no IngressRoutes, no services
(`get ns | grep -i mta` → empty; `get ingressroutes -A | grep -i mta` → empty;
`get all -n mta-my-way` → `No resources found`). Every mta-my-way resource lives
in the **apexalgo-iad** cluster, matching the manifest directory
`declarative-config/k8s/apexalgo-iad/mta-my-way/`. All live state below was read
from `http://traefik-apexalgo-iad:8001`.

## Inventory

| Object | Kind | Age | Git manifest | Live == git? |
|---|---|---|---|---|
| `mta-my-way` (ns `mta-my-way`) | IngressRoute | 153d | `ingressroute.yaml` | yes (4 rules, TLS, annotations all match) |
| `mta-my-way-sse` | Middleware | — | `ingressroute.yaml` | yes |
| `mta-my-way` | Service :3000 | 153d | **removed from git** (monolith retire commits `4ac1d48d`, `b4c7faa8`, `cb0fd902`) | orphan |
| `mta-my-way` | Deployment (0/0) | 153d | **removed from git** (same retire) | orphan |
| `mta-my-way-core` | Service :3000 | 13d | `service-core.yaml` | yes |
| `mta-my-way-core` | Deployment (0/2) | 13d | `deployment-core.yaml` | yes (`ronaldraygun/mta-my-way:0.0.289`) |
| `mta-my-way-stateful` | Service :3001 | 13d | `service-stateful.yaml` | yes |
| `mta-my-way-stateful` | Deployment (0/1) | 13d | `deployment-stateful.yaml` | yes (`ronaldraygun/mta-my-way:0.0.289`) |

**There is exactly ONE IngressRoute — no separate "stateful" IngressRoute exists.**
Searched: every live IngressRoute in apexalgo-iad (`get ingressroutes -A`, filtered
by host/service name containing "mta" → only `mta-my-way/mta-my-way`), every
`IngressRouteTCP/UDP` (none), the whole declarative-config tree (`grep -rnil mta`
→ only `k8s/apexalgo-iad/mta-my-way/ingressroute.yaml`), and full git history for
ever-added `*mta*` manifests (only that one `ingressroute.yaml` ever existed).
The "public vs stateful" split is at the **service** level, not the IngressRoute
level: the stateful subsystem is internal-only, reached by core through
`STATEFUL_SERVICE_URL=http://mta-my-way-stateful:3001` (`deployment-core.yaml:71`),
never through any ingress rule. The parent bead's expected rule set
(`/api/arrivals` public / `/auth`, `/session`, `/admin` stateful) does not match
the live configuration.

## Route rules (all 4, both "public" and "stateful" backends)

Host for every rule: `mtamyway.com` · entryPoints: `websecure` · TLS: `certResolver: letsencrypt`
Annotations: `external-dns…/hostname: mtamyway.com`, `…/target: cef7d924-cd61-43dc-89ad-1df7de2699bf.cfargotunnel.com`, `…/ttl: "300"`

| # | Path match | Middlewares | Target service | Port | Backend state |
|---|---|---|---|---|---|
| 1 | `PathPrefix(/push/)` | none | `mta-my-way` (legacy monolith) | 3000 | **DEAD — 0 endpoints** |
| 2 | `PathPrefix(/auth/)` | none | `mta-my-way` (legacy monolith) | 3000 | **DEAD — 0 endpoints** |
| 3 | `PathPrefix(/password-reset/)` | none | `mta-my-way` (legacy monolith) | 3000 | **DEAD — 0 endpoints** |
| 4 | (catch-all — everything else: `/`, `/arrivals`, `/stations`, `/alerts`, PWA assets) | `mta-my-way-sse` (headers: `X-Accel-Buffering: no`, `Cache-Control: no-cache`) | `mta-my-way-core` | 3000 | **UNHEALTHY — 2 endpoints, both `ready=false`** |

`mta-my-way-stateful` (:3001) appears in **no** rule — internal only, by design.

## Live backend state (read 2026-09-02)

| Backend | Endpoints | Backing pods | Evidence |
|---|---|---|---|
| `mta-my-way` :3000 | **none** (EndpointSlice `mta-my-way-bm49w` has `endpoints: []`) | none — Deployment 0/0; all 7 ReplicaSets `DESIRED 0` (newest 37d old) | Service is an ArgoCD orphan: its manifest was deleted from git (monolith retire), but the live object was never pruned. Service age 153d corroborates the prior "no endpoints 152+ days" finding. |
| `mta-my-way-core` :3000 | 2, **both `ready: false`, `serving: false`** | `…-xkztj` 10.20.74.99 Running but **CrashLoopBackOff** (51 restarts); `…-7ftcx` 10.20.74.82 **ImagePullBackOff**; `…-hdg4b` no IP, **Pending** — `0/3 nodes available: 3 Insufficient cpu` | Rollout stuck: 3 ReplicaSets (0.0.289, plus older) all coexist at 1 desired. |
| `mta-my-way-stateful` :3001 | 1, **`ready: false`** | `…-xglg5` 10.20.74.74 **ImagePullBackOff** | Not ingress-referenced, but core's stateful proxying depends on it, so it is equally down. |

### Root causes behind the unhealthy pods

1. **CrashLoop (core):** image `0.0.289` is missing a build artifact — container
   exits immediately with `ERR_MODULE_NOT_FOUND:
   file:///app/packages/server/dist/proto/compiled.js` (from `kubectl logs`, current
   and `--previous`, identical). The image is broken, not the node.
2. **ImagePullBackOff (core + stateful):** nodes rewrite
   `ronaldraygun/mta-my-way:0.0.289` to `localhost:7439/ronaldraygun/mta-my-way:0.0.289`
   (node-local registry mirror) and the mirror answers **not found** for `0.0.289`
   (`Failed to pull image … not found`). One core pod only starts because the image
   is cached on its node — and then hits cause 1.
3. **Pending (core):** insufficient CPU on all 3 nodes; cannot schedule even the
   broken image.

## Additional findings (beyond backend liveness)

### A. Ingress is unreachable from the internet: the domain is NXDOMAIN

- `dig mtamyway.com A` → **status: NXDOMAIN**; `dig mtamyway.com NS` → empty with
  `com. SOA` in authority — the name has **no delegation at all** (unregistered or
  never delegated to Cloudflare).
- The external-dns target `cef7d924-….cfargotunnel.com` → **NOERROR with zero
  answers** (NODATA) — no DNS record exists for that tunnel UUID either.
- The cluster's external-dns for this cluster is down:
  `utilities/external-dns-apexalgo-iad-6ffc7c97b-vgb2z` is `0/1
  CreateContainerConfigError` for **4d16h**. Even with the domain delegated, no
  record would be created. (The other instance, `externaldns-ardenone-com`, is
  Running — it manages a different zone.)
- cloudflared itself is healthy (3× `Running` in `traefik`), running token-based
  (`--token`), so its ingress config comes from the Cloudflare dashboard, not the
  cluster configmap. The tunnel leg is fine once DNS exists.

### B. ArgoCD has stopped reconciling the app entirely

`argocd/mta-my-way`: sync `Unknown`, health `Unknown`, condition
`InvalidSpecError: error getting cluster by server
"https://hcp-99476ebb-4133-4a21-ac6a-6e2bdf6794c0.spot.rackspace.com": cluster … not found`.
The Rackspace Spot control-plane endpoint ArgoCD has registered no longer exists.
Consequences visible in the cluster: the retired monolith Deployment/Service are
still live, three core ReplicaSets coexist mid-rollout, and no git fix (including
the monolith retire) has reached the cluster. **Every remediation below depends on
fixing this first.**

### C. Path mismatch: three routes target paths the app does not serve

The app registers everything under `/api/*` (`packages/server/src/app.ts`:
`/api/push/*`, `/api/auth/*`, `/api/auth/password`, `/api/push/vapid-public-key`,
password-reset routes) plus `/health` at the root. Routes 1–3 match `/push/`,
`/auth/`, `/password-reset/` — with no `stripPrefix`/rewrite middleware, so even a
healthy legacy backend would have returned 404 for every request those rules
capture. The correct prefixes are `/api/push/`, `/api/auth/`, `/api/auth/password-reset/`
(or a catch-all `/api/` split). Confirms and extends the mismatch noted in
`docs/ingressroute-validation-findings.md`.

## Net effect

**Zero of the four rules can serve traffic.** Rules 1–3 target a service with no
endpoints; rule 4 targets pods that are CrashLooping/pull-failing/Pending; and the
host `mtamyway.com` does not resolve in DNS regardless.

## Recommended remediation (ordered by dependency)

1. **Re-register the apexalgo-iad cluster in ArgoCD** (its control-plane URL
   changed) so reconciliation resumes; prune the orphaned monolith
   Deployment/Service once sync works.
2. **Fix the image:** make `0.0.289`+ include `packages/server/dist/proto/compiled.js`
   (build step emitting `dist/proto/`), and populate/repair the node-local registry
   mirror at `localhost:7439` (or drop the mirror) so new tags are pullable.
3. **Fix core scheduling:** free or request less CPU on apexalgo-iad nodes so the
   core pod schedules.
4. **Fix external-dns** (`CreateContainerConfigError` — likely a missing/misnamed
   secret key in its env) and delegate `mtamyway.com` to Cloudflare so the
   external-dns annotation can create the tunnel CNAME.
5. **Correct the route paths** to the app's real `/api/…` prefixes (and consider
   re-pointing rules 1–3 at `mta-my-way-core`, which already proxies stateful calls
   to `mta-my-way-stateful:3001` — the legacy service should then be deleted, not
   revived).

## Evidence commands

All read-only, against `http://traefik-apexalgo-iad:8001`:
`get ingressroutes/middlewares/services/endpointslices/deployments/pods/events -n mta-my-way`,
`get applications -n argocd mta-my-way -o json`, `logs <pod> [-n mta-my-way] [--previous]`,
`get pods -A | grep external-dns|cloudflared`. DNS via `dig` (default resolver and
`@1.1.1.1`). Manifests read from `declarative-config/k8s/apexalgo-iad/mta-my-way/`.
