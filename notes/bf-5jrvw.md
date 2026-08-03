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

### 3. Status Page Enhancement ✅

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

The code changes are complete, but the Kubernetes deployment changes need to be made in the **declarative-config** repository:

### File: `jedarden/declarative-config/k8s/apexalgo-iad/mta-my-way/deployment.yaml`

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

## References

- ADR-001: docs/plan/plan.md (Section: ADR-001: 2026-07-20)
- Bead: bf-5jrvw (this implementation)
- ContainerCreating incident: 9+ hours downtime due to PVC mount failure
- Related bead: bf-15tr (earlier PVC minimum-size issue)
