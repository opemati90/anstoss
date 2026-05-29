FROM node:22-alpine AS builder

WORKDIR /app

# Copy root package files + npm config
COPY package.json package-lock.json turbo.json .npmrc ./

# Copy workspace package.json files (only what the API needs)
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

# Install only API + shared deps (skips mobile/admin/web/worker — keeps jest-expo
# and other mobile-only deps out of the image entirely)
RUN npm ci --workspace=@anstoss/api --workspace=@anstoss/shared --include-workspace-root

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

CMD ["sh", "-c", "npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma && node apps/api/dist/main.js"]
