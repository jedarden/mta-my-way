# ADR-001 follow-up decision: stateful-only routes under CORE_ONLY — ratify ingress-level routing; do not restore the core-side proxy

**Date:** 2026-09-13
**Bead:** mtamyway-60cde06d (child 2 of 4 of umbrella mtamyway-0cd48bf7)
**Decides:** the open product/ADR-001 question from the umbrella — restore the
core→stateful proxy wiring for `/api/auth/password/*`, `/api/auth/session`,
`/api/preferences`, or accept the gap deliberately.
**Evidence input:** `docs/notes/core-only-live-verification-2026-09-13.md`
(mtamyway-7c6738b0, child 1), read live 2026-09-13 ~19:00 UTC.
**Implementation bead:** mtamyway-d40a2818 (child 3) implements §7 below;
mtamyway-2f54d1a5 (child 4) verifies end-to-end.

---

## 1. What ADR-001's proxy design promises for these endpoints

ADR-001 (`docs/plan/plan.md` lines 1718–1756, 2026-07-20) splits the app into a
stateless core and a PVC-backed stateful subsystem, and wires them as an
**optional app-layer dependency**:

> Wire them as an optional dependency: the core process calls the stateful
> subsystem over its internal ClusterIP Service with a short timeout and
> circuit breaker. If it's unreachable, push/auth/password-reset endpoints
> degrade to `503` and `/api/health` reports that subsystem `degraded` —
> everything else keeps working exactly as it does today when feeds are healthy.

For the three endpoint families this decision covers, the promise concretely is:

| Family | ADR-001's promised behavior at the core |
|---|---|
| `/api/auth/password/*` (policy, reset, reset/confirm, change) | Mounted in the core behind `CORE_ONLY`; each request forwarded to the internal stateful Service (`STATEFUL_SERVICE_URL`, 2 s timeout, circuit breaker); `503` JSON when stateful is unreachable |
| `/api/auth/session` (GET) and `/api/auth/session/revoke` (POST) | Same: core-terminated, proxied to the stateful deployment, which owns the session/security tables |
| `/api/preferences` (GET/PUT) | Same: core-terminated, proxied; the stateful deployment owns the persisted preference snapshot |

The intent behind the mechanism: these user-facing endpoints stay reachable
**through the same public origin as everything else**, degrade coherently when
the stateful side is down, and a stateful/PVC failure never takes the core's
read path down with them. `ADR-001_IMPLEMENTATION_STATUS.md` recorded the
mechanism as implemented (commit `4d6ad4d`), and the 2026-09-13 update block in
that file already records that the app-layer proxying was later superseded by
ingress-level routing.

## 2. Live evidence (child 1, mtamyway-7c6738b0)

Summarized from `docs/notes/core-only-live-verification-2026-09-13.md`; every
read was `kubectl --server=http://traefik-apexalgo-iad:8001` (get/jsonpath
only), 2026-09-13 ~19:00 UTC, cluster **apexalgo-iad**, namespace
**mta-my-way**:

1. **The 404 surface at the core is real but counterfactual.** Inside the four
   `if (!CORE_ONLY)` gates in `packages/server/src/app.ts`
   (lines 1919–2075, 2084–2422, 2694–2819, 2828–2894) sit
   `/api/push/*`, `/api/trips*`/`/api/journal/*` writes, the OAuth routes,
   and exactly the families this decision covers —
   `/api/auth/password/*`, `GET|PUT /api/preferences`, `GET /api/auth/session`,
   `POST /api/auth/session/revoke`. **If** a request for one of them reached
   the core, it would 404.
2. **Such a request never reaches the core.** The live IngressRoute
   `mta-my-way/mta-my-way` has **seven** rules, and six of them route those
   prefixes **directly to `mta-my-way-stateful:3001`** (rules 1–6:
   `/api/push/`, `/api/auth/`, `/api/preferences`, `/api/trips`,
   `/api/journal/`, `/auth/`); only the catch-all (rule 7) hits the core. The
   stateful deployment runs `CORE_ONLY=false` and mounts every one of those
   handlers itself. Manifest and live object agree cell-for-cell
   (declarative-config `d23c4a87`, 2026-09-12; route-map §16.1).
3. **The proxy branches were dead in both deployments** — `app.ts` builds the
   password-reset/preferences handlers only under `!CORE_ONLY`, so no handler
   containing a `CORE_ONLY` proxy branch was ever mounted in the core. That is
   why 221da5ec's removal of the five branches (four in
   `password-reset.routes.ts`, one in `preferences.routes.ts`) was safe, and
   why "stateful internal-only" — the umbrella's premise, from route-map
   line 136 — is **false against live**: `mta-my-way-stateful` is targeted by
   six ingress rules.
4. **The proxy target still exists** if ever needed: `STATEFUL_SERVICE_URL =
   http://mta-my-way-stateful:3001` (ClusterIP 10.21.226.199) — the same
   object rules 1–6 already hit directly. After 221da5ec its only consumer is
   `/api/health` subsystem status (`getStatefulStatus`), so health
   observability survives.
5. **Both deployments were not-ready at read time** (core CrashLoopBackOff ×2
   + ImagePullBackOff across three coexisting ReplicaSets; stateful
   ImagePullBackOff, missing image tag) and `mtamyway.com` is NXDOMAIN /
   unregistered. These are image/rollout and DNS blockers orthogonal to this
   decision: they gate **all** public endpoints equally, and every
   reachability verdict above is config-level.

**Net:** the umbrella's "the core publicly 404s password reset, session
management, and preference sync" is not the live behavior. The endpoints are
publicly routed — around the core, straight to the stateful deployment. The
de-facto state inherited from `d23c4a87` + 221da5ec is not "gap accepted by
accident"; it is "ADR-001's proxy *mechanism* replaced by ingress-level
routing, recorded only in a §16 header and a status-doc update block." This
decision makes that deliberate.

## 3. Options considered

- **Option A — restore the proxy.** Mount proxy-only variants of the
  password-reset/preferences/session routes in the core when `CORE_ONLY`,
  forwarding to `mta-my-way-stateful:3001`. **Rejected.** It cannot ship
  alone: ingress rules 2 and 3 already send `/api/auth/` and `/api/preferences`
  past the core, so a core-side proxy would be unreachable — the exact dead
  code 221da5ec removed, recreated. Doing it properly also requires re-routing
  those ingress rules back through the core, i.e. an ingress change in
  declarative-config, to gain a strictly worse topology: an extra network hop,
  core worker capacity spent on stateful traffic, and the core re-exposed to
  stateful failure modes that ADR-001's core goal (stateless core survives
  PVC/stateful faults) exists to prevent. The only thing the proxy adds over
  the router is a JSON `503` body instead of a Traefik gateway error when
  stateful is down — not worth re-coupling the request path for.
- **Option B — "accept the gap" as the umbrella wrote it.** Treat the
  endpoints as intentionally unavailable in the CORE_ONLY deployment and finish
  deleting/documenting around that. **Rejected as written** — its premise (a
  public 404 gap) is refuted by the evidence in §2. Accepting it would record a
  user-facing regression that does not exist.
- **Option C — ratify ingress-level routing as the deliberate replacement for
  ADR-001's proxy mechanism.** Keep the live topology exactly as verified;
  make the records agree with it; make no runtime change. **CHOSEN.**

## 4. Decision

**Option C: do not restore the core-side proxy. The ingress-level routing
introduced by declarative-config `d23c4a87` (2026-09-12) and verified live by
child 1 is ratified as the deliberate replacement for ADR-001's core→stateful
proxy mechanism.**

- The six stateful prefixes (`/api/push/`, `/api/auth/`, `/api/preferences`,
  `/api/trips`, `/api/journal/`, `/auth/`) are served by the stateful
  deployment directly at the router; the core never terminates them. This is
  the design, not a transitional accident.
- 221da5ec's branch removal is final. No proxy route code returns to
  `password-reset.routes.ts` / `preferences.routes.ts` / `app.ts` under this
  decision.
- No declarative-config change is part of this decision — the live IngressRoute
  is already the chosen topology. Child 3 must not touch ingress rules.
- ADR-001's **goal** is unchanged and, if anything, better served: the core
  read path is now isolated from stateful faults at the router layer (a
  stateful outage cannot even hand those requests to the core), the core keeps
  its `replicas: 2` RollingUpdate, and stateful keeps `replicas: 1` + Recreate
  + PVC. What changes is the **mechanism**: the router does the routing, and
  `STATEFUL_SERVICE_URL` is permanently reduced to the `/api/health`
  observability role.

This lands on child 3's "(b)" branch — but the "gap" framing is corrected: what
is accepted is the *mechanism supersession*, not any user-facing loss. Every
endpoint ADR-001 promised remains routed to a deployment that serves it.

## 5. Rationale

1. **The evidence is not ambiguous.** The live router demonstrably routes the
   prefixes to a deployment that mounts the real handlers; the core's 404 is a
   counterfactual. The "restore" default only fires when evidence is
   ambiguous; here it decisively favors the existing topology.
2. **The proxy mechanism never actually worked.** It was dead code in both
   deployments from the day it landed — ADR-001's promise has been delivered
   by the ingress since `d23c4a87`, not by the app layer. Ratifying reality
   beats resurrecting a mechanism that would need an ingress re-route to
   receive a single request.
3. **Stronger isolation than the ADR asked for.** ADR-001 wanted a stateful
   fault to degrade only the stateful features. With router-level routing, a
   stateful outage doesn't merely degrade those endpoints — it cannot consume
   core capacity while doing so. Circuit breaker, timeout, and 503 handling
   become the router's job, and the app's `stateful-client` shrinks to a
   health probe.
4. **Change direction.** Restoring means new product code, a new ingress
   change, and a re-coupled request path, all to preserve the letter of an ADR
   whose goal the current state already meets. Ratifying means documentation
   alignment only.

## 6. Consequences

- **Positive:** The core's public surface stays exactly what ADR-001's rule 7
  catch-all intends (arrivals, stations, routes, alerts, commute, equipment,
  positions, read-only trip lookup, health/metrics, PWA assets), and no
  stateful fault can degrade it at the application layer.
- **Positive:** Zero runtime change required to implement this decision — the
  chosen state is already live-config. Implementation risk drops to
  documentation drift.
- **Negative (accepted):** Error semantics differ from ADR-001's letter. When
  the stateful deployment is down/unavailable, requests to the six prefixes
  fail at Traefik with a gateway error (502/503/504 HTML default page) rather
  than the core's JSON `503` with `statefulSubsystem` context. Web clients
  already treat both as failures; no client change is needed (the web app
  calls these paths same-origin and is agnostic to which backend answers).
  `/api/health` still reports `statefulSubsystem` reachability/circuit state,
  so observability of the degraded condition is retained.
- **Negative (accepted):** Password reset / session / preference sync inherit
  the stateful deployment's availability profile: single replica, `Recreate`
  strategy, PVC-bound — including a deploy downtime window. This matches
  ADR-001's own availability trade for stateful features and the plan's
  best-effort stance; it is called out here because those endpoints are
  user-facing.
- **Neutral:** `stateful-client.ts` survives solely for `/api/health`
  (`getStatefulStatus`) and its readiness probe. Any future feature needing
  core-terminated stateful routes (e.g. core-side middleware/cookies on those
  paths) requires a **new** ADR — and must include the ingress re-route in the
  same change, or it re-creates dead code.

## 7. Operator sign-off flag

**⚠️ OPERATOR SIGN-OFF REQUIRED — this decision departs from the letter of
ADR-001.** ADR-001's wiring paragraph names the core process as the proxy; this
decision amends that mechanism to router-level routing. Per the parent's rule,
an ADR reversal carries an explicit operator sign-off, recorded here:

> Operator sign-off (name / date / reference): ______________________

Scope of the sign-off: the mechanism amendment in §4 (router routes the six
stateful prefixes directly; the core never proxies them) and the accepted
consequences in §6. ADR-001's split and its availability goal are **not**
reversed.

Status and what may proceed without it: child 3's implementation under §8 is
**documentation alignment only — no runtime behavior changes, no ingress
change, no route code** — and may land before the sign-off is recorded, because
it only makes the repo's records agree with the live, evidence-verified
topology. If the operator declines and directs that the proxy be restored,
that supersedes §4 and becomes a new decision carrying its own ingress
re-route (rules 2, 3 and 5 back through the core) plus the app-layer proxy
work — child 3's scope would then be void, not amended.

## 8. Exactly what child 3 (mtamyway-d40a2818) implements

Branch resolution: **(b)**, scoped by the correction in §4 — finish the
documentation sweep; build no proxy code. Concrete, no-re-litigation list:

**Do not build:**
- No proxy-only route variants, no new `CORE_ONLY` mount gates in `app.ts`, no
  changes to `password-reset.routes.ts` / `preferences.routes.ts` / their
  tests (221da5ec's docstrings and deployment-mode-independence tests are
  current and accurate — verified at HEAD and in child 1's evidence §1).
- No declarative-config / IngressRoute changes (the live rules are the chosen
  topology).
- No web client changes (same-origin calls are backend-agnostic).

**Finish documenting (the actual sweep) — all in this repo:**
1. `docs/notes/ingressroute-route-map.md` — mark the superseded sections
   inline so no reader lands on a false statement without a pointer to §16:
   line ~136 ("`mta-my-way-stateful` … appears in **no** rule — internal only,
   by design"), the §2 table (~lines 120–127, legacy `mta-my-way:3000` rules),
   the 09-03 re-verification paragraphs (~139–160, "zero drift" verdicts
   against the pre-`d23c4a87` router), the §3/§4-era "internal-only stateful
   wiring" claims (~271, ~282), and the §15.2/§15.4 gate note ("never through
   the ingress"). §16 already states the supersession in its header; the fix
   is inline markers/strikethroughs at the stale lines, not a rewrite of
   history.
2. `ADR-001_IMPLEMENTATION_STATUS.md` — the 2026-09-13 update block exists;
   append one line pointing at this decision doc (§4) as the recorded
   decision, so the status file and the decision file reference each other.
   Leave the historical "What Was Already Implemented" section as history —
   the update block already frames it.
3. `docs/plan/plan.md` ADR-001 — do **not** rewrite the ADR text (ADRs are
   immutable records). Optionally add a one-line "Amended 2026-09-13 — see
   `docs/notes/adr-001-core-only-stateful-routes-decision.md`" pointer
   directly under the ADR-001 heading, same pattern as the status file's
   update block.
4. Pin test (per child 3's own AC): extend the existing deployment-mode
   coverage with an app-level assertion that in `CORE_ONLY` mode none of
   `/api/auth/password/*`, `/api/auth/session`, `/api/preferences` are mounted
   (404), and in full mode they are — pinning that the router, not the app,
   owns their routing in core mode. Keep using the shared `CORE_ONLY` constant
   from `config.ts`; the grep guard on inline `process.env["CORE_ONLY"]`
   comparisons (already down to `config.ts` alone) must stay clean.

**Explicitly out of scope for child 3** (recorded so they are not lost, but
they are separate work in another repo / another concern): child 1's drift
register items 1 (stale VAPID comments in declarative-config
`deployment-core.yaml` + `ingressroute.yaml`) and 2 (unpruned legacy
`mta-my-way` Deployment/Service, ArgoCD prune drift); the unregistered
`mtamyway.com` domain; the live image/rollout failures. None of them gate this
decision.

## 9. What child 4 (mtamyway-2f54d1a5) verifies

- Route map doc: no unmarked false statements remain (the §8.1 sweep landed);
  §16 still agrees with the live IngressRoute (re-read the live object).
- Still zero proxy handlers in the core at HEAD (grep guard from §8.4 holds).
- Commits visible on Forgejo origin; scoped typecheck/tests green.
- Record the ~15–30 min ArgoCD/CI sync lag caveat rather than blocking on it,
  per child 4's own bead text.

## References

- Evidence: `docs/notes/core-only-live-verification-2026-09-13.md`
  (mtamyway-7c6738b0)
- ADR-001: `docs/plan/plan.md` lines 1718–1756;
  `ADR-001_IMPLEMENTATION_STATUS.md` (incl. 2026-09-13 update block)
- Live routing record: `docs/notes/ingressroute-route-map.md` §16
- Branch removal: commit 221da5ec; ingress rewrite: declarative-config
  `d23c4a87` (2026-09-12)
- Umbrella: mtamyway-0cd48bf7; children: 7c6738b0 (evidence) → 60cde06d (this
  decision) → d40a2818 (implement) → 2f54d1a5 (verify)
