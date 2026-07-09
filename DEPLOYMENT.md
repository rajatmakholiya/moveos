# MoveOS — Production Deployment Runbook

Single-VPS deployment via Docker Compose. One nginx entrypoint fronts the PWA,
admin portal, and API gateway; nine backend services + Postgres + Redis run on
an internal network.

## 0. What you need before launch

| Dependency | Required? | Env vars | Where to get it |
|---|---|---|---|
| **Razorpay** (collections) | **Yes** | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | dashboard.razorpay.com → API Keys |
| **Ola Maps** | **Yes** | `OLA_MAPS_API_KEY` | maps.olakrutrim.com |
| **MSG91** (SMS OTP) | **Yes** — the gateway refuses to boot in production with `SMS_PROVIDER=dev` | `MSG91_AUTH_KEY`, `MSG91_OTP_TEMPLATE_ID` (DLT-approved), `MSG91_SENDER_ID` | msg91.com |
| Firebase FCM (push) | Optional (falls back to log-only) | `FCM_*`, `FIREBASE_WEB_*` | console.firebase.google.com |
| HyperVerge (KYC) | Optional (dev provider auto-verifies — fine for pilot, not for compliance) | `HYPERVERGE_APP_ID`, `HYPERVERGE_APP_KEY` | hyperverge.co |
| RazorpayX (payouts) | Optional (dev provider simulates payouts) | `RAZORPAYX_*` | razorpay.com/x |

Every integration is behind a provider interface (`libs/common/src/providers`).
Switching `*_PROVIDER=dev` → real provider + credentials is the only change
needed — no code edits.

## 1. First deploy

```bash
# On the VPS (Docker + Compose v2 installed)
git clone <repo> moveos && cd moveos
cp .env.production.example .env.production
nano .env.production           # fill in PUBLIC_URL, secrets, providers

docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build

# Apply database migrations (idempotent — safe to re-run)
docker compose -f docker-compose.prod.yml exec api-gateway npx prisma migrate deploy

# Seed routes + demo data (first boot only; review prisma/seed.ts first)
docker compose -f docker-compose.prod.yml exec api-gateway node dist/prisma/seed.js 2>/dev/null \
  || docker compose -f docker-compose.prod.yml exec api-gateway npx ts-node prisma/seed.ts
```

Create the first SUPER_ADMIN by inserting a `User` row with `role='SUPER_ADMIN'`
and your phone, then log in to `/admin/` via OTP:

```bash
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U moveos -d moveos -c \
  "INSERT INTO \"User\" (id, phone, role, name, status, \"createdAt\", \"updatedAt\")
   VALUES ('admin-boot', '+91XXXXXXXXXX', 'SUPER_ADMIN', 'Platform Admin', 'ACTIVE', now(), now());"
```

## 2. Smoke test

```bash
BASE=$PUBLIC_URL
curl -fsS $BASE/api/health                     # gateway up
curl -fsS $BASE/                               # PWA up
curl -fsS $BASE/admin/                         # admin up
# OTP round trip (requires real SMS provider):
curl -fsS -X POST $BASE/api/auth/admin/otp/request \
  -H 'content-type: application/json' -d '{"phone":"+91XXXXXXXXXX"}'
```

End-to-end: onboard a passenger in the PWA → search a route → book a seat
(cash) → onboard a driver → instant KYC (`/driver/onboarding/verify`) → post a
trip → depart → verify pickup OTP → complete → check driver wallet credit on
`/driver/earnings`.

## 3. Updating (zero-downtime-ish)

```bash
cd moveos && git pull
docker compose -f docker-compose.prod.yml --env-file .env.production build
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
docker compose -f docker-compose.prod.yml exec api-gateway npx prisma migrate deploy
```

## 4. Rollback

```bash
git checkout <last-good-tag-or-sha>
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Migrations are forward-only — never `migrate reset` in production. If a bad
migration ships, write a compensating migration rather than rolling the schema
back.

## 5. Backups

```bash
# Nightly cron on the VPS:
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U moveos moveos | gzip > /backups/moveos-$(date +%F).sql.gz
```

Also back up the `uploads_data` volume (driver/vehicle documents):
`docker run --rm -v moveos_uploads_data:/data -v /backups:/out alpine tar czf /out/uploads-$(date +%F).tgz /data`

## 6. TLS

Point DNS at the VPS, then either:
- put the whole stack behind Cloudflare (simplest), or
- terminate TLS in nginx: mount certs into the nginx service, add a 443 server
  block to `deploy/nginx.conf`, and publish `443:443` in the compose file.
  certbot's webroot mode works with the existing nginx container.

## 7. Operations notes

- **Logs**: `docker compose -f docker-compose.prod.yml logs -f api-gateway`
  (every response carries an `X-Request-Id` for correlation).
- **Rate limits**: 300 req/min/IP global, 10 req/min/IP on OTP-request routes
  (tune via `RATE_LIMIT_*`). Redis-backed — consistent across replicas.
- **Clustering sweep**: runs inside scheduling-service every
  `CLUSTER_INTERVAL_MINUTES` (default 30). Trigger manually from the admin
  portal (Clusters → "Run clustering now").
- **Parked code**: `ride-service` (on-demand ride-hail flow) is intentionally
  not deployed. See `moveos_backend/apps/ride-service/README.md`.
- **Dev OTP behaviour**: with `SMS_PROVIDER=dev`, OTP codes are returned in API
  responses (`devOtpCode`) so flows are testable without SMS. Production boot
  is blocked in this mode unless `ALLOW_DEV_PROVIDERS_IN_PRODUCTION=true`.
