# Stage 1: Build web frontend (Vite + React PWA)
FROM node:22-slim AS build-web
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
COPY packages/web/package.json ./packages/web/
RUN npm ci

COPY tsconfig.json tsconfig.base.json ./
COPY packages/shared/ ./packages/shared/
COPY packages/web/ ./packages/web/
RUN npm run build -w packages/web


# Stage 2: Build server (TypeScript → Node.js)
FROM node:22-slim AS build-server
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
COPY packages/web/package.json ./packages/web/
RUN npm ci

COPY tsconfig.json tsconfig.base.json ./
COPY packages/shared/ ./packages/shared/
COPY packages/server/ ./packages/server/
RUN npm run build -w packages/server


# Stage 3: Slim runtime image
FROM node:22-slim AS runtime
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Install production dependencies only (workspace symlinks are set up here)
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
COPY packages/web/package.json ./packages/web/
RUN npm ci --omit=dev

# Copy compiled shared library and server
COPY --from=build-server /app/packages/shared/dist/ ./packages/shared/dist/
COPY --from=build-server /app/packages/server/dist/ ./packages/server/dist/

# Bake in GTFS static JSON data
COPY packages/server/data/ ./packages/server/data/

# Copy built web assets (served by Hono static middleware)
COPY --from=build-web /app/packages/web/dist/ ./packages/web/dist/

ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["node", "packages/server/dist/index.js"]
