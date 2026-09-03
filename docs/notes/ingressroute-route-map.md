# MTA My Way — IngressRoute Rules, Service Mappings & Route-Isolation Verdict

**Consolidated document** — extends the earlier route-map writeup (bead
mtamyway-7bd2a141) into the single authoritative reference for this umbrella.
Covers: final IngressRoute rules table, service→deployment mappings,
live-vs-manifest reconciliation, and the route-leakage verdict.

**Date:** 2026-09-02 (live state re-read during consolidation; §1–§2
re-verified the same day under sub-child mtamyway-0b795445 and again
2026-09-03 under sub-children mtamyway-90809e33 and mtamyway-007709be; §3
re-verified 2026-09-03 under sub-child mtamyway-31ca9ebc; §4/§6/§7
re-verified 2026-09-03 under sub-child mtamyway-de63ea97; §5 re-verified and
the closing summary added 2026-09-03 under sub-child mtamyway-15b024d1)
**Beads:** umbrella mtamyway-d26515d5 (parent mtamyway-6895e35e) · child 1
mtamyway-e4710698 (live entrypoint attempt → DNS-blocked, evidence in
`docs/notes/public-entrypoint-live-verification.md`) · child 2
mtamyway-77ee82ce (manifest/router-config isolation) · child 3
mtamyway-fab296c6 (this doc), split into four section children — sub-child 1
mtamyway-0b795445 covers §1–§2, sub-child 2 mtamyway-31ca9ebc covers §3,
sub-child 3 mtamyway-de63ea97 covers §4/§6/§7, sub-child 4 mtamyway-15b024d1
covers §5 and the closing summary (§11)
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

Re-verified under mtamyway-007709be (2026-09-03 01:05 UTC, this split child):
unchanged. ardenone-cluster still has **zero** mta-my-way resources of any
kind — `get namespaces | grep -i mta`, `get ingressroutes -A | grep -i mta`,
and `get middlewares -A | grep -i mta` all empty, `get all -n mta-my-way` →
`No resources found` — and apexalgo-iad still has **exactly one** mta
IngressRoute (`mta-my-way/mta-my-way`) and **exactly one** mta middleware
(`mta-my-way/mta-my-way-sse`), confirmed by counting namespace/name over full
`-A -o json` listings of both resource types rather than grep alone.

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

Coverage is exhaustive: `get services -n mta-my-way` returns **exactly these
three** Services and nothing else — every Service in the namespace has a row
below, and none is a deployment-less/ExternalName service (each selector maps
1:1 onto a live Deployment).

Re-verified under mtamyway-31ca9ebc (2026-09-03 02:33 UTC, this split child)
by a fresh read-only read of
services/endpointslices/endpoints/deployments/replicasets/pods at
`http://traefik-apexalgo-iad:8001`. This read had the EndpointSlice
`ready`/`serving` conditions properly populated — the mtamyway-90809e33 read
had found them unset and corroborated readiness via pod status instead — so
the readiness column below is endpoint-native, not inferred. Nothing moved:
`mta-my-way` still **0 endpoints** with its Deployment `0/0` across all seven
ReplicaSets; `mta-my-way-core` still **3 endpoints, every one
`ready=false`/`serving=false`** (pods: 2× CrashLoopBackOff, 1×
ImagePullBackOff; still three ReplicaSets simultaneously at `DESIRED 1`);
`mta-my-way-stateful` still **1 endpoint, not ready** (ImagePullBackOff).
Images unchanged (`0.0.82` legacy, `0.0.289` core and stateful).

A second read under the same bead (02:51 UTC) re-confirmed every cell of the
table above unchanged — core's pod set had churned (new CrashLoopBackOff pod
`…-zf2xh`, 21 restarts at an 85m age, joining `…-fdxrb` at 40; `…-nl8nw` still
ImagePullBackOff) and the stateful pod was caught mid `ErrImagePull` rather
than in the backoff phase — and produced one correction: the three commit
hashes this row previously cited for the manifest deletion (`cb0fd902`,
`4ac1d48d`, `b4c7faa8`) do not exist in the declarative-config history
(`git cat-file -t` fails on all three against a clean, up-to-date clone), so
they are replaced above with the verified retire sequence: `8231717e`
("retire the monolith Deployment/Service (step 2 of 2)") deleted
`deployment.yaml`/`service.yaml` and their `.disabled` copies, `bab2c396`
re-added them the same day, and `95850c44` ("prune step", also 2026-08-30)
deleted them for good — it is the last commit in the repo's history to touch
either file, and neither exists at HEAD.

Re-verified once more at the same bead's re-dispatch (2026-09-03 04:04 UTC) by a
fresh read-only read of
services/deployments/replicasets/pods/endpoints/endpointslices plus an
IngressRoute service cross-check at the same endpoint. Every cell of the table
below is unchanged: still exactly three Services; `mta-my-way` 0 endpoints with
its Deployment 0/0 across all seven ReplicaSets; `mta-my-way-core` 2 desired /
0 ready, the same three ReplicaSets (`6bd9f88b54`, `7fbcbdb69c`, `9b48f8bdc`)
still simultaneously at `DESIRED 1`, and 0 of 3 endpoints ready;
`mta-my-way-stateful` 1 desired / 0 ready, its single endpoint not ready;
images unchanged (`0.0.82` legacy, `0.0.289` core and stateful). The
EndpointSlice `ready`/`serving` conditions were unset at this read (as at the
mtamyway-90809e33 read), so readiness is endpoint-native via the v1 Endpoints
object instead — `mta-my-way` no subsets, core `ready=[0] notReady=[3]`,
stateful `ready=[0] notReady=[1]`. Pod identities churned again without moving
a cell: core is now `…-zf2xh` (CrashLoopBackOff, 36 restarts), `…-2g7xq`
(CrashLoopBackOff, 7) and `…-spzcz` (ImagePullBackOff) — still
2× CrashLoopBackOff + 1× ImagePullBackOff — and stateful is `…-wkdl6`
(ImagePullBackOff). The IngressRoute still references exactly
`mta-my-way:3000` (rules 1–3) and `mta-my-way-core:3000` (catch-all),
`mta-my-way-stateful` in none; the cited retire sequence
(`8231717e` → `bab2c396` → `95850c44`) re-verified in the declarative-config
history, `95850c44` still the last commit to touch either legacy manifest and
neither file present at HEAD.

| Service (live) | Port | Selector | Backing Deployment | Replicas desired/ready | Image | Live endpoints (ready/total) | Manifest in git? | Referenced by IngressRoute? |
|---|---|---|---|---|---|---|---|---|
| **ORPHAN — retired from git, still live** `mta-my-way` (legacy monolith) | 3000 | `app.kubernetes.io/name=mta-my-way` | `mta-my-way` (legacy monolith, scaled to zero) | 0 / 0 (all 7 ReplicaSets desired 0) | `ronaldraygun/mta-my-way:0.0.82` | **0 / 0 — DEAD since retire (~152+ days)** | **No** — deleted in the monolith retire (`8231717e` step 2 of 2, then re-added by re-adoption `bab2c396`, finally deleted by prune step `95850c44` — all 2026-08-30, verified in declarative-config history); live-only leftover ArgoCD cannot prune (§4 InvalidSpecError) | Yes — rules 1–3 (dead backend) |
| `mta-my-way-core` | 3000 | `app.kubernetes.io/name=mta-my-way-core` | `mta-my-way-core` | 2 / 0 | `ronaldraygun/mta-my-way:0.0.289` | **0 / 3 — all `ready=false`/`serving=false`** (2 CrashLoopBackOff, 1 ImagePullBackOff) | Yes — `service-core.yaml`, `deployment-core.yaml` | Yes — rule 4 (catch-all) |
| `mta-my-way-stateful` | 3001 | `app.kubernetes.io/name=mta-my-way-stateful` | `mta-my-way-stateful` | 1 / 0 | `ronaldraygun/mta-my-way:0.0.289` | **0 / 1 — not ready** (ImagePullBackOff) | Yes — `service-stateful.yaml`, `deployment-stateful.yaml` | **No — internal only** |

The lone orphan is the legacy monolith pair: both the Service **and** its
Deployment `mta-my-way` exist only in the cluster. Their manifests were
removed from `declarative-config/k8s/apexalgo-iad/mta-my-way/` in the monolith
retire commits, and because ArgoCD reconciliation for this app is stopped
(§4), nothing pruned them — the Service has carried zero endpoints for
152+ days and every one of the Deployment's seven ReplicaSets sits at
`DESIRED 0`. It is kept in this table (rather than dropped) precisely so the
rules-table references in §2 rows 1–3 resolve to a real, explained object.

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
| Namespace `mta-my-way` | `namespace.yaml` (labels `app.kubernetes.io/managed-by: argocd`, `name: mta-my-way`) | Active (154d); every manifest label present and equal; live adds only the API-server-generated `kubernetes.io/metadata.name` | ✅ match |
| PVC `mta-my-way-data` | `pvc.yaml` (5Gi, RWO, `storageClassName: sata`) | Bound, 5Gi, RWO, `sata`; live adds only server-assigned `volumeName`/`volumeMode` | ✅ match |
| SealedSecret `mta-my-way-secrets` | `sealedsecret.yaml` (two VAPID `encryptedData` keys + Opaque template) | Spec exactly equal including `encryptedData`; controller status `Synced=True`, derived Secret `mta-my-way-secrets` present with both keys | ✅ match |
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

Re-verified under mtamyway-de63ea97 (2026-09-03 03:21 UTC, this split child) by
a fresh read-only read plus an exact structural comparison — each live spec
parsed and compared for equality against its git manifest rather than eyeballed
(`declarative-config` at `9de677a6`, the `k8s/apexalgo-iad/mta-my-way/` tree
clean). **No row of the table moved.** IngressRoute and Middleware specs are
exactly equal to `ingressroute.yaml` (and the live
`last-applied-configuration` annotation still equals the manifest spec);
`service-core.yaml`, `service-stateful.yaml`, `deployment-core.yaml`, and
`deployment-stateful.yaml` all match live on selector/ports, image, replicas,
and env. The monolith Service+Deployment remain live-only orphans (legacy
EndpointSlice empty, deployment 0/0 across all seven ReplicaSets); the three
`mta-my-way-core` ReplicaSets `6bd9f88b54`/`7fbcbdb69c`/`9b48f8bdc` are still
simultaneously at `DESIRED 1`; external-dns is still `CreateContainerConfigError`,
aged to **5d6h**; the ArgoCD `InvalidSpecError` message is character-identical;
`cloudflared` is 3× Running. This read again had the EndpointSlice `ready`
conditions populated (legacy `[]` endpoints, core 3× `notReady`, stateful 1×
`notReady`) — endpoint-native agreement with the table, not inferred from pod
status. Churn since the 02:51 read: the stateful pod was recreated — `…-xglg5`
no longer exists, the ImagePullBackOff pod is now `…-x9kr4`
(`mta-my-way-stateful-5fb9bfb7dc-x9kr4`, same `DESIRED 1` ReplicaSet), with the
kubelet at 926 pull attempts over 3h33m. Core's pod trio is unchanged
(`…-zf2xh` CrashLoopBackOff 25 restarts/109m, `…-fdxrb` CrashLoopBackOff 45
restarts/4h9m, `…-nl8nw` ImagePullBackOff).

Re-verified at the same bead's re-dispatch (2026-09-03 04:30 UTC) with coverage
extended to the **whole manifest directory** — every file in
`declarative-config/k8s/apexalgo-iad/mta-my-way/` now has a row above. The
Namespace, PVC, and SealedSecret rows are new this read (all three match; the
two `*.disabled` files are inert by name and have no live counterpart), and
every comparison was structural, not eyeballed: IngressRoute and Middleware
specs are exactly equal in both directions (19 and 3 leaves), with the
`last-applied-configuration` annotation still equal to the manifest spec; both
Services and both Deployments are equal on **every** manifest-controlled field
— selector, ports, replicas, strategy, images, env, liveness/readiness probes,
`securityContext`, `terminationGracePeriodSeconds`, `imagePullSecrets:
docker-hub-registry`, prometheus annotations — with the only live-only keys
being API-server defaults (`clusterIP`/`ipFamilies`/`internalTrafficPolicy` on
Services; `successThreshold: 1` and `scheme: HTTP` inside probes;
`imagePullPolicy`, `dnsPolicy`, `restartPolicy` and peers on pod templates;
`volumeName`/`volumeMode` on the PVC; `kubernetes.io/metadata.name` on the
namespace). **No row moved and no third disagreement appeared** — the orphan
monolith pair and the stuck core rollout below are still the only ones, with
the legacy v1 Endpoints object empty and the three core ReplicaSets
`6bd9f88b54`/`7fbcbdb69c`/`9b48f8bdc` still simultaneously at `DESIRED 1`
(pods `…-zf2xh` CrashLoopBackOff 41 restarts/3h9m, `…-2g7xq` CrashLoopBackOff
12 restarts/46m, `…-spzcz` ImagePullBackOff; stateful `…-wkdl6`
ImagePullBackOff). One blocker diagnosis advanced from suspected to proven this
read — see §6.

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

Re-verified under mtamyway-15b024d1 (2026-09-03, this split child) with an
enumeration stronger than the original: rather than filtering IngressRoutes by
name, **every IngressRoute in the cluster** (`-A`) was listed and filtered on
the services its routes reference, so a cross-namespace reference from an
innocuously named route could not hide, and **every IngressRouteTCP/UDP in the
cluster** was filtered the same way. The result is unchanged and decisive: the
only mta-my-way service references anywhere in the router config are the four
of §2 — `mta-my-way:3000` three times (rules 1–3) and `mta-my-way-core:3000`
once (rule 4, `mta-my-way-sse` still its only middleware) — and
`mta-my-way-stateful` appears in none of them, in no TCP/UDP route, and in no
manifest in git. The stateful EndpointSlice still holds exactly 1 endpoint
(`ready=false`/`serving=false`), i.e. the internal tier exists and is reachable
only through its cluster-internal DNS name. The DNS blocker was also re-checked
fresh at this read: `mtamyway.com` and the tunnel UUID both return zero
answers, so live HTTP confirmation remains blocked and the verdict remains
**proven at the router-config level, not by observed requests**. The verdict's
code citations were re-read and hold: `app.ts:2014` and `app.ts:2179` are the
`!CORE_ONLY` gates that keep push/trips/journal unmounted on core, and
`stateful-client.ts:31–32` resolves `STATEFUL_SERVICE_URL` to
`http://mta-my-way-stateful:3001`.

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
   is `0/1 CreateContainerConfigError` (re-verified at **5d8h** on the
   04:30 UTC read) — and the cause is now **proven, not suspected**: its
   Deployment env sets `CF_API_TOKEN` from `secretKeyRef {name:
   cloudflare-apexalgo-iad-secret, key: CF_API_TOKEN}` in namespace
   `utilities`, and **no such Secret exists there** — the namespace's only
   Cloudflare Secret is `cloudflare-externaldns-secret` (234d), which backs the
   other, Running instance. A missing `secretKeyRef` target is exactly what
   produces `CreateContainerConfigError`. Even with the domain registered and
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

All four re-confirmed live under mtamyway-de63ea97 (2026-09-03 03:21 UTC,
this split child): `mtamyway.com` still NXDOMAIN on the default resolver,
`@1.1.1.1`, and `@9.9.9.9`, the tunnel UUID still has zero answers, and
Verisign .com RDAP still returns **404** (unregistered); external-dns is the
same pod at **5d6h** `CreateContainerConfigError`; the core crash log was
re-captured `--previous` and still ends in `ERR_MODULE_NOT_FOUND: Cannot find
module '/app/packages/server/dist/proto/compiled.js'`; deployments remain at
**0 ready replicas** (legacy 0/0 desired, core 0/2, stateful 0/1) with images
unchanged (legacy `0.0.82`, core/stateful `0.0.289` — core/stateful pull and
crash failures are the cause, not scaling); and the ArgoCD condition text is
unchanged.

Re-confirmed once more at the same bead's re-dispatch (2026-09-03 04:30 UTC):
`mtamyway.com` zero answers on all three resolvers again, tunnel UUID still
zero answers, Verisign .com RDAP still **404**; the core crash line was
re-captured `--previous` and now also names the importer —
`ERR_MODULE_NOT_FOUND: Cannot find module
'/app/packages/server/dist/proto/compiled.js' imported from
/app/packages/server/dist/alerts-parser.js`; stateful events show
`Back-off pulling image "localhost:7439/ronaldraygun/mta-my-way:0.0.289"`
(175 back-offs logged); `cloudflared` still 3× Running (pod ages churned to
38m/50m/5d4h, replica count intact); and the ArgoCD `InvalidSpecError` text is
character-identical. Blocker 2 additionally advanced from suspected to proven
this read (missing Secret, above).

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

Verification status re-checked under mtamyway-de63ea97 (2026-09-03 03:21 UTC,
split sub-child 3 of mtamyway-fab296c6): no criterion's level or outcome moved.
Criterion 1 is still live-blocked at DNS — the blocker evidence in §6 was
retaken fresh at the same read that re-verified §4, not carried forward.
Criterion 2's manifest/router-config level was strengthened this read: the
reconciliation of §4 is now an exact structural equality check of every live
spec against its git manifest, all matching, with the orphan and the stuck
rollout the only disagreements. Criteria 3 and 4 stand as written; both
ad-hoc reports were re-checked on disk and remain untouched (their deletion
still belongs to the follow-up child). Re-checked again at the same bead's
re-dispatch (2026-09-03 04:30 UTC): no criterion's level or outcome moved, the
§4 reconciliation now covers **every** manifest in the directory (nine objects
across eight files, all matching; the two `*.disabled` files are inert), and
§6's blocker 2 is proven at the root-cause level — both of which strengthen
criterion 2's manifest/router-config verification further.

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

## 11. Closing summary

This document is the **single authoritative consolidated reference** for
umbrella mtamyway-d26515d5: every finding from its children, from the
mtamyway-fab296c6 section split, and from the two superseded ad-hoc reports is
reconciled here, and future work should cite this file rather than the ad-hoc
reports. Its sections, in order:

- §1 — scope correction (the routes live in `apexalgo-iad`, not
  `ardenone-cluster`)
- §2 — the final IngressRoute rules table, plus the rules-vs-app path mismatch
- §3 — service → deployment mapping, including the internal-only stateful wiring
- §4 — live-vs-manifest reconciliation (and the stopped ArgoCD reconciliation)
- §5 — the route-leakage verdict
- §6 — remaining blockers (why live verification is impossible today)
- §7 — umbrella acceptance criteria roll-up
- §8 — reconciliation of the two ad-hoc reports
- §9 — recommended remediation, ordered by dependency
- §10 — evidence commands

Supersession, stated explicitly once more:
`docs/ingressroute-validation-findings.md` and
`docs/api-health-route-isolation-report.md` **remain on disk, untouched, and
are superseded by this document**. Their deletion is the follow-up child's job
(umbrella child 4), not this one's — this child deliberately leaves both files
in place, and both were re-checked on disk at this child's close. The
route-leakage verdict of §5 stands **PROVEN at the router-config/manifest
level** as of the mtamyway-15b024d1 re-read recorded there, with live HTTP
confirmation still blocked by the §6 DNS blocker.
