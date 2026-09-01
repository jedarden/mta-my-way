# MTA My Way - Kubernetes and ArgoCD Deployment Health Report

**Report Date:** 2026-09-01
**Cluster:** apexalgo-iad
**Namespace:** mta-my-way

## Executive Summary

❌ **CRITICAL: All workloads are DOWN**

- **ArgoCD Application Status:** Unknown (InvalidSpecError)
- **Core Deployment:** 0/2 replicas ready (CrashLoopBackOff)
- **Stateful Deployment:** 0/1 replicas ready (ImagePullBackOff)
- **Public Health Endpoint:** Inaccessible (ERR_CONNECTION_CLOSED)

---

## ArgoCD Application Status

### Application: `mta-my-way`

| Field | Status |
|------|--------|
| Sync Status | **Unknown** |
| Health Status | **Unknown** |
| Operation | None |

**Critical Error:**
```
InvalidSpecError: error getting cluster by server 
"https://hcp-99476ebb-4133-4a21-ac6a-6e2bdf6794c0.spot.rackspace.com": 
rpc error: code = NotFound desc = cluster 
"https://hcp-99476ebb-4133-4a21-ac6a-6e2bdf6794c0.spot.rackspace.com" not found
```

**Root Cause:** ArgoCD application configured with non-existent cluster server URL.

---

## Kubernetes Deployment Health

### Core Deployment: `mta-my-way-core`

| Field | Status |
|------|--------|
| Replicas | 0/2 ready |
| Strategy | RollingUpdate |
| Image Version | 0.0.289 (manifest) / 0.0.82 (running pods) |
| Age | 12 days |

**Pod Status:**
- `mta-my-way-core-6bd9f88b54-74wjz`: **CrashLoopBackOff** (3 restarts, 26m old)
- `mta-my-way-core-9b48f8bdc-m285n`: **CrashLoopBackOff** (2 restarts, 26m old)  
- `mta-my-way-core-7fbcbdb69c-9q6c8`: **ImagePullBackOff** (10h old)

**Crash Reason:**
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module 
'/app/packages/server/dist/proto/compiled.js' imported from 
/app/packages/server/dist/alerts-parser.js
```

**Analysis:** Running pods use old cached image (0.0.82) via kuik cache which lacks compiled proto files required by the application.

---

### Stateful Deployment: `mta-my-way-stateful`

| Field | Status |
|------|--------|
| Replicas | 0/1 ready |
| Strategy | Recreate |
| Image Version | 0.0.289 |
| Age | 12 days |

**Pod Status:**
- `mta-my-way-stateful-5fb9bfb7dc-m9s99`: **ImagePullBackOff** (26m old)

**Image Pull Error:**
```
Failed to pull image "localhost:7439/ronaldraygun/mta-my-way:0.0.289": 
failed to resolve image: localhost:7439/ronaldraygun/mta-my-way:0.0.289: not found
```

**Analysis:** Deployment manifest correctly specifies version 0.0.289, but kuik cache doesn't have this version available locally.

---

## Public Health Endpoint

### Endpoint: `https://mtamyway.com/api/health`

| Test | Result |
|------|--------|
| DNS Resolution | ❌ Failed (mtamyway.com not resolving) |
| HTTP Response | ❌ ERR_CONNECTION_CLOSED |
| Phone Browser | ❌ "This site can't be reached" |

**Phone Browser Screenshot Confirmation:**
- Chrome displays: "This site can't be reached"
- Error: "mtamyway.com unexpectedly closed the connection"
- Code: **ERR_CONNECTION_CLOSED**

**Analysis:** Public endpoint completely inaccessible due to all pods being down.

---

## Key Findings

### 1. ArgoCD Configuration Issue
- ArgoCD application references non-existent cluster server URL
- This prevents automatic sync and health monitoring
- Manual intervention required to fix cluster destination

### 2. Image Version Mismatch
- Deployment manifests specify: `ronaldraygun/mta-my-way:0.0.289`
- Running pods use cached: `ronaldraygun/mta-my-way:0.0.82` (via kuik)
- Kuik cache serving stale images, preventing proper deployment

### 3. Core Deployment Crashes
- Old image (0.0.82) lacks compiled proto files
- Application crashes immediately on startup with module resolution error
- Pods stuck in CrashLoopBackOff

### 4. Stateful Deployment Image Pull Failure
- Correct image version (0.0.289) not available in kuik local cache
- Cannot pull newer image due to cache limitations
- Stateful PVC attachment succeeded but image pull failed

### 5. Complete Service Outage
- All pods non-functional
- Public health endpoint inaccessible
- No deployment mode verification possible (service completely down)

---

## Deployment Mode Analysis

**Expected Behavior:**
- **Core Deployment**: `CORE_ONLY=true` mode - stateless read-only operations
- **Stateful Deployment**: `CORE_ONLY=false` mode - database-dependent operations

**Actual State:** Cannot verify deployment modes as both workloads are down.

**Environment Variables Observed:**
- Core pods have: `CORE_ONLY=true`, `STATEFUL_SERVICE_URL=http://mta-my-way-stateful:3001`
- Stateful pods have: `CORE_ONLY=false`, `PORT=3001`

These configurations are correct per the deployment manifests, but cannot be verified in operation.

---

## Recommendations

### Immediate Actions Required:

1. **Fix ArgoCD Application Configuration**
   - Update cluster destination to valid apexalgo-iad server URL
   - Enable ArgoCD sync for automatic deployment management

2. **Resolve Kuik Cache Issues**
   - Clear kuik cache to force fresh image pulls
   - Ensure image `ronaldraygun/mta-my-way:0.0.289` is available
   - Consider disabling kuik for this deployment if cache issues persist

3. **Verify Image Build Pipeline**
   - Confirm version 0.0.289 was successfully built and pushed
   - Validate proto files are included in the image build process
   - Test image locally before deployment

4. **Restore DNS/Public Access**
   - Investigate why mtamyway.com is not resolving
   - Verify DNS configuration and ingress routing
   - Check if domain registration is active

### Long-term Improvements:

1. **ArgoCD Monitoring**
   - Set up alerts for InvalidSpecError conditions
   - Monitor cluster destination connectivity

2. **Image Cache Strategy**
   - Evaluate kuik cache reliability for production deployments
   - Consider direct Docker Hub pulls without local caching

3. **Health Check Improvements**
   - Add health endpoint that reports deployment mode (CORE_ONLY status)
   - Implement readiness checks that verify database connectivity

---

## Conclusion

The MTA My Way deployment is **completely non-functional** due to multiple cascading issues:

1. ArgoCD misconfiguration prevents automated sync
2. Kuik cache serving incompatible image versions
3. Image availability issues preventing proper rollout
4. DNS/public access failures

**Status:** ❌ **CRITICAL FAILURE - Service Completely Down**

**Action Required:** Immediate intervention needed to restore service functionality.