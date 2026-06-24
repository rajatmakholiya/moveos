# MoveOS Admin

Next.js admin dashboard for the MoveOS platform (Pahadi Rides).

## Required environment variable

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | Full base URL of the MoveOS API gateway, including the `/api` segment (e.g. `http://localhost:3000/api`). |

Copy `.env.example` to `.env.local` and set the value before running or building.

```bash
cp .env.example .env.local
# edit .env.local with your gateway URL
```

> **Static export note:** this app uses `output: 'export'`. `NEXT_PUBLIC_API_URL` is baked
> into the bundle at build time. Any change to this variable requires a full rebuild
> (`npm run build`) and redeployment of the `out/` directory.

## Development

```bash
npm install
npm run dev      # starts on http://localhost:3001 by default
```

## Build

```bash
npm run build    # emits static files to out/
```
