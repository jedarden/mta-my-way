# VAPID Keys

Generated: 2026-09-01 (rotated)

## Public Key (safe to share with clients)

```
BO5EKlD1qS0pUUZH9VGvEjf2o5rzK20mGOKoQc0Tv-5UwjHHOud0j1U_2VjbDhKG3jT8fBMfdLPxZxYk1cRKEFw
```

This public key is served at `GET /api/push/vapid-public-key` for the frontend to use when subscribing to push notifications.

## Private Key (secret — never commit or expose)

Stored in `.env` as `VAPID_PRIVATE_KEY` (file is gitignored).

## Key Rotation

If these keys are compromised, generate a new pair:
```bash
npx web-push generate-vapid-keys
```

Then update `.env` (or the `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` environment variables in production). Existing push subscriptions will need to re-subscribe after key rotation.

## Rotation history

- **2026-09-01** — rotated. The previous private key was found in this repo's
  `.beads/traces/` history, which mirrors to a public GitHub repo. Confirmed by
  deriving the P-256 public key from the trace value and matching it against the
  published public key. The old keypair is permanently burned; do not reuse it.
  All prior push subscriptions were invalidated by the rotation.
