# Deploy & Local Development Guide

## Local Development Setup

### Prerequisites
- Node 22+ (`nvm use 22`)
- iOS Simulator (Xcode) or Android emulator

### Quick Start
```bash
git clone https://github.com/opemati90/anstoss.git
cd anstoss
npm install
```

### API (local)
```bash
# Copy env and fill in values (see API Environment Variables below)
cp apps/api/.env.example apps/api/.env

# Generate Prisma client
cd apps/api && npx prisma generate

# Run migrations against local Postgres
npx prisma migrate dev

# Seed demo data
npx prisma db seed

# Start API
cd ../.. && npm run dev --workspace=@anstoss/api
```

### Mobile (local)
```bash
# Create .env with your Clerk publishable key and API URL
cat > apps/mobile/.env <<EOF
EXPO_PUBLIC_API_URL=http://localhost:3001
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
EXPO_PUBLIC_SENTRY_DSN=
EOF

# Start Metro + iOS simulator
cd apps/mobile
npx expo start --ios
```

### Clerk Dashboard Settings
- Authentication method: **Email code** (not magic link, not social)
- No additional sign-up fields required beyond email
- Redirect URLs: not needed (native app, no OAuth flow)

---

## Pre-Deploy Checklist

- [ ] All tests pass: `npm test`
- [ ] Lint clean: `npm run lint`
- [ ] TypeScript clean: `npx tsc --noEmit -p apps/api/tsconfig.json`
- [ ] CI green on develop branch

---

## Environment Variables

### API (Railway)

**Required:**
```
NODE_ENV=production
PORT=3000
DATABASE_URL=${{Postgres.DATABASE_URL}}         # Railway Postgres (EU West) reference var
DATABASE_URL_DIRECT=${{Postgres.DATABASE_URL}}  # Railway has no separate pooler endpoint
CLERK_SECRET_KEY=<clerk-secret>
UPSTASH_REDIS_URL=<upstash-url>
UPSTASH_REDIS_TOKEN=<upstash-token>
SENTRY_DSN=<sentry-api-dsn>
MIN_APP_VERSION=1.0.0
RECOMMENDED_APP_VERSION=1.0.0
STRIPE_SECRET_KEY=<stripe-test-secret>
STRIPE_WEBHOOK_SECRET=<stripe-whsec>
R2_ACCOUNT_ID=<cloudflare-account-id>
R2_ACCESS_KEY_ID=<r2-access-key>
R2_SECRET_ACCESS_KEY=<r2-secret>
R2_BUCKET_NAME=anstoss-assets
R2_PUBLIC_BASE_URL=<r2-public-url>
```

**Optional (degrade gracefully if missing):**
```
REDIS_URL=<ioredis-url>              # Chat Redis adapter; single-instance without it
RESEND_API_KEY=<resend-key>           # Email sending; emails silently skip without it
RESEND_FROM_EMAIL=noreply@anstoss.app # Sender address
APP_URL=https://app.anstoss.de        # Link generation; has default fallback
LIBRETRANSLATE_URL=<url>              # chat/DM translation; feature off (graceful) without it
LIBRETRANSLATE_API_KEY=<key>          # only if your LibreTranslate instance requires a key
# fussball.de data (fixtures, table, results, search, match events, live ticker)
# all come from the self-hosted scraper sidecar — fussball.de has no official
# commercial API. (api-fussball.de does NOT exist; FUSSBALL_API_TOKEN is gone.)
FUSSBALL_SCRAPER_URL=<url>            # scraper sidecar base URL; fixtures/table/live disabled without it
FUSSBALL_SCRAPER_API_KEY=<key>        # scraper sidecar auth (X-API-Key)
FUSSBALL_LIVE_INTERVAL_MS=60000       # live-fixture poll interval (min 15000); drives the live ticker
FUSSBALL_LIVE_WORKER_DISABLED=true    # set to fully disable the live poller
ADMIN_API_KEY=<key>                   # Internal admin endpoints
LOG_LEVEL=info                        # Pino log level
```

### Mobile (EAS / .env)

```
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=<clerk-pub-key>
EXPO_PUBLIC_API_URL=https://anstoss-api-production.up.railway.app
EXPO_PUBLIC_SENTRY_DSN=<sentry-mobile-dsn>
```

### GitHub Secrets

```
EXPO_TOKEN          — Expo access token
RAILWAY_TOKEN       — Railway deploy token
```

---

## Deploy Steps

### 1. Database (Railway Postgres)
```bash
cd apps/api
# Prisma reads DATABASE_URL for queries and DATABASE_URL_DIRECT for migrations
# (the datasource block declares both); set both when running manually.
DATABASE_URL="<direct-url>" DATABASE_URL_DIRECT="<direct-url>" npx prisma migrate deploy
```
On Railway, migrations run automatically in the **pre-deploy phase**
(`railway.toml` → `[deploy] preDeployCommand`), between build and traffic
cutover. If a migration fails the deploy aborts and the previous version keeps
serving — the app container's start command no longer runs migrations, so it
won't boot against a half-migrated schema. (Self-hosting outside Railway must
run `prisma migrate deploy` before starting the app, since it's no longer in the
Docker CMD.)

### 2. API (Railway)
```bash
# Auto-deploys from develop branch via GitHub integration
# Or manual: railway up
```

### 3. Mobile — TestFlight / Play Store
```bash
cd apps/mobile

# TestFlight build
eas build --profile testflight --platform ios

# Submit to TestFlight
eas submit --platform ios

# Android internal test
eas build --profile preview --platform android
```

**iOS notes:**
- `ITSAppUsesNonExemptEncryption: false` is set in app.json (skips encryption questions)
- Push entitlements: `production` (set in app.json + entitlements file)
- APNs key must be uploaded to Expo: `eas credentials`

### 4. OTA Updates (post-initial build)
```bash
cd apps/mobile
eas update --branch production --message "description of changes"
```

---

## Rollback

### API
```bash
# Railway: revert to previous deployment in dashboard
# Or: git revert HEAD && git push
```

### Mobile
```bash
# OTA: publish previous JS bundle
eas update --branch production --message "rollback: <reason>"

# Native: cannot rollback — must submit new build
```

### Database
```bash
# Railway Postgres: restore from a volume backup in the dashboard
# Or: write a down migration
```

---

## Post-Deploy Verification

- [ ] API health: `curl https://anstoss-api-production.up.railway.app/health` returns `{"status":"ok","db":"ok"}`
- [ ] Auth flow: sign in with Clerk email code
- [ ] Create club + team through setup wizard
- [ ] Create event, RSVP works
- [ ] Chat messages send + receive
- [ ] Push notifications arrive on device
- [ ] Sentry: trigger test error, verify in dashboard
- [ ] Logs: check Railway logs for structured JSON output

## Performance Targets

- App launch: < 3s
- RSVP response: < 500ms
- Chat message delivery: < 200ms
- API p95 latency: < 300ms
- Team switching: < 200ms
