# MTA My Way Kubernetes & ArgoCD Deployment Health Report

**Date**: 2026-09-01  
**Cluster**: apexalgo-iad  
**Namespace**: mta-my-way  
**Image Version**: ronaldraygun/mta-my-way:0.0.289

## Executive Summary

❌ **CRITICAL DEPLOYMENT FAILURE**

The mta-my-way application is currently **non-operational** across both core and stateful subsystems. All pods are unhealthy, ArgoCD sync is broken, and public endpoints are unreachable.

## ArgoCD Application Status

### Application Details
- **Name**: `mta-my-way`
- **Namespace**: `argocd`
- **Health Status**: ❌ **Unknown**
- **Sync Status**: ❌ **Unknown**
- **Project**: `default`

### Critical ArgoCD Configuration Error
```
error getting cluster by server "https://hcp-99476ebb-4133-4a21-ac6a-6e2bdf6794c0.spot.rackspace.com": 
rpc error: code = NotFound desc = cluster "https://hcp-99476ebb-4133-4a21-ac6a-6e2bdf6794c0.spot.rackspace.com" not found
```

**Issue**: The ArgoCD Application is pointing to a **non-existent Rackspace cluster endpoint**. This destination server does not exist in the current ArgoCD cluster configuration.

**Impact**: ArgoCD cannot manage or sync this application. All automated deployment, self-healing, and drift detection features are non-functional.

## Kubernetes Resource Health

### Deployments

| Deployment | Replicas | Ready | Up-to-Date | Available | Age | Status |
|------------|----------|-------|------------|------------|-----|--------|
| `mta-my-way` | 0 | 0/0 | 0 | 0 | 152d | ⚠️ Scaled to zero |
| `mta-my-way-core` | 2 | 0/2 | 1 | 0 | 12d | ❌ Unhealthy |
| `mta-my-way-stateful` | 1 | 0/1 | 1 | 0 | 12d | ❌ Unhealthy |

### Pods Status

| Pod | Ready | Status | Restarts | Age | Issue |
|-----|-------|--------|----------|-----|-------|
| `mta-my-way-core-6bd9f88b54-74wjz` | 0/1 | CrashLoopBackOff | 11 | 61m | ❌ Application crash |
| `mta-my-way-core-7fbcbdb69c-9q6c8` | 0/1 | ImagePullBackOff | 0 | 10h | ❌ Image pull failure |
| `mta-my-way-core-9b48f8bdc-m285n` | 0/1 | CrashLoopBackOff | 11 | 61m | ❌ Application crash |
| `mta-my-way-stateful-5fb9bfb7dc-m9s99` | 0/1 | ImagePullBackOff | 0 | 61m | ❌ Image pull failure |

### Services

| Service | Type | Cluster IP | Ports | Age |
|---------|------|------------|-------|-----|
| `mta-my-way` | ClusterIP | 10.21.124.174 | 3000/TCP | 152d |
| `mta-my-way-core` | ClusterIP | 10.21.125.67 | 3000/TCP | 12d |
| `mta-my-way-stateful` | ClusterIP | 10.21.226.199 | 3001/TCP | 12d |

### Storage

| PVC | Status | Volume | Capacity | Access Mode | StorageClass | Age |
|-----|--------|--------|----------|-------------|--------------|-----|
| `mta-my-way-data` | Bound | pvc-75855d3f-7127-49df-b96a-4b401d6a1342 | 5Gi | RWO | sata | 33d |

## Root Cause Analysis

### 1. ArgoCD Configuration Failure ❌ CRITICAL
**Severity**: CRITICAL - Blocks all automated operations

**Error**: Application destination configured to deleted Rackspace cluster endpoint
- Configured: `https://hcp-99476ebb-4133-4a21-ac6a-6e2bdf6794c0.spot.rackspace.com`
- Actual: Cluster endpoint does not exist

**Impact**: 
- No automated deployment sync
- No self-healing capability
- No drift detection
- Manual intervention required for all changes

### 2. Core Application Crashes ❌ CRITICAL
**Severity**: CRITICAL - Core subsystem completely down

**Error**: `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/app/packages/server/dist/proto/compiled.js'`

**Log Output**:
```
node:internal/modules/esm/resolve:275
    throw new ERR_MODULE_NOT_FOUND(
          ^

Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/app/packages/server/dist/proto/compiled.js' 
imported from /app/packages/server/dist/alerts-parser.js
```

**Root Cause**: Missing compiled protobuf JavaScript module in Docker image
- The `proto/compiled.js` file is not included in the container image
- This suggests a build process issue where protobuf compilation is not completing correctly

**Impact**: Core subsystem cannot start - serves real-time arrivals, static data, commute analysis

### 3. Stateful Image Pull Failure ❌ CRITICAL
**Severity**: CRITICAL - Stateful subsystem completely down

**Error**: `Failed to pull image "localhost:7439/ronaldraygun/mta-my-way:0.0.289": rpc error: code = NotFound desc = failed to pull and unpack image`

**Root Cause**: Incorrect image registry reference
- Attempting to pull from internal registry: `localhost:7439/ronaldraygun/mta-my-way:0.0.289`
- Should pull from Docker Hub: `ronaldraygun/mta-my-way:0.0.289`

**Impact**: Stateful subsystem cannot start - serves push notifications, trip tracking, session management

### 4. Resource Constraints ⚠️ WARNING
**Severity**: WARNING - Exacerbating recovery efforts

**Events**:
```
Warning  FailedScheduling: 0/3 nodes are available: 3 Insufficient cpu. 
no new claims to deallocate, preemption: 0/3 nodes are available: 
3 No preemption victims found for incoming pod
```

**Impact**: New pods cannot be scheduled due to CPU resource exhaustion across cluster nodes

### 5. Volume Attachment Issues ⚠️ WARNING
**Severity**: WARNING - Delaying stateful subsystem recovery

**Events**:
```
Warning  FailedAttachVolume: AttachVolume.Attach failed for volume "pvc-75855d3f-7127-49df-b96a-4b401d6a1342": 
rpc error: code = Internal desc = [ControllerPublishVolume] failed to attach volume: 
[2026-09-01T17:02:10Z] Volume 20697ee9-d8e7-4ef9-9926-3ca02e369270 is not yet attached
```

**Impact**: Stateful subsystem PVC experiencing attachment issues, though eventually succeeded

## Public Health Endpoint Status

### API Health Check
```bash
curl -s https://mtamyway.com/api/health
# Result: No response (timeout/connection refused)
```

### Status Page
```bash
curl -s https://mtamyway.com/status
# Result: No response (timeout/connection refused)
```

**Status**: ❌ **All public endpoints unreachable**

## Deployment Mode Verification

Based on deployment inspection, the application is configured for **CORE_ONLY mode** (per ADR-001 architecture):

### Core Subsystem (mta-my-way-core)
**Environment Variables**:
- `CORE_ONLY=true`
- `STATEFUL_SERVICE_URL=http://mta-my-way-stateful:3001`
- `STATEFUL_TIMEOUT_MS=2000`

**Served Endpoints** (when healthy):
- `/api/arrivals/:stationId` - Real-time arrivals
- `/api/stations` - Static station data
- `/api/routes` - Route index
- `/api/alerts` - MTA alerts
- `/api/commute/analyze` - Commute analysis
- `/api/trip/:tripId` - Trip lookup (read-only)
- `/*` - Static PWA assets

**Proxied Endpoints** (to stateful):
- `/api/push/*` - Push notifications
- `/api/trips` - Trip tracking (write operations)
- `/api/auth/password/*` - Password reset

### Stateful Subsystem (mta-my-way-stateful)
**Environment Variables**:
- `CORE_ONLY=false`
- `PORT=3001`
- `DATABASE_PATH=/data/subscriptions.db`
- `ALERT_HISTORY_PATH=/data/alert_history.db`

**Served Endpoints** (when healthy):
- Internal service only, not exposed to ingress
- Handles database-dependent operations

## Ingress Configuration

**IngressRoute**: `mta-my-way` (152d old)
- Routes external traffic to mta-my-way service
- **Status**: Likely non-functional due to backend pod failures

## Recovery Priority

### Immediate Actions Required

1. **CRITICAL - Fix ArgoCD Application Configuration**
   - Update destination cluster to correct apexalgo-iad endpoint
   - Restore automated sync and self-healing
   - Verify ArgoCD connectivity

2. **CRITICAL - Fix Core Application Build**
   - Investigate missing `proto/compiled.js` module
   - Fix Docker build process to include compiled protobuf files
   - Rebuild and push updated container image
   - Update deployment image version

3. **CRITICAL - Fix Stateful Image Reference**
   - Update deployment to use correct Docker Hub image
   - Remove localhost:7439 registry reference
   - Apply via correct ArgoCD workflow (after fixing #1)

4. **HIGH - Address Resource Constraints**
   - Review cluster resource allocation
   - Consider scaling up cluster nodes
   - Optimize deployment resource requests/limits

5. **MEDIUM - Resolve Volume Attachment Issues**
   - Investigate PVC attachment delays
   - Consider CSI driver updates or configuration changes

## Acceptance Criteria Status

| Criteria | Expected | Actual | Status |
|----------|----------|---------|--------|
| ArgoCD Synced | Synced | Unknown - Configuration Error | ❌ FAIL |
| ArgoCD Healthy | Healthy | Unknown - Configuration Error | ❌ FAIL |
| Core Deployment Healthy | Ready | 0/2 Ready | ❌ FAIL |
| Stateful Deployment Healthy | Ready | 0/1 Ready | ❌ FAIL |
| Public Health Endpoint | 200 OK | No Response | ❌ FAIL |
| Findings Documented | Complete | Complete | ✅ PASS |

## Conclusion

The mta-my-way deployment is in a **critical failure state** requiring immediate intervention. The application is completely non-operational with multiple cascading failures:

1. **Foundational**: ArgoCD configuration broken - blocks all automation
2. **Build**: Core application missing required modules - prevents startup
3. **Configuration**: Stateful subsystem wrong image registry - prevents pull
4. **Infrastructure**: Resource constraints and volume issues - complicate recovery

**Estimated Recovery Time**: 2-4 hours once prioritized actions are initiated.

**Recommended Immediate Action**: Declare incident, prioritize ArgoCD configuration fix, then address build and image issues in sequence.

---

**Report Generated**: 2026-09-01  
** inspected via**: kubectl (credential-free proxy)  
**Cluster**: apexalgo-iad  
**ArgoCD Status**: Inspection only (no mutations performed)