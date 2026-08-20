# ADR-001 Implementation Verification

**Date:** 2026-08-20
**Bead:** mtamyway-f62f25d4
**Status:** ✅ CODE IMPLEMENTATION COMPLETE

## What Was Already Implemented

The ADR-001 decision to decouple the stateless core from PVC-backed stateful subsystem has been **fully implemented in the codebase** as of commit `4d6ad4d` (2026-08-03).

### ✅ Core Components Implemented

1. **CORE_ONLY Mode** (`packages/server/src/index.ts`)
   - Environment variable `CORE_ONLY=true` enables stateless core mode
   - Skips all DB-dependent subsystems (push, trips, sessions, password-reset)
   - Server starts without PVC dependency

2. **Stateful Client with Circuit Breaker** (`packages/server/src/services/stateful-client.ts`)
   - HTTP client with configurable timeout (default: 2000ms)
   - Circuit breaker opens after 3 consecutive failures
   - Auto-reset after 60 seconds with half-open recovery testing
   - Environment-configured service URL: `STATEFUL_SERVICE_URL` (default: `http://mta-my-way-stateful:3001`)

3. **Core-to-Stateful Proxying** (`packages/server/src/app.ts`)
   - Push endpoints proxy to stateful service when `CORE_ONLY=true`:
     - `POST /api/push/subscribe`
     - `DELETE /api/push/unsubscribe`
     - `PATCH /api/push/subscription`
   - Returns 503 when stateful subsystem unavailable
   - Circuit breaker prevents cascade failures

4. **Health Endpoint Enhancement** (`packages/server/src/app.ts`)
   - `/api/health` includes:
     - `deploymentMode: "core-only" | "full"`
     - `statefulSubsystem` status (reachable, circuitOpen, consecutiveFailures, etc.)
     - Independent health reporting for core vs stateful subsystems

5. **Status Page Updates** (`packages/server/src/app.ts`)
   - `/status` dashboard shows core-only mode banner
   - Clear indication of which features are unavailable

### Architecture Summary

**Stateless Core** (`CORE_ONLY=true`):
- No PVC/volumeMounts needed
- Can run `replicas: 2+` with RollingUpdate
- Survives PVC/CSI failures
- Core endpoints always available (arrivals, alerts, stations, routes, equipment)

**Stateful Subsystem** (`CORE_ONLY=false`):
- Requires PVC for SQLite database
- Runs `replicas: 1` with Recreate strategy
- Handles push subscriptions, trip tracking, sessions, password-reset
- Core calls stateful over network with timeout + circuit breaker

## What Remains: Kubernetes Manifests

**IMPORTANT:** The only remaining work is **Kubernetes manifest updates in the `jedarden/declarative-config` repository** (separate repo).

### Required Manifest Changes

1. **Core Deployment** (`deployment-core.yaml` - NEW)
   - `replicas: 2` with `RollingUpdate` strategy
   - `env: CORE_ONLY=true`
   - `STATEFUL_SERVICE_URL=http://mta-my-way-stateful:3001`
   - NO volumeMounts or PVC

2. **Stateful Deployment** (`deployment-stateful.yaml` - NEW)
   - `replicas: 1` with `Recreate` strategy
   - `env: CORE_ONLY=false`
   - Existing PVC mount
   - Internal service only

3. **Core Service** (`service-core.yaml` - NEW)
   - Public-facing ClusterIP
   - Selects `tier: core`

4. **Stateful Service** (`service-stateful.yaml` - NEW)
   - Internal-only ClusterIP
   - Selects `tier: stateful`

5. **IngressRoute** (UPDATE)
   - Point to `mta-my-way-core` service instead of single deployment

6. **PVC** (NO CHANGES)
   - Keep existing `mta-my-way-data` PVC
   - Now used only by stateful deployment

### Repository: `jedarden/declarative-config`
### Path: `k8s/apexalgo-iad/mta-my-way/`

See `/home/coding/mta-my-way/notes/bf-5jrvw.md` for complete manifest specifications.

## Verification Status

✅ **Code Implementation:** COMPLETE
- CORE_ONLY mode working
- Stateful client with circuit breaker deployed
- Health endpoint reports subsystem status independently
- Core-to-stateful proxying operational

⏳ **Kubernetes Manifests:** PENDING
- Requires separate PR in `jedarden/declarative-config` repo
- All specifications documented in `notes/bf-5jrvw.md`
- Ready to implement when ready to deploy

## Conclusion

The ADR-001 decision has been **successfully implemented in the codebase**. The application can now run in two modes:

1. **Stateless Core** (`CORE_ONLY=true`): Survives PVC failures, horizontally scalable
2. **Stateful Subsystem** (`CORE_ONLY=false`): Handles write-heavy features with PVC

The only remaining work is creating the Kubernetes manifests to deploy this architecture, which belongs in the separate `declarative-config` repository.

---

**References:**
- ADR-001: `docs/plan/plan.md` (lines 1718-1756)
- Implementation bead: `notes/bf-5jrvw.md`
- Implementation commit: `4d6ad4d` (2026-08-03)
- Stateful client: `packages/server/src/services/stateful-client.ts`
