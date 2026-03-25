# Deploy Checklist

## Pre-Deploy

- [ ] All tests pass: `npm test`
- [ ] TypeScript clean: `npx tsc --noEmit -p apps/api/tsconfig.json`
- [ ] CI green on main branch

## Environment Variables (API — Railway)

```
NODE_ENV=production
PORT=3000
DATABASE_URL=<neon-pooler-url>
DATABASE_URL_DIRECT=<neon-direct-url>
CLERK_SECRET_KEY=<clerk-secret>
UPSTASH_REDIS_URL=<upstash-url>
UPSTASH_REDIS_TOKEN=<upstash-token>
SENTRY_DSN=<sentry-api-dsn>
MIN_APP_VERSION=1.0.0
RECOMMENDED_APP_VERSION=1.0.0
```

## Environment Variables (Mobile — EAS)

```
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=<clerk-pub-key>
EXPO_PUBLIC_API_URL=<railway-api-url>
EXPO_PUBLIC_SENTRY_DSN=<sentry-mobile-dsn>
```

For local mobile development, create `apps/mobile/.env` from `apps/mobile/.env.example`.

## Deploy Steps

### 1. Database (Neon)
```bash
cd apps/api
npx prisma migrate deploy
```

### 2. API (Railway via Docker)
```bash
# Railway auto-deploys from main branch using Dockerfile
# Dockerfile runs prisma migrate deploy on startup automatically
# Or manual: railway up
```

### 3. Mobile (EAS Build)
```bash
cd apps/mobile
eas build --profile preview --platform all
```

### 4. OTA Updates (post-initial build)
```bash
cd apps/mobile
eas update --branch staging --message "description of changes"
```

## Rollback Plan

### API Rollback
```bash
# Railway: revert to previous deployment in dashboard
# Or: git revert HEAD && git push
```

### Mobile Rollback
```bash
# OTA: publish previous JS bundle
eas update --branch production --message "rollback: <reason>"

# Native: cannot rollback — must submit new build
```

### Database Rollback
```bash
# Neon: restore from point-in-time backup in dashboard
# Or: write a down migration
```

## Post-Deploy Verification

- [ ] API health: `curl <api-url>/health` returns 200
- [ ] Auth flow: login with Clerk email code
- [ ] Create club + team through setup wizard
- [ ] Create event, RSVP works
- [ ] Chat messages send + receive in real-time
- [ ] Push notifications arrive on device
- [ ] Sentry: check for new errors in dashboard
- [ ] Logs: check Railway logs for structured JSON output

## Performance Targets

- App launch: < 3s
- RSVP response: < 500ms
- Chat message delivery: < 200ms
- API p95 latency: < 300ms
- Team switching: < 200ms

## Sprint 2 — Additional Verification

### GitHub Secrets Required

```
EXPO_TOKEN          — Expo access token (set ✅)
RAILWAY_TOKEN       — Railway deploy token (set ✅)
RAILWAY_API_SERVICE — Railway service name/ID (⚠️ set this in GitHub secrets)
```

### Database Migration

Sprint 2 adds loan fields to TeamAccess (`loanedFromTeamId`, `loanStartDate`, `loanEndDate`).
The Dockerfile runs `prisma migrate deploy` on startup, so migration is automatic.

### Sprint 2 Post-Deploy Verification

- [ ] API health: `curl <api-url>/health` returns 200
- [ ] Team switching feels instant (< 200ms)
- [ ] Parent can see children's events across teams (`GET /me/children-events`)
- [ ] Coach can loan a player to another team (`POST /clubs/:id/teams/:id/loans`)
- [ ] Loaned player appears on both rosters with badge
- [ ] Event filter by type (ALL/TRAINING/MATCH/OTHER) works
- [ ] Chat search returns relevant messages
- [ ] Roster shows jersey numbers and positions
- [ ] Roster edit sheet saves position + jersey number
- [ ] Admin sees club-wide stats (`GET /clubs/:id/stats`)
- [ ] Aggregate roster shows all teams (`GET /clubs/:id/roster-aggregate`)
- [ ] Parent Schedule and Club Stats screens render
- [ ] All roles (OWNER, ADMIN, COACH, PLAYER, PARENT) see correct home screen sections
