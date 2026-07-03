# CI Build Attempt for bf-2k2o

**Date:** 2026-07-03

## Task
Run CI build to push ronaldraygun/mta-my-way image to Docker Hub

## Action Taken
Submitted `mta-my-way-build` workflow manually to iad-ci cluster:
```bash
kubectl --kubeconfig=/home/coding/.kube/iad-ci.kubeconfig create -f - <<EOF
apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  generateName: mta-my-way-build-manual-
  namespace: argo-workflows
spec:
  workflowTemplateRef:
    name: mta-my-way-build
EOF
```

Workflow: `mta-my-way-build-manual-286cc`

## Result
**FAILED** at lint step

- Phase: Failed
- Error: child `mta-my-way-build-manual-286cc-3020984109` failed
- Failed node: `lint` - exit code 134 (SIGABRT, typically OOM)

## Issue
This is the known ESLint OOM crash in 2Gi container, documented in recent commits:
- `c5dab08 docs: capture mta-my-way-build lint logs showing ESLint OOM crash in 2Gi container`
- `6f33c96 docs: capture mta-my-way-build lint logs showing ESLint OOM crash in 2Gi container`

The lint step in the `mta-my-way-build` WorkflowTemplate needs more memory or ESLint configuration tuning to avoid the OOM.

## Next Steps
To successfully build and push the image, the workflow template needs to be updated to either:
1. Increase memory limits for the lint step
2. Skip or optimize the lint step
3. Use a different linting approach

The Docker build step itself was not reached due to the lint failure.
