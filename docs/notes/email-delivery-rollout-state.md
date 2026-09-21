# Password-Reset Email Delivery — Rollout State (mtamyway-fedd4b07)

Recorded 2026-09-21 while working bead `mtamyway-fedd4b07` (configure and verify real
production password-reset email delivery for apexalgo-iad). This note captures the
verified current state, the blocked external dependencies, and the exact activation
sequence so the remaining work is mechanical once the blockers clear.

## What the app already supports

`packages/server/src/services/password-reset.service.ts` implements `console`
(development), `sendgrid` (HTTPS API), `ses`, and `smtp` providers.
`packages/server/src/index.ts` reads the provider and all credentials from
environment; nothing is hardcoded.

New in this change: `reportEmailProviderReadiness()` is called once at startup and
logs `Email provider ready` / `Email provider not ready` with the provider name and
the missing variable name — never a value. A production pod that selects a real
provider with missing credentials now says so in the first seconds of boot instead
of only failing per request.

## Verified current state (2026-09-21)

### 1. No provider credentials exist anywhere in the fleet

Full recursive sweep of every agent-readable OpenBao prefix (read identities only;
paths listed, never values):

```
openbao-v2:        629 leaf paths under secret/ardenone-cluster
rs-manager:        194 leaf paths under secret/rs-manager
ardenone-manager:   26 leaf paths under secret/ardenone-manager
```

Zero paths matching `mail|smtp|sendgrid|ses|postmark|mailgun|resend` beyond
`rs-manager/ord-devimprint/commitgraph/alert-webhooks` (webhook URLs, not email).
`secret/rs-manager/apexalgo-iad/` contains only `cloudflare/`, `jedarden-preview/`,
`mcp/`, `needle-observability/`. No AWS account material anywhere.

### 2. No verified sending identity

**Updated 2026-09-21 (epoch 11): mtamyway.com was never registered.** Verisign
RDAP returns 404 from the .com registry (control: `ardenone.com` → 200); the
name is NXDOMAIN at 8.8.8.8/9.9.9.9/1.1.1.1 and the Cloudflare nameservers
REFUSE it (no zone is served there). The digs below predate that finding and
only show no *mail* records. Cluster-side DNS plumbing is now complete:
declarative-config commit `4e0c4334` (sibling bead `mtamyway-9ad0760f`)
pre-wired `mtamyway.com` into the external-dns domain filter, and the
IngressRoute/cloudflared ingress already name the hostname with the correct
tunnel target. So the DNS prerequisite is purely operator-side, in order:
**register the domain → add the zone to the Cloudflare account → bounce the
external-dns Deployment** (zone discovery runs at startup).

Both candidate domains are Cloudflare-hosted with no mail records at all:

```
dig +short @andy.ns.cloudflare.com mtamyway.com MX   -> (empty)
dig +short @andy.ns.cloudflare.com mtamyway.com TXT  -> (empty)
dig +short @andy.ns.cloudflare.com ardenone.com MX   -> (empty)
dig +short TXT _amazonses.<domain>                   -> (empty, both)
```

No SES verification token, no SendGrid domain-authentication CNAMEs, no SPF, no MX.
`noreply@mtamyway.com` cannot receive or send today. The nixos-asterisk PBX alert
SMTP (`modules/pbx-monitoring.nix`) is test placeholders only (`smtp.example`);
its real values, if any, live in an age-encrypted file readable only by the PBX host.

### 3. GitOps sync for mta-my-way is severed

```
kubectl --server=http://traefik-apexalgo-iad:8001 \
  get applications.argoproj.io mta-my-way -n argocd -o jsonpath='{.status.conditions}'
-> InvalidSpecError: error getting cluster by server
   "https://hcp-99476ebb-4133-4a21-ac6a-6e2bdf6794c0.spot.rackspace.com": NotFound
```

ArgoCD runs in apexalgo-iad itself (`argocd-apexalgo-iad-*` pods) and has **zero**
registered cluster secrets
(`get secrets -n argocd -l argocd.argoproj.io/secret-type=cluster` → none). Any
commit to `declarative-config/k8s/apexalgo-iad/mta-my-way/` will not deploy until
the destination cluster is re-registered (see the `argocd-register` ansible role
pattern in `k8s/ardenone-cluster/ansible/apexalgo-hub/`).

### 4. Production is down in apexalgo-iad

```
mta-my-way-stateful-58f8b65cb7-rpszb  ImagePullBackOff   7d18h
  -> Back-off pulling image "localhost:7439/ronaldraygun/mta-my-way:0.0.289"
     (kube-image-keeper rewrite; cache entry for this tag is failing)
mta-my-way-core-6bd9f88b54-c9k4v      CrashLoopBackOff   32 restarts
  -> ERR_MODULE_NOT_FOUND: /app/packages/server/dist/proto/compiled.js
     (image 0.0.289 predates the Dockerfile `compile-proto` step; current main
     builds correctly)
```

No reset endpoint exists to test against until the deployment pin advances past
0.0.289 and sync works again.

### 5. Write access to apexalgo-iad is expired

`~/.kube/apexalgo-iad.kubeconfig` → `Unauthorized` (same failure mode as the
iad-kalshi kubeconfig found expired 2026-08-29). Only the read-only tailnet proxy
(`http://traefik-apexalgo-iad:8001`) works. Sealing new secret keys offline is
possible with `k8s/ardenone-cluster/ansible/apexalgo-hub/roles/argocd-register/files/sealing-cert.pem`
via `kubeseal --cert`, but deploying them requires a working kubeconfig or ArgoCD.

## Recommended provider

**SendGrid** (free tier is ample for password-reset volume), with **SES** as the
alternative if the operator stands up an AWS account for other reasons.

Rationale: no AWS presence exists in the fleet; SES out of sandbox needs a new AWS
account plus production-access justification. The operator already controls
Cloudflare DNS for both domains (external-dns tokens exist), and SendGrid domain
authentication is a handful of DNS records — the lowest-friction path to a valid
sending identity for `noreply@mtamyway.com`.

## Activation sequence (once credentials exist)

1. Operator **registers the `mtamyway.com` domain** (it has never been
   registered — see §2), adds the zone to the Cloudflare account, and bounces the
   external-dns Deployment in apexalgo-iad so the hostname's CNAME publishes.
   Then creates the SendGrid account, authenticates the `mtamyway.com` domain
   (DNS records via Cloudflare), and verifies `noreply@mtamyway.com` is a valid
   sender. Controlled test inbox: any mailbox the operator can read.
2. Store the key in OpenBao under the owning path
   (`secret/rs-manager/apexalgo-iad/mta-my-way/email`), piped, never in argv:
   `... | bao-as rs-manager-provision bao kv put -cas=<N> secret/rs-manager/apexalgo-iad/mta-my-way email sendgrid_api_key=-`
   (`bao-as rs-manager-provision bao kv metadata get -format=json ...` to obtain
   the current version; verify by `current_version`, never by reading back).
3. Add `sendgrid-api-key` to the `mta-my-way-secrets` SealedSecret
   (`declarative-config/k8s/apexalgo-iad/mta-my-way/sealedsecret.yaml`): create the
   Secret manifest from the value via stdin/@file, seal offline with the repo
   sealing cert (`kubeseal --cert ... --scope cluster-wide` — the controller is
   `sealed-secrets-apexalgo-iad` in ns `sealed-secrets`), append the ciphertext
   entry. Do not replace the whole encryptedData map — one bad entry breaks the
   vapid keys' Secret too.
4. In `deployment-stateful.yaml`, set `EMAIL_PROVIDER: "sendgrid"` and add
   `SENDGRID_API_KEY` via `secretKeyRef` to `mta-my-way-secrets`. Keep
   `EMAIL_FROM: noreply@mtamyway.com`, `RESET_BASE_URL: https://mtamyway.com`.
   Leave `EMAIL_PROVIDER: console` for local dev only.
5. Re-register the destination cluster with ArgoCD (condition in §3) and let the
   app sync; bump the image pin past 0.0.289 so the stateful pod actually starts.
6. Verify: `Email provider ready {provider:"sendgrid"}` in stateful startup logs
   (no credential values), then `POST /api/auth/password/reset` for an existing
   test account; confirm arrival in the controlled inbox and that the
   `/reset-password/confirm?tokenId=…&token=…` link completes a reset. The route
   returns 200 regardless (enumeration protection), so delivery must be judged
   from the provider/inbox side — never from the response body.

## Related pre-existing defect (classification only, not owned here)

`packages/server/src/services/password-reset.service.test.ts`
"should send email via SES when configured" fails at HEAD (verified by stashing
this bead's changes): vitest rejects `new` on an arrow-function
`mockImplementation`, so `new SESClient(...)` throws
"is not a constructor". Stale test code — same class as the known CI-red family
tracked under the open CI beads. Eight new readiness tests added by this bead all
pass; this one failure predates them.
