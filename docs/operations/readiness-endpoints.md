# Readiness endpoint audit

The lightweight machine-readiness contract is `GET /healthz`. It returns the
small JSON readiness response, is non-cacheable, and is registered before the
normal middleware chain. Runtime clients, Playwright startup polling, shared
server test endpoint constants, and container smoke checks use this path.

The routes have deliberately different consumers:

| Consumer | Endpoint | Decision |
| --- | --- | --- |
| Runtime readiness and test harnesses | `/healthz` | Use the lightweight process-readiness response. |
| MTA My Way stateful deployment readiness probe | `/healthz` | Uses the lightweight response in the `declarative-config` repository at `k8s/apexalgo-iad/mta-my-way/deployment-stateful.yaml`. |
| MTA My Way core deployment readiness probe | `/api/health` | Intentional detailed feed-health gate, documented by the manifest comment in the `declarative-config` repository at `k8s/apexalgo-iad/mta-my-way/deployment-core.yaml`; do not replace it blindly with the lightweight route. |
| Browser Health screen and in-app links | `/health` | Intentional client-facing browser route. It is not a machine-readiness consumer. |
| Detailed API health checks | `/api/health` | Per-feed and subsystem status; not interchangeable with `/healthz`. |

The legacy `/health` JSON alias remains temporarily for backward compatibility
while consumers migrate. New machine consumers must use `/healthz`; the alias
and browser links are retained only for the migration and SPA route boundaries.
