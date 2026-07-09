# MoveOS — Pahadi Rides

Scheduled shared-seat intercity ride platform for hill regions. Drivers post
trips with seat inventory (front ₹2,500 / back ₹2,000 base); passengers browse
and book seats. Not urban ride-hail — no dynamic dispatch.

## Monorepo

| Directory | What it is | Stack |
|---|---|---|
| [moveos_backend](moveos_backend) | 9 microservices behind an API gateway | NestJS, Prisma/PostgreSQL, Redis, Socket.IO |
| [moveos-pwa](moveos-pwa) | Passenger + driver app (installable PWA, EN/HI) | Next.js 14, Tailwind, SWR, Leaflet |
| [moveos-admin](moveos-admin) | Super-admin + org-admin portal | Next.js 13 (static export), shadcn/MUI, MapLibre |

## Key capabilities

- **Booking flow**: search → seat booking (Redis seat locks) → Razorpay UPI or
  cash → live tracking (Socket.IO) → geofenced pickup OTP → completion →
  driver wallet settlement (commission-aware) → invoice PDF → driver rating.
- **Organizations**: multi-tenant fleets — invitations, driver/vehicle
  compliance, assignments, audit log, org-admin portal; independent drivers
  fully supported alongside.
- **KYC & compliance**: instant provider verification (Aadhaar OKYC, DL/RTO,
  RC/Vahan, face match) with auto-approval, manual super-admin review queue as
  fallback, and hard gates (KYC, document expiry, assignment, org status)
  before a driver can go online or post trips — always with actionable
  blocked reasons.
- **Clusters** (GROWTH plan): DBSCAN groups nearby same-destination seat
  requests into one bookable offer; a driver accepts → trip auto-created →
  passengers confirm.
- **Payouts**: penny-drop bank verification → RazorpayX payouts with
  reserve/compensate wallet ledger accounting.
- **Notifications**: FCM push + MSG91 SMS via a persistent device-token
  registry, fed by a Redis event bus (`pahadi:events`).

## External dependencies (all swappable via env)

`SMS_PROVIDER` (dev|msg91) · `PUSH_PROVIDER` (dev|fcm) · `KYC_PROVIDER`
(dev|hyperverge) · `PAYOUT_PROVIDER` (dev|razorpayx) · Razorpay (collections)
· Ola Maps. Every `dev` provider is a fully working local simulation — the
whole product runs end-to-end with zero external accounts.

## Development

```bash
# backend
cd moveos_backend
npm install && cp .env.example .env   # repeat for apps/*/.env.example
npm run docker:up                      # Postgres + Redis
npx prisma migrate deploy && npm run db:seed
npm run start:dev:all

# PWA (http://localhost:3010)
cd moveos-pwa && npm install && npm run dev

# admin (http://localhost:3000 conflicts with the gateway — use another port)
cd moveos-admin && npm install && npx next dev -p 3011
```

Tests: `cd moveos_backend && npm run test:contracts` (23 suites).

## Production

See [DEPLOYMENT.md](DEPLOYMENT.md) — single-VPS Docker Compose
(`docker-compose.prod.yml`): nginx → PWA + admin + gateway, nine backend
services, Postgres, Redis. `ride-service` (on-demand flow) is intentionally
parked and not deployed.
