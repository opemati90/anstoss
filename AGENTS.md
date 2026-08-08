# Anstoss

White-label mobile app platform for amateur football clubs in Germany/Europe.

## Architecture

Turborepo monorepo:

- `apps/mobile` — Expo React Native (portrait, phone-only)
- `apps/api` — NestJS REST + Socket.io
- `packages/shared` — Zod schemas, types, constants, error classes

## Stack

- **Auth:** Custom email OTP via Resend + 30-day HS256 session JWT
- **DB:** Railway Postgres (PG18, EU West / Amsterdam) + Prisma ORM
- **Cache:** Upstash Redis (rate limiting, Socket.io adapter, push batching)
- **Storage:** Cloudflare R2 (badges, avatars)
- **Email:** Resend
- **Push:** Expo Push API
- **Payments:** Stripe Connect + SEPA (Sprint 2)
- **CI/CD:** GitHub Actions + EAS Build
- **Monitoring:** Sentry + pino structured logging

## Design System

Always read `DESIGN.md` before making any visual or UI decisions.
Industrial/Utilitarian aesthetic. DM Sans + Geist Mono. Club-adaptive warm grays.
Do not deviate without explicit user approval.

## Engineering Rules

- Prisma tenant-scoping middleware on ALL tenant-scoped models
- JIT user creation from the email-OTP session JWT — no webhook dependency
- Socket.io must use Upstash Redis adapter
- API rate limiting: 5 writes/sec, 20 reads/sec per user
- RSVP debounce 500ms + disabled during API call
- AsyncStorage LRU cache with 4MB cap
- Stale-while-revalidate for all data fetching
- Named exception classes — no generic catch-all
- Zod schemas in packages/shared — validate on client AND server
- Age gate: block under-16s (GDPR Article 8, Germany = 16)

## Testing

Run: `npm test` (runs turbo test across all workspaces)

- API: Jest
- Mobile: Jest + React Native Testing Library
- Coverage target: 80%+ API, 60%+ mobile

## Commands

```bash
npm run dev        # Start all apps in dev mode
npm run build      # Build all apps
npm run test       # Run all tests
npm run lint       # Lint all workspaces
```
