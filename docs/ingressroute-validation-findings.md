# IngressRoute Traffic Split Validation - Findings

> **⚠️ SUPERSEDED — 2026-09-03, bead mtamyway-7fad73c2.** The authoritative
> reference is **`docs/notes/ingressroute-route-map.md`** (consolidated
> IngressRoute rules table, service mappings, live-vs-manifest reconciliation,
> route-leakage verdict); its §8 reconciles this file. The consolidated doc's
> live evidence **confirms the three headline problems below** — dead
> `mta-my-way` backend, rules-vs-app path mismatch, no healthy backends — and
> corrects two claims:
>
> - **"Zero-Scale Deployments" is imprecise, and "Scale up deployments"
>   (Required Action 3) is therefore wrong.** Only the legacy monolith
>   `mta-my-way` is truly scaled to zero (`0/0` desired across all seven
>   ReplicaSets). `mta-my-way-core` and `mta-my-way-stateful` have non-zero
>   *desired* replicas (2 and 1) and **zero ready pods** because of
>   CrashLoopBackOff (broken image: missing
>   `dist/proto/compiled.js`) and ImagePullBackOff (the node-local
>   `localhost:7439` registry mirror answers **not found** for the image —
>   consolidated doc §4/§6) — scaling up cannot fix that. The ordered fix
>   list is
>   consolidated doc §9: ArgoCD reconciliation first, then image/registry,
>   scheduling, DNS/external-dns, then the route paths.
> - Required Action 1 ("update IngressRoute to route `/api/*` traffic to
>   `mta-my-way-core`") is right in direction but understates the situation:
>   there is exactly **one** IngressRoute in the cluster (consolidated doc
>   §2), rules 1–3 point at the retired legacy service which is a **live-only
>   orphan** ArgoCD cannot prune (consolidated doc §3–§4), and no request of
>   any kind can currently succeed because `mtamyway.com` does not resolve —
>   the domain is unregistered (consolidated doc §6). Required Action 4
>   ("test routing with curl") stays blocked until that is fixed.
>
> The companion report `docs/api-health-route-isolation-report.md` is likewise
> superseded (see its banner).

**Date:** 2026-09-01
**Status:** Critical Issues Detected (superseded 2026-09-03 — see banner above)

## Summary

Validation of Traefik IngressRoute configuration reveals critical failures preventing stateful traffic routing.

## Critical Issues

### 1. Broken Service Endpoints

The `mta-my-way` service referenced by IngressRoute has **NO endpoints** for 152+ days, causing all stateful operations to fail.

### 2. Path Mismatch

IngressRoute paths (`/push/`, `/auth/`, `/password-reset/`) do not match application routes (`/api/push/*`, `/api/auth/*`, `/api/auth/password/*`).

### 3. Zero-Scale Deployments

All deployments currently at zero replicas:
- Core: 0/2 replicas
- Stateful: 0/1 replicas
- Legacy: 0/0 replicas

## Required Actions

1. Update IngressRoute to route `/api/*` traffic to `mta-my-way-core`
2. Remove legacy `mta-my-way` service and deployment
3. Scale up deployments to handle traffic
4. Test routing with curl commands

## Next Steps

See the authoritative reference: `docs/notes/ingressroute-route-map.md` (its
§9 has the dependency-ordered remediation list that supersedes the Required
Actions above). The previously linked
`docs/api-health-route-isolation-report.md` is likewise superseded — see its
banner.

---

**Bead:** mtamyway-6895e35e
