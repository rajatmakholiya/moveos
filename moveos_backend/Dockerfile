# MoveOS backend — one image runs any service via SERVICE_NAME.
# Build once, deploy nine times (api-gateway, onboarding, driver, scheduling,
# booking, location, telemetry, notification, dispatch).

# ── Build stage ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json tsconfig.build.json ./
COPY libs ./libs
COPY apps ./apps
RUN npm run build

# ── Runtime stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Production node_modules (includes generated Prisma client)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma
RUN npx prisma generate

COPY --from=build /app/dist ./dist
# tsconfig-paths resolves the @common/* alias at runtime (TS_NODE_BASEURL=./dist)
COPY tsconfig.json ./

# Which service this container runs — e.g. api-gateway, booking-service
ENV SERVICE_NAME=api-gateway
ENV PORT=3000
ENV TS_NODE_BASEURL=./dist

# All services expose GET /api/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1 || exit 1

CMD ["sh", "-c", "node -r tsconfig-paths/register dist/apps/${SERVICE_NAME}/src/main.js"]
