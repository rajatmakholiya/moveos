# MoveOS admin portal — static export served by nginx.
# NEXT_PUBLIC_* vars are baked at build time — pass them as build args.

FROM node:20-alpine AS build
WORKDIR /app

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Production build → static export in .next-prod (see next.config.js)
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/.next-prod /usr/share/nginx/html
# SPA-style fallback: unknown paths resolve to their .html export or index
RUN printf 'server {\n\
  listen 80;\n\
  root /usr/share/nginx/html;\n\
  index index.html;\n\
  location / {\n\
    try_files $uri $uri.html $uri/ /index.html;\n\
  }\n\
}\n' > /etc/nginx/conf.d/default.conf

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:80 >/dev/null 2>&1 || exit 1
