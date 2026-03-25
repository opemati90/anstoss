# Changelog

All notable changes to this project will be documented in this file.

## [0.0.2.0] - 2026-03-25

### Added
- Real Clerk authentication replacing dev-mode auth (email OTP with sign-in/sign-up fallback)
- Event update (PATCH) and cancel (DELETE) endpoints with creator-only authorization
- Soft-delete pattern for events via `cancelledAt` timestamp with Prisma migration
- Redis-backed chat rate limiting using atomic `SET NX PX` for cluster safety
- Graceful fallback when Redis is unavailable (allows messages instead of blocking chat)
- Edit profile screen with animated avatar and PATCH /me integration
- Invite redemption screen with deep link support (anstoss.app/join)
- Push notification provider component
- Clerk token cache using expo-secure-store for encrypted at-rest storage
- `updateEventSchema` in shared package for partial event updates
- Mobile test suite (Jest + jest-expo) with API client and auth flow tests
- Events service unit tests (19 tests covering all guard clauses)
- CI job for mobile tests in GitHub Actions
- Dockerfile with auto-migration on startup
- `.dockerignore` for optimized Docker builds

### Changed
- Auth flow now uses Clerk SDK (useSignIn/useSignUp hooks) instead of dev tokens
- AuthContext refactored to use Clerk hooks (useAuth, useUser) with `setTokenGetter()` pattern
- API client uses module-level token getter to avoid circular dependency with AuthContext
- Chat gateway rate limiting moved from in-memory Map to Redis for multi-instance support
- Profile card on More screen now navigable (TouchableOpacity with chevron)
- Deep linking configured for iOS (associated domains) and Android (intent filters)
- `listUpcoming` query now filters out cancelled events

### Fixed
- Cancelled events can no longer be RSVP'd to, updated, or re-cancelled (BadRequestException guards)
