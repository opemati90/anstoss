FROM node:22-alpine AS builder

WORKDIR /app

# Copy root package files + npm config
COPY package.json package-lock.json turbo.json .npmrc ./

# Copy workspace package.json files (only what the API needs)
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

# Install only API + shared deps (skips mobile/admin/web/worker — keeps jest-expo
# and other mobile-only deps out of the image entirely).
# --ignore-scripts: npm ci still resolves the full lockfile (incl. mobile's
# @sentry/cli, whose postinstall hard-requires proxy-from-env and breaks the
# build). The API has no native deps needing install scripts; prisma generate
# runs explicitly below, so skipping lifecycle scripts is safe here.
RUN npm ci --workspace=@anstoss/api --workspace=@anstoss/shared --include-workspace-root --ignore-scripts

# Copy source
COPY packages/shared/ packages/shared/
COPY apps/api/ apps/api/

# Generate Prisma client
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma

# Build shared + API
RUN npx turbo run build --filter=@anstoss/api

# --- Production ---
FROM node:22-alpine AS runner

# OpenSSL needed by Prisma query engine
RUN apk add --no-cache openssl

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/apps/api/package.json ./apps/api/

ENV NODE_ENV=production
EXPOSE 3000

# Migrations run in Railway's pre-deploy phase (see railway.toml preDeployCommand),
# so the start command only boots the app. Keeping migrate out of CMD means it
# runs once per deploy instead of on every container start/scale/restart, and a
# migration failure aborts the deploy rather than crash-looping here.
CMD ["node", "apps/api/dist/main.js"]
