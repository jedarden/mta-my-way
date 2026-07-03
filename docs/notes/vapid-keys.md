# VAPID Keys

Generated: 2026-07-03

## Public Key (safe to share with clients)

```
BPlMozsVDoaJA52J0Zjmsxk6DDB-yTFIfCsffasy8d1pHLVyieQyQh0I2v9EIoSaR3ETMY221uFDQczp_1UrlZQ
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
