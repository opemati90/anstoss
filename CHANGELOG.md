# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0] - 2026-04-25

Renuir-derived revamp (DESIGN.md, 2026-04-17). Phases 3b–5.4 of the revamp spec land here as one release: a cohesive editorial visual pass plus the cross-cutting accessibility, motion, and performance work the primitives needed to look right.

### Added
- Role-aware home screen (admin, coach, player, parent, free agent) with memoized branch.
- Empty / error / loading state primitives wired across data-fetching screens.
- Join flow rebuild covering invite redemption, code entry, and pending-approval states.
- WCAG AA contrast audit script (`npm run check:contrast` in `apps/mobile`).
- Eslint rule requiring `accessibilityLabel`/`accessibilityRole` on `Pressable`.
- Cross-flow E2E coverage for sentence-case copy and updated state strings.
- New plan documents under `docs/superpowers/plans/` for the cross-flow and token-drift phases.

### Changed
- Pre-provider screens (`_layout.tsx`, `e2e.tsx`, `index.tsx`) now derive palette from `useColorScheme()` + `lightTheme`/`darkTheme` instead of hardcoded `neutralColors`.
- Light-theme tokens darkened to meet WCAG AA: `TEXT_TERTIARY`, `SUCCESS`, `WARNING`.
- Primary CTA scale pulse retuned to spec §6.3 (100ms @ 0.95).
- `SelectionSheet`, `MultiSelectSheet`, `ClubSwitcher`, `TeamSwitcher` honor `AccessibilityInfo.isReduceMotionEnabled`.
- All copy moved to sentence case across `en`, `de`, `fr`, `it`, `pt` locales.
- `ChatScreen` and `DmListView` FlatLists tuned with `removeClippedSubviews`, `windowSize`, `initialNumToRender`, `maxToRenderPerBatch`.
- CI mobile-test job uses `--forceExit --testTimeout=30000` and a 15-minute job timeout.

### Fixed
- `haptics.ts` no longer leaks an `AccessibilityInfo` listener at module scope (was hanging jest without `--forceExit`).
- 20 `Pressable` accessibility violations across sheets, chip selectors, and primitives.
- Two pre-existing unused-import lint errors (`radius` in `register/index.tsx`, `hairline` in `StatCard.tsx`).

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
