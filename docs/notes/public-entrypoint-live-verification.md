# Public-Entrypoint Live Verification (curl)

**Date:** 2026-09-02
**Bead:** mtamyway-e4710698 (child 1 of 4 of umbrella mtamyway-d26515d5; parent mtamyway-6895e35e)
**Method:** live `curl` + `dig` + RDAP from ex44. Read-only evidence only — no cluster resource was touched.
**Companion manifest-level analysis:** `docs/notes/ingressroute-route-map.md` (mtamyway-7bd2a141).

## Verdict

**BLOCKED — the public entrypoint does not exist on the public internet.**
`mtamyway.com` is **NXDOMAIN** on every resolver tested, has **no NS delegation**,
and the .com registry's RDAP returns **404** — the domain is **not registered**.
Consequently every path below fails at DNS resolution (curl exit 6, HTTP 000) and
no HTTP response of any kind was obtained. Per the acceptance criteria this is a
completable outcome; the manifest-level child takes over from here.

**No-leakage verdict: PASS (trivially).** No stateful path can return 2xx to the
public, because the host answers nothing at all. This must not be read as a
positive security control — the moment the domain is registered/delegated, the
IngressRoute rules in `apexalgo-iad` become the effective public surface, and
three of them route `/push/`, `/auth/`, `/password-reset/` to a service the app
no longer defines (see route-map doc, finding C).

## Path-by-path curl results (https://mtamyway.com, 2026-09-02 ~10:29 EDT)

Every request: `curl -sS -o /dev/null --max-time 10`, exit code 6 ("Could not
resolve host"), `http_code=000`. The app's real route prefixes were confirmed in
`packages/server/src/app.ts` before testing (`/api/health` at `app.ts:1110`,
`/health` at `app.ts:416`).

### Public paths

| Path | HTTP status | curl exit | Detail |
|---|---|---|---|
| `/` | 000 | 6 | Could not resolve host |
| `/arrivals` | 000 | 6 | Could not resolve host |
| `/stations` | 000 | 6 | Could not resolve host |
| `/alerts` | 000 | 6 | Could not resolve host |
| `/api/health` | 000 | 6 | Could not resolve host |
| `/health` | 000 | 6 | Could not resolve host |

### Stateful paths (IngressRoute rule prefixes and real app prefixes)

| Path | HTTP status | curl exit | Detail |
|---|---|---|---|
| `/push/` | 000 | 6 | Could not resolve host |
| `/auth/` | 000 | 6 | Could not resolve host |
| `/password-reset/` | 000 | 6 | Could not resolve host |
| `/api/push/vapid-public-key` | 000 | 6 | Could not resolve host |
| `/api/auth/session` | 000 | 6 | Could not resolve host |
| `/api/auth/password/policy` | 000 | 6 | Could not resolve host |

No 2xx (and no response at all) on any stateful path → **non-exposure confirmed
by non-resolvability**, with the caveat above.

## DNS evidence

All queries 2026-09-02 ~10:29 EDT.

**`dig mtamyway.com A` — NXDOMAIN on three independent resolvers** (default
Tailscale `100.100.100.100`, Cloudflare `1.1.1.1`, Google `8.8.8.8`):

```
;; ->>HEADER<<- opcode: QUERY, status: NXDOMAIN, id: 46902
;; flags: qr rd ra; QUERY: 1, ANSWER: 0, AUTHORITY: 1
;; AUTHORITY SECTION:
com.			900	IN	SOA	a.gtld-servers.net. nstld.verisign-grs.com. 1788359360 1800 900 604800 900
```

The `com. SOA` in AUTHORITY with zero answers means the name has **no
delegation** — not "registered but lame", but absent from the .com zone.

**`dig mtamyway.com NS @1.1.1.1`** → NXDOMAIN, same SOA. No nameservers exist
for the name.

**`dig mtamyway.com AAAA @1.1.1.1`** → NXDOMAIN. No v6 either.

**Tunnel target `cef7d924-cd61-43dc-89ad-1df7de2699bf.cfargotunnel.com`** (the
external-dns annotation target in `ingressroute.yaml`) → `NOERROR` with **zero
answers** (NODATA): the Cloudflare zone exists but no record was ever created
for this tunnel UUID. Consistent with the route-map finding that
`external-dns-apexalgo-iad` has been in `CreateContainerConfigError` for 4d+.

## Registration evidence (RDAP)

The authoritative Verisign .com registry RDAP:

```
curl -sS -o /dev/null --http1.1 -w "%{http_code}" https://rdap.verisign.com/com/v1/domain/mtamyway.com
→ 404
```

RDAP 404 from the registry = **the domain is not registered**. This is the root
blocker: no amount of cluster/IngressRoute/DNS-automation repair can make
`mtamyway.com` resolve until someone registers (or recovers) the domain and
delegates it to Cloudflare.

## Control checks (prove the failure is the domain, not this box)

| Check | Result |
|---|---|
| `dig @1.1.1.1 cloudflare.com A +short` | `104.16.133.229`, `104.16.132.229` — resolver works |
| `curl https://cloudflare.com` (same curl stack) | HTTP 301 — TLS+HTTP stack works |
| `curl https://rdap.org/domain/mtamyway.com` | HTTP 302 (redirect to registry RDAP, which returns the 404 above) |

## What has to happen before a re-run of this verification can produce HTTP codes

1. Register `mtamyway.com` (or pick a different public host and update the
   IngressRoute host + external-dns annotations together).
2. Delegate the zone to Cloudflare and ensure the tunnel CNAME record is created
   (fix `external-dns-apexalgo-iad`'s `CreateContainerConfigError`, or create the
   record manually in the Cloudflare dashboard).
3. Fix the cluster side so the entrypoint has a healthy backend (ArgoCD
   re-registration → image fix → scheduling fix — see route-map doc,
   "Recommended remediation").

Only then do the per-path HTTP statuses in this file's tables become meaningful;
until then this bead's blocker stands.

---

# Public-Entrypoint Evidence Pass — 2026-09-04 re-take (curl + kubectl)

**Date:** 2026-09-04, evidence taken 15:24–15:33 UTC
**Bead:** mtamyway-4662b6c7 (child 4 of 5 of umbrella mtamyway-622f4cd7)
**Method:** live `dig` + RDAP + `curl` from ex44, plus read-only `kubectl`
(`get` verbs only) against `http://traefik-apexalgo-iad:8001`. No cluster
resource was touched; no manifest was changed.
**Probe path list source:** the live IngressRoute re-read this pass (§ "Live
rule set re-read", 15:25 UTC), matching the reconciled rules table in
`docs/notes/ingressroute-route-map.md` §15.1 (mtamyway-37ddf981, 14:19 UTC) —
not an assumed list — with the real application prefixes re-confirmed against
`packages/server/src/app.ts` at HEAD (084cdca).
**Supersession note:** an earlier pass under this same bead, taken 14:54 UTC
the same day, was written to this file but never committed (that dispatch ended
before its commit step). This section replaces it: the pass was re-taken from
scratch ~40 minutes later and adds controls the earlier draft lacked — a
DoH-bypassed resolution check, an authoritative gtld-servers delegation read,
and an egress positive control.

## Verdict

**BLOCKED — unchanged from 2026-09-02 and from the earlier pass today. The
public entrypoint still does not exist on the public internet.**

- `mtamyway.com` is **NXDOMAIN** on four independent resolvers, including the
  authoritative .com gtld-servers — so the name has **no delegation** in the
  .com zone at all (A and NS both NXDOMAIN).
- RDAP at the Verisign .com registry returns **404** — the domain is **still
  not registered**. Registered controls (`google.com`, `ardenone.com`) both
  return 200 from the same endpoint, so the 404 is a real registry answer.
- All three deployments report **zero ready replicas** — so even with DNS fixed
  today, no rule would have a healthy backend.

Every request against the host failed at DNS resolution: `http_code=000`,
curl exit 6 — 20 requests (19 distinct HTTPS paths plus one plain-HTTP scheme
check), zero HTTP responses of any kind.

Per the acceptance criteria this is a completable outcome: a still-blocked
result recorded with evidence. The router-level child (mtamyway-37ddf981, §15
of the route-map doc) and the report child (mtamyway-e18d65c2) take over from
here.

## No-leakage verdict — explicitly NOT a positive control

**No stateful path returned 2xx to the public — and this must not be read as a
control that held.** The host answers nothing at all, so the absence of a 2xx
on the stateful-backed paths below is a *failure of the target to exist*, not
evidence of isolation. Presenting non-resolvability as a positive control would
be exactly the error this criterion guards against.

What actually keeps the stateful tier unrouted is the router config, not this
pass's HTTP silence: per §15.2 of the route-map doc, re-stamped by the live
re-read below, **no rule of the one IngressRoute names `mta-my-way-stateful`**
— zero occurrences in the live spec. Any real exposure claim must be re-derived
from the rules table the day the domain resolves.

## Live rule set re-read (probe-list source)

15:25 UTC, `get ingressroute -A`: **21 HTTP IngressRoutes cluster-wide, exactly
one naming an mta service** — `mta-my-way/mta-my-way`, unchanged from §15.1.
Shared by all four rules: `entryPoints: [websecure]`,
`tls.certResolver: letsencrypt`, host `mtamyway.com`. Annotations unchanged:
`external-dns...hostname: mtamyway.com`, `...target:
cef7d924-cd61-43dc-89ad-1df7de2699bf.cfargotunnel.com`, `...ttl: "300"`.

| # | Match | Middleware | Target | Backend state this pass |
|---|---|---|---|---|
| 1 | `PathPrefix(/push/)` | none | `mta-my-way:3000` (legacy) | dead — 0/0 desired, 0 endpoints |
| 2 | `PathPrefix(/auth/)` | none | `mta-my-way:3000` (legacy) | dead — as above |
| 3 | `PathPrefix(/password-reset/)` | none | `mta-my-way:3000` (legacy) | dead — as above |
| 4 | catch-all | `mta-my-way-sse` | `mta-my-way-core:3000` | unhealthy — 0/2 ready |

## Per-deployment readiness (two corroborating reads)

15:25 and 15:32 UTC, `get deployments -n mta-my-way` — both reads identical:

| Deployment | READY | Image | Detail |
|---|---|---|---|
| `mta-my-way` (legacy) | 0/0 | `ronaldraygun/mta-my-way:0.0.82` | 7 ReplicaSets, all `desired=0`; Endpoints `mta-my-way` = `<none>` (object 155d old); EndpointSlice 0 endpoints |
| `mta-my-way-core` | 0/2 | `ronaldraygun/mta-my-way:0.0.289` | three ReplicaSets simultaneously `desired=1` (`9b48f8bdc` 8d, `6bd9f88b54` 5d, `7fbcbdb69c` 3d8h) against a deployment `desired=2` — the §15.3 stuck mid-rollout shape; EndpointSlice holds 3 endpoints, all `ready=false`/`serving=false` |
| `mta-my-way-stateful` | 0/1 | `ronaldraygun/mta-my-way:0.0.289` | RS `5fb9bfb7dc` 1 desired / 0 ready; EndpointSlice 1 endpoint, `ready=false`/`serving=false` |

Pod-level detail is stated as moment-in-time only — it churns
minute-to-minute, and between §15's 14:19 UTC read and this pass the four pods
were replaced (all 14m old) and the stateful pod's IP moved. Snapshot at 15:25
UTC: 2× core CrashLoopBackOff (7 restarts each), 1× core ImagePullBackOff,
1× stateful ImagePullBackOff.

## DNS resolution and delegation (15:24–15:25 UTC)

| Query | Result |
|---|---|
| `dig mtamyway.com A` (default resolver, Tailscale `100.100.100.100`) | **NXDOMAIN**, 0 answers |
| `dig @1.1.1.1 mtamyway.com A` | **NXDOMAIN** |
| `dig @8.8.8.8 mtamyway.com A` | **NXDOMAIN** |
| `dig @a.gtld-servers.net mtamyway.com NS` | **NXDOMAIN**, `flags: qr aa rd` — the authoritative .com nameserver answers authoritatively that the name does not exist |
| `dig mtamyway.com NS` (default resolver) | **NXDOMAIN** — no delegation exists |
| tunnel target `cef7d924-....cfargotunnel.com` | NOERROR, **zero answers** (NODATA) — the Cloudflare-side record for the external-dns target still does not exist, re-confirming the 09-02 finding |
| `curl --doh-url https://1.1.1.1/dns-query https://mtamyway.com/` | exit 6 — resolution fails even with the local resolver bypassed entirely |

## Domain registration (RDAP, 15:24 UTC)

`curl https://rdap.verisign.com/com/v1/domain/mtamyway.com` → `http_code=404`.
The process still exits 56 with an OpenSSL `SSL_read: unexpected eof` teardown
after the status line — the long-standing quirk of this endpoint from ex44
noted on 09-02; the printed status code is the registry's answer regardless.
RDAP 404 from the .com registry = **the domain is not registered**. Controls:
`google.com` → 200, `ardenone.com` → 200 from the same endpoint.

## Path-by-path curl results (15:26–15:28 UTC)

Every request: `curl -sS -o /dev/null --max-time 10`, recording `%{http_code}`
and the process exit code.

### Rule paths — one per rule of the live rule set

| Rule | Path | Routes to | HTTP | Exit | Detail |
|---|---|---|---|---|---|
| 1 | `https://mtamyway.com/push/` | `mta-my-way:3000` | 000 | 6 | Could not resolve host |
| 2 | `https://mtamyway.com/auth/` | `mta-my-way:3000` | 000 | 6 | Could not resolve host |
| 3 | `https://mtamyway.com/password-reset/` | `mta-my-way:3000` | 000 | 6 | Could not resolve host |
| 4 | `https://mtamyway.com/` | `mta-my-way-core:3000` via `mta-my-way-sse` | 000 | 6 | Could not resolve host |

Scheme-independence check: `http://mtamyway.com/` → 000 / 6 — the failure is
DNS, not TLS.

### Real application prefixes (re-confirmed in `app.ts` at HEAD 084cdca)

SPA screens — served by the catch-all static handler (`app.use("/*")`,
`serveStatic` at `app.ts:3044`), not by explicit route registrations:

| Path | HTTP | Exit |
|---|---|---|
| `/arrivals` | 000 | 6 |
| `/stations` | 000 | 6 |
| `/alerts` | 000 | 6 |

Health and edge paths:

| Path | Route | HTTP | Exit |
|---|---|---|---|
| `/health` | `app.ts:416` | 000 | 6 |
| `/api/health` | `app.ts:1110` | 000 | 6 |
| `/status` | `app.ts:1225` | 000 | 6 |
| `/api/metrics` | `app.ts:1333` | 000 | 6 |
| `/.well-known/security.txt` | `app.ts:1346` | 000 | 6 |

Read API paths — all would fall through to catch-all rule 4:

| Path | Route | HTTP | Exit |
|---|---|---|---|
| `/api/stations` | `app.ts:1385` | 000 | 6 |
| `/api/alerts` | `app.ts:1582` | 000 | 6 |
| `/api/equipment` | `app.ts:1641` | 000 | 6 |
| `/api/arrivals/A31` | `app.ts:1360` | 000 | 6 |

Stateful-backed paths — the real application prefixes a leakage hypothesis
would have to return 2xx on. Per §15.4 all sit behind `!CORE_ONLY` gates, so
core does not even mount them:

| Path | Route | Gate | HTTP | Exit |
|---|---|---|---|---|
| `/api/push/vapid-public-key` | `app.ts:2019` | `app.ts:2014` | 000 | 6 |
| `/api/auth/session` | `app.ts:2985` | `app.ts:2789` | 000 | 6 |
| `/api/auth/password/policy` | `app.ts:2941` | `app.ts:2923` | 000 | 6 |

**20 requests against the host, 20 × (HTTP 000, exit 6). No response of any
kind on any path — rule paths or application prefixes.**

## Control checks (prove the failure is the domain, not this box)

| Check | Result | What it proves |
|---|---|---|
| `curl https://example.com` | HTTP 200, exit 0 | ex44 egress, DNS and the full TLS/HTTP curl stack work |
| `curl --doh-url https://1.1.1.1/dns-query https://example.com` | HTTP 200, exit 0 | the DoH path works too — mtamyway.com's exit 6 there is a property of the name |
| `dig +short example.com A` | two A records | the default resolver answers normally |
| `dig +short openbao.ardenone.com A` | two A records | operator-owned names resolve fine |
| `curl https://ardenone.com` | 000, exit 6 — but `dig ardenone.com A` is NOERROR with **zero answers** (the apex has no A record; only its subdomains resolve) | instructive contrast: exit 6 has two distinct causes. mtamyway.com's cause is the stronger one — **NXDOMAIN**, the name does not exist in .com, not merely "no A record" |

## Blockers (unchanged, restated against this pass's evidence)

1. `mtamyway.com` is unregistered (RDAP 404). Nothing else can move until it is
   registered — or until the IngressRoute host and the external-dns annotations
   move to an already-registered name, together.
2. Even then, the zone needs delegation and a record for the external-dns
   target: the tunnel hostname is still NODATA, so Cloudflare has nothing to
   answer with.
3. Independently, every backend is unhealthy: the legacy service has no
   endpoints at 0/0 desired, core is 0/2 stuck mid-rollout (three ReplicaSets
   at `desired=1`), stateful is 0/1 in ImagePullBackOff. Rules 1–3 additionally
   target a service retired from git (§15.3) whose prefixes mismatch the app's
   real routes (§15.4).

Until all three move, the per-path HTTP statuses above stay 000/6 by
construction, and the stateful-isolation claim rests on §15.2's router-level
proof — never on this pass's HTTP silence.
