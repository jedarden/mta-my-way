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
