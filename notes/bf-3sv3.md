# CI Migration: GitHub Actions → Argo Workflows

**Bead:** bf-3sv3  
**Date:** 2026-07-03  
**Completed:** ✅

## Summary

Migrated mta-my-way CI pipeline from GitHub Actions to Argo Workflows per infrastructure policy. All GitHub Actions workflows are disabled across all repos; CI/CD runs exclusively on Argo Workflows in the `iad-ci` cluster.

## Changes

### 1. Created Argo Workflows WorkflowTemplate

**File:** `~/declarative-config/k8s/iad-ci/argo-workflows/mta-my-way-ci-workflowtemplate.yml`

**Pipeline stages:**
- **Checkout:** Clones repo from Forgejo at specified branch/commit
- **Install Dependencies:** Runs `npm ci` for all workspace packages
- **Lint:** Runs `npm run lint` (Biome + ESLint)
- **Typecheck:** Runs `npm run typecheck` (TypeScript `tsc --build`)
- **Test:** Runs `npm run test` (Vitest)

**Resource limits:**
- CPU: 500m - 2000m
- Memory: 1Gi - 2Gi per step

### 2. Genesis Bead Closure

Updated and closed genesis bead `mta-my-way-s23` with all 8 phases marked complete:
- Phase 1: Core ✅
- Phase 2: Smart Commute ✅
- Phase 3: Alerts & Notifications ✅
- Phase 4: Polish ✅
- Phase 5: Intelligence ✅
- Phase 6: Awareness ✅
- Phase 7: Trust & Resilience ✅
- Cross-Cutting: Testing, security, migration, observability ✅

All 24 sub-beads were already closed; this task completed the final migration and closed the umbrella.

## Verification

WorkflowTemplate is deployed via ArgoCD app `argo-workflows-ns-iad-ci` which syncs from:
```
jedarden/declarative-config → k8s/iad-ci/argo-workflows/
```

To manually trigger the CI workflow:

```bash
kubectl --kubeconfig=/home/coding/.kube/iad-ci.kubeconfig create -f - <<EOF
apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  generateName: mta-my-way-ci-manual-
  namespace: argo-workflows
spec:
  workflowTemplateRef:
    name: mta-my-way-ci
  arguments:
    parameters:
      - name: branch
        value: main
EOF
```

## References

- **Policy:** CLAUDE.md → "CI/CD — Argo Workflows (iad-ci)"
- **Forgejo repo:** https://git.ardenone.com/jedarden/mta-my-way
- **GitHub mirror:** https://github.com/jedarden/mta-my-way (read-only)
