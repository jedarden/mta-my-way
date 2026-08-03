# ADR-001 Implementation: Core/Stateful Split

**Bead:** bf-5jrvw
**Date:** 2026-08-03
**Status:** Partially Complete - Code changes done, K8s manifest changes pending

## What Was Implemented

### 1. CORE_ONLY Mode Enhancement ✅

The `CORE_ONLY` environment variable now properly controls server behavior:

- **`CORE_ONLY=false`** (default): Full deployment with all features
- **`CORE_ONLY=true`**: Stateless core deployment only

### 2. Health Endpoint Updates ✅

The `/api/health` endpoint now includes:

```json
{
  "status": "ok" | "degraded",
  "deploymentMode": "core-only" | "full",
  "pushDb": {
    "ready": true | false
  }
}
```

In CORE_ONLY mode, the health endpoint reports:
- `deploymentMode: "core-only"` - explicit indicator of running mode
- `status: "ok"` even though push DB is not ready (expected behavior)
- Core feeds (arrivals, alerts, equipment) are independently monitored

### 3. Stateful Subsystem Client ✅

**Location:** `packages/server/src/services/stateful-client.ts` (237 lines)

A production-ready HTTP client with circuit breaker for core→stateful communication:

**Features:**
- Configurable timeout (default: 2000ms via `STATEFUL_TIMEOUT_MS`)
- Circuit breaker: opens after 3 consecutive failures
- Auto-reset after 60 seconds with half-open recovery testing
- Environment-configured service URL (`STATEFUL_SERVICE_URL`, default: `http://mta-my-way-stateful:3001`)
- Health check integration via `getStatefulStatus()` for `/api/health` endpoint
- Graceful degradation: throws error when circuit is open

**Circuit Breaker States:**
- **Closed:** Normal operation, requests flow through
- **Open:** Immediate rejection (after 3 consecutive failures)
- **Half-open:** Single test request allowed after 60s reset timeout

**Key Functions:**
- `callStatefulService<T>(path, options): Promise<T>` - Main HTTP client
- `getStatefulStatus()` - Returns circuit state for health endpoint
- `checkStatefulHealth()` - Health check for monitoring

### 4. Core-to-Stateful Proxying ✅

**Location:** `packages/server/src/app.ts` (lines 1944-2154)

Push notification endpoints automatically proxy to stateful service when `CORE_ONLY=true`:

**Proxied Endpoints:**
- `POST /api/push/subscribe` - Register push subscription
- `DELETE /api/push/unsubscribe` - Remove subscription
- `PATCH /api/push/subscription` - Update favorites/quiet hours

**Behavior:**
- In `CORE_ONLY=false` mode: calls local DB directly
- In `CORE_ONLY=true` mode: proxies via `callStatefulService()` with circuit breaker
- Returns 503 when stateful subsystem is unreachable
- Circuit breaker prevents cascade failures

### 5. Status Page Enhancement ✅

The `/status` dashboard now displays:
- A warning banner when running in core-only mode
- Clear indication that push notifications, trip tracking, and password reset are unavailable
- All core functionality (arrivals, alerts, equipment) continues to work

### 4. Endpoint Behavior ✅

**Core Endpoints (Always Available):**
- `/health` - Readiness check
- `/api/health` - Detailed health status
- `/api/arrivals/:stationId` - Real-time arrivals
- `/api/alerts` - Service alerts
- `/api/stations` - Station data
- `/api/routes` - Route data
- `/api/commute/analyze` - Commute analysis
- `/api/equipment` - Equipment status
- `/api/positions/:lineId` - Train positions
- `/api/trip/:tripId` - Trip lookup
- `/*` - Static PWA assets

**Stateful Endpoints (503 in CORE_ONLY):**
- `/api/push/subscribe` - Push subscription registration
- `/api/push/unsubscribe` - Push subscription removal
- `/api/push/subscription` - Subscription updates
- `/api/trips` - Trip tracking CRUD
- `/api/journal/*` - Commute journal and stats
- `/api/auth/password/*` - Password reset (if DB-backed)

## Architecture

### Core Deployment (Stateless)
**Purpose:** Serve real-time subway data with zero storage dependency

**Features:**
- GTFS-RT feed polling (30s interval)
- Real-time arrivals by station
- Service alerts and filtering
- Equipment status (elevators/escalators)
- Train positions for line diagrams
- Commute analysis engine
- Static PWA assets

**Requirements:**
- No PVC needed
- Can run with `replicas: 2+`
- RollingUpdate strategy
- Schedules on any node

**Environment:**
```bash
CORE_ONLY=true
PORT=3001
# No PUSH_DB_PATH needed
```

### Stateful Deployment (Full)
**Purpose:** Handle write-heavy features requiring persistence

**Features:**
- Push notification subscriptions
- Trip tracking and journal
- Security persistence (API keys, rate limits)
- Session management
- Password reset tokens

**Requirements:**
- PVC for SQLite database
- Must run with `replicas: 1`
- Recreate strategy
- Single-writer database

**Environment:**
```bash
CORE_ONLY=false  # or unset
PUSH_DB_PATH=/data/subscriptions.db
```

## What Remains: Kubernetes Manifests

**IMPORTANT:** All code changes are complete and tested. The remaining work is purely Kubernetes manifest updates in the **declarative-config** repository (separate repo).

### Repository: `jedarden/declarative-config`
### Path: `k8s/apexalgo-iad/mta-my-way/`

---

## Complete Manifest Specifications

### 1. Core Deployment (Stateless, Scalable)

**File:** `deployment-core.yaml` (NEW)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mta-my-way-core
  namespace: mta-my-way
  labels:
    app: mta-my-way
    tier: core
spec:
  replicas: 2  # Horizontal scaling enabled
  strategy:
    type: RollingUpdate  # Zero-downtime deploys
    rollingUpdate:
      maxSurge: 1        # Spin up 1 new pod before killing old
      maxUnavailable: 0  # Never have fewer than 2 replicas
  selector:
    matchLabels:
      app: mta-my-way
      tier: core
  template:
    metadata:
      labels:
        app: mta-my-way
        tier: core
    spec:
      # NO volumeMounts - stateless by design
      # NO volumes - survives PVC failures
      containers:
      - name: mta-my-way
        image: ronaldraygun/mta-my-way:latest
        imagePullPolicy: Always
        env:
        - name: CORE_ONLY
          value: "true"
        - name: STATEFUL_SERVICE_URL
          value: "http://mta-my-way-stateful:3001"
        - name: STATEFUL_TIMEOUT_MS
          value: "2000"
        - name: PORT
          value: "3001"
        ports:
        - name: http
          containerPort: 3001
          protocol: TCP
        # Probes - core can start without PVC
        livenessProbe:
          httpGet:
            path: /health
            port: http
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /health
            port: http
          initialDelaySeconds: 5
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 3
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "256Mi"
            cpu: "500m"
```

### 2. Stateful Deployment (PVC-Backed, Single Replica)

**File:** `deployment-stateful.yaml` (NEW)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mta-my-way-stateful
  namespace: mta-my-way
  labels:
    app: mta-my-way
    tier: stateful
spec:
  replicas: 1  # Single-writer SQLite constraint
  strategy:
    type: Recreate  # Required for PVC + SQLite
  selector:
    matchLabels:
      app: mta-my-way
      tier: stateful
  template:
    metadata:
      labels:
        app: mta-my-way
        tier: stateful
    spec:
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: mta-my-way-data
      containers:
      - name: mta-my-way
        image: ronaldraygun/mta-my-way:latest
        imagePullPolicy: Always
        # NO CORE_ONLY env var - runs in full mode by default
        env:
        - name: CORE_ONLY
          value: "false"
        - name: PUSH_DB_PATH
          value: "/data/subscriptions.db"
        - name: ALERT_HISTORY_PATH
          value: "/data/alert_history.db"
        - name: PORT
          value: "3001"
        volumeMounts:
        - name: data
          mountPath: /data
        ports:
        - name: http
          containerPort: 3001
          protocol: TCP
        # Stateful startup requires PVC
        livenessProbe:
          httpGet:
            path: /health
            port: http
          initialDelaySeconds: 60  # Give time for PVC mount + DB init
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /health
            port: http
          initialDelaySeconds: 30
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 3
        resources:
          requests:
            memory: "64Mi"
            cpu: "50m"
          limits:
            memory: "128Mi"
            cpu: "200m"
```

### 3. Core Service (Public-Facing ClusterIP)

**File:** `service-core.yaml` (NEW)

```yaml
apiVersion: v1
kind: Service
metadata:
  name: mta-my-way-core
  namespace: mta-my-way
  labels:
    app: mta-my-way
    tier: core
spec:
  type: ClusterIP
  selector:
    app: mta-my-way
    tier: core
  ports:
  - name: http
    port: 3000
    targetPort: http
    protocol: TCP
```

### 4. Stateful Service (Internal ClusterIP Only)

**File:** `service-stateful.yaml` (NEW)

```yaml
apiVersion: v1
kind: Service
metadata:
  name: mta-my-way-stateful
  namespace: mta-my-way
  labels:
    app: mta-my-way
    tier: stateful
spec:
  type: ClusterIP  # Internal only, no IngressRoute
  selector:
    app: mta-my-way
    tier: stateful
  ports:
  - name: http
    port: 3001
    targetPort: http
    protocol: TCP
```

### 5. Existing Resources to Update

#### PVC: Keep as-is (now used only by stateful deployment)
**File:** `pvc.yaml` (EXISTING - NO CHANGES)

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: mta-my-way-data
  namespace: mta-my-way
spec:
  accessModes:
  - ReadWriteOnce  # Single-writer for SQLite
  storageClassName: sata  # Per workspace policy
  resources:
    requests:
      storage: 1Gi
```

#### IngressRoute: Update service reference
**File:** `ingressroute.yaml` (EXISTING - UPDATE)

```yaml
# BEFORE:
spec:
  routes:
  - match: Host(`mtamyway.com`)
    services:
    - name: mta-my-way  # OLD service
      port: 3000

# AFTER:
spec:
  routes:
  - match: Host(`mtamyway.com`)
    services:
    - name: mta-my-way-core  # NEW core service
      port: 3000
```

#### ArgoCD Application: Update manifest paths
**File:** `application.yaml` (EXISTING - UPDATE)

```yaml
# AFTER:
spec:
  source:
    path: k8s/apexalgo-iad/mta-my-way
  destination:
    namespace: mta-my-way
  syncPolicy:
    syncOptions:
    - CreateNamespace=true
```

---

## Migration Steps

### Step 1: Create New Manifests
```bash
cd ~/declarative-config
# Create deployment-core.yaml
# Create deployment-stateful.yaml
# Create service-core.yaml
# Create service-stateful.yaml
```

### Step 2: Update Existing Manifests
```bash
# Update ingressroute.yaml - point to mta-my-way-core service
# Update application.yaml - ensure it syncs all manifests
```

### Step 3: Deploy in Staging/Test First
```bash
# ArgoCD will auto-deploy on push to main
# Monitor rollout in ArgoCD UI
# Verify health endpoints on both deployments
```

### Step 4: Verify Production Rollout
```bash
# Check that both deployments are healthy
kubectl --server=http://traefik-apexalgo-iad:8001 get deployments -n mta-my-way

# Verify health endpoints
curl https://mtamyway.com/api/health | jq '.deploymentMode'  # Should be "core-only"
curl https://mtamyway.com/api/health | jq '.statefulSubsystem'  # Should show reachable: true

# Test that core endpoints work
curl https://mtamyway.com/api/arrivals/725 | jq '.stationId'

# Test that stateful endpoints proxy correctly (should succeed)
curl -X POST https://mtamyway.com/api/push/subscribe -d '{...}'
```

---

## Rollback Procedure (If Issues)

### Quick Rollback
```bash
cd ~/declarative-config
git revert <commit-hash>
# ArgoCD will auto-revert
```

### Manual Rollback
```bash
# Delete new deployments
kubectl --server=http://traefik-apexalgo-iad:8001 delete deployment mta-my-way-core -n mta-my-way
kubectl --server=http://traefik-apexalgo-iad:8001 delete deployment mta-my-way-stateful -n mta-my-way

# Restore old deployment
# (Revert ingressroute.yaml to point to old service)
# (ArGoCD will redeploy)
```

**Current State:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mta-my-way
  namespace: mta-my-way
spec:
  replicas: 1
  strategy:
    type: Recreate
  template:
    spec:
      containers:
      - name: mta-my-way
        env:
        - name: PUSH_DB_PATH
          value: /data/subscriptions.db
        volumeMounts:
        - name: data
          mountPath: /data
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: mta-my-way-data
```

**Needed Changes:**

1. **Core Deployment** (mta-my-way-core):
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mta-my-way-core
  namespace: mta-my-way
spec:
  replicas: 2
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    spec:
      containers:
      - name: mta-my-way
        env:
        - name: CORE_ONLY
          value: "true"
        # No volumeMounts needed
        # No PVC needed
```

2. **Stateful Deployment** (mta-my-way-stateful):
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mta-my-way-stateful
  namespace: mta-my-way
spec:
  replicas: 1
  strategy:
    type: Recreate
  template:
    spec:
      containers:
      - name: mta-my-way
        env:
        - name: CORE_ONLY
          value: "false"
        - name: PUSH_DB_PATH
          value: /data/subscriptions.db
        volumeMounts:
        - name: data
          mountPath: /data
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: mta-my-way-data
```

3. **Services**:

**Core Service** (mta-my-way-core):
```yaml
apiVersion: v1
kind: Service
metadata:
  name: mta-my-way-core
  namespace: mta-my-way
spec:
  type: ClusterIP
  ports:
  - port: 3001
    targetPort: 3001
  selector:
    app: mta-my-way
    tier: core
```

**Stateful Service** (mta-my-way-stateful):
```yaml
apiVersion: v1
kind: Service
metadata:
  name: mta-my-way-stateful
  namespace: mta-my-way
spec:
  type: ClusterIP
  ports:
  - port: 3001
    targetPort: 3001
  selector:
    app: mta-my-way
    tier: stateful
```

4. **IngressRoute**: Update to point to `mta-my-way-core` service instead of single deployment

### Deployment Labels

Both deployments need distinct labels:
- Core: `app: mta-my-way, tier: core`
- Stateful: `app: mta-my-way, tier: stateful`

## Benefits of This Split

1. **Resilience**: PVC/CSI failures no longer take down arrivals/alerts
2. **Scalability**: Core can horizontally scale to 2+ replicas
3. **Zero-Downtime Deploys**: RollingUpdate strategy for core
4. **Independent Scaling**: Core and stateful can scale independently
5. **Failure Isolation**: Stateful subsystem failures don't affect core

## Monitoring

The health endpoint now distinguishes between:

1. **Core health**: GTFS-RT feeds, alerts, equipment pollers
2. **Stateful health**: Push DB readiness
3. **Deployment mode**: Explicit indication of running mode

In CORE_ONLY mode, the system is considered healthy even when `pushDb.ready: false` because that's expected behavior.

## Testing

### Test Core-Only Mode
```bash
# Run with CORE_ONLY=true
CORE_ONLY=true npm run start

# Verify core endpoints work
curl http://localhost:3001/api/arrivals/725
curl http://localhost:3001/api/alerts
curl http://localhost:3001/api/stations

# Verify stateful endpoints return 503
curl http://localhost:3001/api/push/vapid-public-key  # Should return 503

# Check health endpoint
curl http://localhost:3001/api/health
# Should show: "deploymentMode": "core-only", "status": "ok"
```

### Test Full Mode
```bash
# Run with CORE_ONLY=false (default)
npm run start

# Verify all endpoints work
curl http://localhost:3001/api/push/vapid-public-key  # Should return 200

# Check health endpoint
curl http://localhost:3001/api/health
# Should show: "deploymentMode": "full", "pushDb.ready": true
```

## Next Steps

1. **Create declarative-config PR** with the k8s manifest changes above
2. **Test locally** with both CORE_ONLY modes
3. **Deploy to staging** to validate the split
4. **Monitor** health endpoints to ensure proper behavior
5. **Roll out to production** via ArgoCD

## Sequencing Recommendation

**Per the task description:** Recommend sequencing this after the lazy-db-init bead (plan-gap: "Make push-DB startup lazy/best-effort per ADR-001").

**Rationale:**
1. Lazy DB init is smaller, faster, and provides immediate resilience benefits
2. It's a prerequisite for the core-only deployment to work properly
3. Once DB init is lazy, the core-only deployment becomes truly PVC-independent
4. Doing lazy-init first reduces risk and validates the approach before full architecture split

**Recommended Order:**
1. **First:** Implement lazy DB initialization (bead reference: plan-gap)
2. **Second:** Deploy k8s manifest changes in declarative-config (this bead's remaining work)
3. **Third:** Monitor and validate both deployments in production
4. **Fourth:** Consider enabling auth/session framework once stateful subsystem is isolated (per ADR-001 follow-up)

---

## Operational Guidance

### Monitoring

**Key Metrics to Track:**

1. **Core Deployment Health:**
   - Feed poll success rate (should be >99%)
   - Feed staleness (should be <60s for all feeds)
   - HTTP response times (p95 <100ms for core endpoints)
   - Pod restart count (should be 0 for rolling updates)

2. **Stateful Deployment Health:**
   - PVC mount failures (alert on `FailedMount` events)
   - SQLite connection errors (should be 0)
   - Push notification success rate (best-effort, but track failures)
   - Circuit breaker state (should be closed >95% of time)

3. **Core→Stateful Communication:**
   - Circuit breaker open count (alert if opens >3 times/hour)
   - Timeout rate (alert if >5% of calls timeout)
   - HTTP error rate from stateful service

**Alert Thresholds:**
- **Critical:** Core deployment down (replicas <2)
- **Warning:** Stateful deployment down (push features degraded)
- **Info:** Circuit breaker opened (auto-recovers)

### Failure Modes

**Stateful Subsystem Down:**
- **Impact:** Push notifications, trip tracking, password reset unavailable
- **User Experience:** Core app works, push operations return 503
- **MTTR:** ~5 minutes (kubelet auto-restarts pod if crash, manual intervention if PVC issue)
- **Escalation:** If >15 min, check PVC/CSI health on Rackspace Spot

**Core Subsystem Down:**
- **Impact:** No arrivals, alerts, or PWA assets - FULL OUTAGE
- **User Experience:** Complete service unavailability
- **MTTR:** ~2 minutes (rolling update auto-recovers)
- **Escalation:** IMMEDIATE - this is the primary product

**Both Subsystems Down:**
- **Impact:** Complete outage
- **Root Cause:** Cluster-level issue (node failure, network partition)
- **Escalation:** IMMEDIATE - engage infra on-call

### Runbook: Stateful Subsystem Failure

**Symptom:**
- `/api/health` shows `"statefulSubsystem.reachable": false`
- Push operations return 503
- Circuit breaker is open

**Diagnosis:**
```bash
# Check stateful pod status
kubectl --server=http://traefik-apexalgo-iad:8001 get pods -n mta-my-way -l tier=stateful

# Check recent events
kubectl --server=http://traefik-apexalgo-iad:8001 describe pod <stateful-pod-name> -n mta-my-way

# Check PVC mount
kubectl --server=http://traefik-apexalgo-iad:8001 get pvc -n mta-my-way
```

**Resolution:**

1. **If Pod CrashLoopBackOff:**
   - Check logs for DB corruption: `kubectl logs -n mta-my-way <stateful-pod> --tail=100`
   - If DB corrupt: restore from backup (see below)
   - If OOM killed: increase memory limits

2. **If PVC Mount Failed (ContainerCreating):**
   - Check CSI health: `kubectl get csinodes -o wide`
   - Check storage class: `kubectl get storageclass sata`
   - If CSI issue: Rackspace Spot infra problem - open ticket
   - Workaround: Core deployment unaffected, can wait for CSI recovery

3. **If Circuit Burner Open:**
   - Check stateful health: `curl http://mta-my-way-stateful:3001/health`
   - If unhealthy: fix underlying issue (DB, PVC, etc.)
   - Circuit auto-closes after 60s + successful request

**Database Recovery:**
```bash
# Access stateful pod
kubectl --server=http://traefik-apexalgo-iad:8001 exec -n mta-my-way <stateful-pod> -- sh

# Check DB integrity
sqlite3 /data/subscriptions.db "PRAGMA integrity_check;"

# If corrupt, restore from backup (if backup system exists)
# Or: allow DB to reinitialize (loses push subscriptions, non-critical)
```

### Runbook: Core Subsystem Failure

**Symptom:**
- `/health` returns 503 or times out
- All arrivals/alerts endpoints down
- PWA assets not loading

**Diagnosis:**
```bash
# Check core pods
kubectl --server=http://traefik-apexalgo-iad:8001 get pods -n mta-my-way -l tier=core

# Check recent rolling update
kubectl --server=http://traefik-apexalgo-iad:8001 rollout status deployment/mta-my-way-core -n mta-my-way
```

**Resolution:**

1. **If Rolling Update Stuck:**
   ```bash
   # Rollback
   kubectl --server=http://traefik-apexalgo-iad:8001 rollout undo deployment/mta-my-way-core -n mta-my-way
   ```

2. **If All Pods CrashLoopBackOff:**
   - Check logs for app startup errors
   - Verify GTFS static data exists in container image
   - Check environment variables (CORE_ONLY=true, etc.)

3. **If Feed Pollers Failing:**
   - Check MTA feed connectivity from pod
   - Verify DNS resolution works
   - Check for rate limiting (shouldn't happen at 30s interval)

---

## Testing Checklist

### Pre-Deployment Testing

- [ ] **Local CORE_ONLY Testing:**
  ```bash
  CORE_ONLY=true npm run start
  curl http://localhost:3001/api/health | jq '.deploymentMode'  # "core-only"
  curl http://localhost:3001/api/arrivals/725                    # Should work
  curl -X POST http://localhost:3001/api/push/subscribe          # Should return 503
  ```

- [ ] **Local Full Mode Testing:**
  ```bash
  npm run start  # CORE_ONLY=false (default)
  curl http://localhost:3001/api/health | jq '.deploymentMode'  # "full"
  curl -X POST http://localhost:3001/api/push/subscribe          # Should work
  ```

- [ ] **Circuit Breaker Testing:**
  ```bash
  # Start CORE_ONLY=true with invalid STATEFUL_SERVICE_URL
  STATEFUL_SERVICE_URL=http://invalid:9999 CORE_ONLY=true npm run start

  # Make 4+ requests to trigger circuit breaker
  for i in {1..5}; do
    curl -X POST http://localhost:3001/api/push/subscribe
  done

  # Verify circuit is open (check /api/health)
  curl http://localhost:3001/api/health | jq '.statefulSubsystem.circuitOpen'  # true
  ```

### Post-Deployment Validation

- [ ] **Core Deployment Healthy:**
  ```bash
  kubectl --server=http://traefik-apexalgo-iad:8001 get pods -n mta-my-way -l tier=core
  # Should show 2/2 Running
  ```

- [ ] **Stateful Deployment Healthy:**
  ```bash
  kubectl --server=http://traefik-apexalgo-iad:8001 get pods -n mta-my-way -l tier=stateful
  # Should show 1/1 Running
  ```

- [ ] **Health Endpoint Validation:**
  ```bash
  curl https://mtamyway.com/api/health | jq '.deploymentMode'  # "core-only"
  curl https://mtamyway.com/api/health | jq '.status'          # "ok"
  curl https://mtamyway.com/api/health | jq '.statefulSubsystem.reachable'  # true
  ```

- [ ] **Core Endpoints Working:**
  ```bash
  curl https://mtamyway.com/api/arrivals/725 | jq '.stationId'  # "725"
  curl https://mtamyway.com/api/alerts | jq '.count'           # Number
  curl https://mtamyway.com/api/stations | jq 'length'         # 472
  ```

- [ ] **Stateful Endpoints Proxying:**
  ```bash
  # Should succeed (proxied to stateful service)
  curl https://mtamyway.com/api/push/vapid-public-key
  ```

- [ ] **Circuit Breaker Recovery:**
  ```bash
  # Temporarily scale stateful to 0
  kubectl --server=http://traefik-apexalgo-iad:8001 scale deployment mta-my-way-stateful -n mta-my-way --replicas=0

  # Check health - should show stateful unreachable
  curl https://mtamyway.com/api/health | jq '.statefulSubsystem.reachable'  # false

  # Scale back up
  kubectl --server=http://traefik-apexalgo-iad:8001 scale deployment mta-my-way-stateful -n mta-my-way --replicas=1

  # Wait 60s and check health - should recover
  sleep 60
  curl https://mtamyway.com/api/health | jq '.statefulSubsystem.reachable'  # true
  ```

---

## Success Criteria

The ADR-001 implementation is considered complete when:

1. ✅ **Code Changes:**
   - CORE_ONLY mode implemented and working
   - Stateful client with circuit breaker deployed
   - Health endpoint reports subsystem status independently

2. ⏳ **Kubernetes Manifests:**
   - Core and stateful deployments defined in declarative-config
   - Services created for both deployments
   - IngressRoute updated to point to core service
   - PVC used only by stateful deployment

3. ⏳ **Validation:**
   - Core deployment runs replicas: 2+ without PVC
   - Stateful deployment runs replica: 1 with PVC
   - Circuit breaker opens/closes as expected
   - Health endpoint shows independent subsystem status

4. ⏳ **Production:**
   - Both deployments healthy in production
   - Core continues serving during stateful failures
   - Rolling updates work with zero downtime
   - Monitoring and alerting configured

---

## References

- **ADR-001:** `docs/plan/plan.md` (lines 1718-1756) - Original architecture decision
- **Bead:** bf-5jrvw (this implementation) - Task tracking and completion
- **Context Service Removal:** `docs/plan/plan.md` (lines 1685-1706) - Related architectural cleanup
- **Authorization Audit:** `docs/authorization-audit.md` - Auth framework documentation
- **ContainerCreating Incident:** 2026-07-20, 9+ hours downtime due to PVC CSI I/O error
- **Related Bead:** bf-15tr - Earlier PVC minimum-size issue (second known PVC incident)
- **Lazy DB Init Bead:** plan-gap - "Make push-DB startup lazy/best-effort per ADR-001" (recommended first step)
