# Role Flow Trace — Anstoss Registration Paths

This document traces the end-to-end path for each of the five `RegistrationRole` values from
signup through JIT user creation, first club interaction, `MembershipRole` assignment, and
`TeamRole` assignment. Every transition is cited with `file:line`. Gaps — places where current
code diverges from the spec intent in § 3 of `docs/superpowers/specs/2026-04-20-anstoss-revamp-design.md`
— are marked inline as `→ GAP` and consolidated at the bottom.

Enum locations for reference:
- `RegistrationRole`: `apps/api/prisma/schema.prisma:124–130`
- `MembershipRole`: `apps/api/prisma/schema.prisma:116–122`
- `TeamRole`: `apps/api/prisma/schema.prisma:148–153`
- `InviteKind`: `apps/api/prisma/schema.prisma:173–176`

---

## CLUB_ADMIN

**Intent:** User creates a new club and becomes its owner. `RegistrationRole.CLUB_ADMIN`
should gate access to `POST /clubs/setup`.

### Signup
1. User selects the "Club Admin" intent card on the `intent` step of the sign-in screen
   (`apps/mobile/app/(auth)/sign-in.tsx:54–85`). The `INTENT_OPTIONS` array includes
   `RegistrationRole.CLUB_ADMIN` at line 79.
2. `handleIntentContinue` calls `finalizeSignUp(selectedRole)` (`sign-in.tsx:730–764`),
   which hits `PATCH /me/registration-role` with `{ registrationRole: 'CLUB_ADMIN' }`.
3. `PATCH /me/registration-role` is handled by `MarketplaceController.updateRegistrationRole`
   (`apps/api/src/marketplace/marketplace.controller.ts:58–69`), which calls
   `MarketplaceService.updateRegistrationRole` (`apps/api/src/marketplace/marketplace.service.ts:55–73`).
   This writes `registrationRole: CLUB_ADMIN` to `User.registrationRole`.

### JIT user creation
4. The first authenticated API call (typically `GET /me` or `PATCH /me`) triggers
   `ClerkAuthGuard.canActivate` (`apps/api/src/auth/clerk.guard.ts:31–259`).
5. If no `User` row exists for the `clerkId`, the guard creates one at
   `clerk.guard.ts:189–198` via `prisma.user.create`. The created row uses the Prisma
   schema default `registrationRole: PLAYER` (`schema.prisma:30`).

   → **GAP 1** — JIT user creation at `clerk.guard.ts:189–198` does not accept a
   `registrationRole` parameter. The user row is always created with the default `PLAYER`.
   The actual role is patched separately by `PATCH /me/registration-role` in step 3. This
   means a race condition exists: if the JIT create and the role patch race, or if the
   mobile flow is interrupted before `finalizeSignUp` completes, the stored role may remain
   `PLAYER` indefinitely. (Owner task: **Task 3**)

### First club interaction — create
6. After `refreshUser`, `AuthContext.fetchUser` sets `user.registrationRole` in state
   (`apps/mobile/src/context/AuthContext.tsx:407–414`).
7. `apps/mobile/app/index.tsx:38–40` checks `user?.registrationRole === 'CLUB_ADMIN'` and
   redirects to `/club-setup` when `memberships.length === 0`.
8. The club setup wizard calls `POST /clubs/setup`
   (`apps/api/src/clubs/clubs.controller.ts:28–55`). The controller imports `ClubsService`
   but does **not** inspect `user.registrationRole` before proceeding.

   → **GAP 2** — `POST /clubs/setup` (`clubs.controller.ts:28–55`) has no guard that
   checks `registrationRole === CLUB_ADMIN`. Any authenticated user who knows the endpoint
   can create a club regardless of their declared intent. (Owner task: **Task 3**)

### MembershipRole assignment
9. Inside `ClubsService.createClubWithTeam`, a `Membership` row is created with
   `role: MembershipRole.OWNER` at `apps/api/src/clubs/clubs.service.ts:38–44`.
   `CLUB_ADMIN` (a `RegistrationRole`) thus maps to `OWNER` (a `MembershipRole`) at
   club-create time.

### TeamRole assignment
10. In the same transaction, a `TeamAccess` row is created with `role: TeamRole.HEAD_COACH`
    at `clubs.service.ts:98–107`, and a `TeamMember` roster entry is created at
    `clubs.service.ts:109–114`.

### Onboarding
11. After `refreshUser` returns with a non-empty `memberships` array, `index.tsx:45–48`
    redirects to `/onboarding`. `onboarding.tsx` derives steps from `clubRole`:
    `MembershipRole.OWNER` matches the `OWNER || ADMIN` branch at
    `apps/mobile/app/onboarding.tsx:74–95`.
12. `completeOnboarding` writes a local `AsyncStorage` key
    (`AuthContext.tsx:488–493`). There is no backend call.

    → **GAP 3** — Onboarding completion is tracked only in `AsyncStorage` on the device
    (`AuthContext.tsx:488–493`). There is no `POST /me/onboarding` endpoint and no
    server-side `onboardingCompletedAt` field on `User`. Clearing app data or switching
    devices re-triggers the wizard. (Owner task: **Task 7**)

---

## COACH

**Intent:** User joins an existing club as a coaching staff member via an invite that carries
`TeamRole.HEAD_COACH` or `TeamRole.ASSISTANT_COACH`.

### Signup
1. User selects "Coach" intent. `INTENT_OPTIONS` includes `RegistrationRole.COACH` at
   `sign-in.tsx:66–73`. `finalizeSignUp` calls `PATCH /me/registration-role` as above;
   role is persisted on the `User` row.
2. Same JIT gap applies (GAP 1).

### Post-signup routing
3. `index.tsx:42` routes a user with no memberships and `registrationRole !== FREE_AGENT`
   and `!== CLUB_ADMIN` to `/account-next-step`.
4. `account-next-step.tsx:19–23` treats `COACH` as a `isJoinRequestRole` and shows the
   "Join Club" CTA. The user is directed to `/join-club`.

   → **GAP 4** — The coach path through `/join-club` (`apps/mobile/app/join-club.tsx`)
   only shows `PLAYER` and `PARENT` role chips (`join-club.tsx:21`, `join-club.tsx:274`).
   A coach who arrives at `/join-club` cannot express that they want to join as a coach;
   the role selection is silently constrained. The join-request role sent to
   `POST /clubs/:clubId/join-requests` will be `PLAYER` by default. (Owner task: **Task 4**)

### First club interaction — join via invite
5. The intended path for coaches is a club admin sending an invite with
   `role: TeamRole.HEAD_COACH` or `TeamRole.ASSISTANT_COACH`. The invite is created via
   `InvitesService.create` (`apps/api/src/invites/invites.service.ts:36–176`).
   The invite's `role` field is set from `input.role` at `invites.service.ts:114`.

### MembershipRole assignment on invite redemption
6. `InvitesService.redeem` (`invites.service.ts:231–261`) calls
   `activateMembershipInvite` which calls `mapTeamRoleToMembershipRole(invite.role)`
   (`invites.service.ts:704–714`). `HEAD_COACH` and `ASSISTANT_COACH` both map to
   `MembershipRole.COACH`.
7. The membership `upsert` at `invites.service.ts:287–299` uses that mapped role on `create`
   but passes `update: {}`, meaning if a membership already exists, its role is **not**
   upgraded. This is intentional for idempotency but could leave a pre-existing `PLAYER`
   membership unchanged if the coach was previously a player.

### TeamRole assignment
8. `TeamAccess` is upserted at `invites.service.ts:302–322` with `role: invite.role`
   (not a hardcoded default). The `TeamRole` carried on the `Invite` row propagates
   correctly to `TeamAccess`.

### Onboarding
9. After club join, `onboarding.tsx` checks for `MembershipRole.COACH` or
   `teamRole === 'HEAD_COACH' || 'ASSISTANT_COACH'` at `onboarding.tsx:98–122`. Steps
   include a "team" step and an "invite" step. Same GAP 3 applies for persistence.

---

## PLAYER

**Intent:** User joins an existing club as a player, either via invite or via join-request.

### Signup
1. User selects "Player" intent. `RegistrationRole.PLAYER` is the first option at
   `sign-in.tsx:55–63`. `PATCH /me/registration-role` persists it. Same JIT GAP 1 applies.

### Post-signup routing
2. `index.tsx:42` routes to `/account-next-step`. `account-next-step.tsx` treats `PLAYER`
   as `isJoinRequestRole` and shows the "Join Club" CTA.
3. `/join-club` supports the `PLAYER` role. The role chip is shown and defaults to
   `PLAYER` (`join-club.tsx:42`). The user can look up a club by slug and submit
   `POST /clubs/:clubId/join-requests`.

### First club interaction — join via invite
4. If the player arrives via an invite link (`/join/[...code]`), the sign-in screen
   detects `inviteCode` and calls `GET /public/invites/:code` to prefetch the invite role
   (`sign-in.tsx:217–230`). `mapInviteRoleToRegistrationRole` maps `PLAYER` to
   `RegistrationRole.PLAYER` (`sign-in.tsx:134–138`). `finalizeSignUp` then calls
   `PATCH /me/registration-role` with this inferred role.
5. Invite redemption (`POST /invites/redeem` → `InvitesService.redeem`) checks if the
   player is under 16 at `invites.service.ts:254–258`. If so, it branches to
   `requestParentalApproval`; otherwise to `activateMembershipInvite`.

### MembershipRole assignment
6. `activateMembershipInvite` upserts a membership with
   `role: mapTeamRoleToMembershipRole('PLAYER')` = `MembershipRole.PLAYER`
   (`invites.service.ts:284`, `invites.service.ts:704–714`).

### TeamRole assignment
7. `TeamAccess` is upserted with `role: invite.role` = `TeamRole.PLAYER`
   (`invites.service.ts:302–322`). A `TeamMember` roster entry is also upserted at
   `invites.service.ts:324–337`.

### Onboarding
8. `onboarding.tsx` defaults to the player steps when none of the admin/coach/parent
   branches match (`onboarding.tsx:145–161`). Same GAP 3 applies.

---

## PARENT

**Intent:** User joins as a parent/guardian of a child player. The approval flow uses
`InviteKind.PARENT_APPROVAL`.

### Signup
1. User selects "Parent" intent. `RegistrationRole.PARENT` is listed at
   `sign-in.tsx:57–65`. `PATCH /me/registration-role` persists it. Same JIT GAP 1 applies.

### Post-signup routing
2. `index.tsx:42` routes to `/account-next-step`. `account-next-step.tsx:20` treats
   `PARENT` as a `isJoinRequestRole` and shows the "Join Club" CTA.
3. `/join-club` shows `PARENT` as a selectable role chip (alongside `PLAYER`) at
   `join-club.tsx:274`. The user can request to join.

### First club interaction — parent approval flow
4. The primary parent path is initiated when a club admin sends a `MEMBER_INVITE` with
   `role: TeamRole.PARENT` and a `guardianEmail`. At invite creation,
   `invites.service.ts:106–139` records the invite with `kind: InviteKind.MEMBER_INVITE`
   (not `PARENT_APPROVAL`) and `role: TeamRole.PARENT`.
5. When the **child player** redeems their own player invite and is detected as under 16
   (`invites.service.ts:254–258`), the service branches to `requestParentalApproval`
   (`invites.service.ts:373–528`). This path creates a new `Invite` with
   `kind: InviteKind.PARENT_APPROVAL` at `invites.service.ts:469–494` and emails the
   guardian.
6. The guardian follows the email link, signs up or logs in, and redeems the
   `PARENT_APPROVAL` invite. `InvitesService.redeem` at `invites.service.ts:250` detects
   `invite.kind === InviteKind.PARENT_APPROVAL` and calls `redeemParentApproval`
   (`invites.service.ts:530–692`).

### MembershipRole and TeamRole assignment on parent approval
7. `redeemParentApproval` upserts a membership with `role: MembershipRole.PARENT` for the
   guardian at `invites.service.ts:566–579`. It also upserts a membership for the child
   with `MembershipRole.PLAYER` at `invites.service.ts:581–594`.
8. `TeamAccess` for the guardian is upserted with `role: TeamRole.PARENT` at
   `invites.service.ts:596–616`. `TeamAccess` for the child is activated (status set to
   `ACTIVE`) at `invites.service.ts:618–637`.
9. `ParentalConsent` is updated to `APPROVED` at `invites.service.ts:653–659`.
10. A `GuardianRelationship` row is created at `invites.service.ts:662–669`.

    The `InviteKind.PARENT_APPROVAL` kind is thus wired end-to-end: created at
    `invites.service.ts:475`, detected at `invites.service.ts:250`, and fully handled in
    `redeemParentApproval`.

### PARENT arriving without invite (self-registration path)
11. A parent who uses `/join-club` and submits a join request with `role: PARENT` ends up
    waiting for manual admin approval. There is no automated flow to link them to a child
    player without an admin-sent `MEMBER_INVITE` carrying `linkedPlayerUserId`.

    → **GAP 5** — The self-registration parent path (via `/join-club`) has no mechanism to
    link the guardian to a child player at join-request time. `POST /clubs/:clubId/join-requests`
    does not accept a `guardianEmail` or `linkedPlayerUserId`. An admin must manually
    create the `MEMBER_INVITE` and `GuardianRelationship` afterwards. (Owner task: **Task 4**)

### Onboarding
12. `onboarding.tsx:124–140` shows parent-specific steps when `clubRole === MembershipRole.PARENT`.
    Same GAP 3 applies.

---

## FREE_AGENT

**Intent:** User does not belong to a club. They create a public profile to be discovered
by clubs and receive trial invites.

### Signup
1. User selects "Free Agent" intent. `RegistrationRole.FREE_AGENT` is listed at
   `sign-in.tsx:80–85`. `PATCH /me/registration-role` persists it. Same JIT GAP 1 applies.

### Post-signup routing
2. `index.tsx:34–36` checks `user?.registrationRole === 'FREE_AGENT'` when
   `memberships.length === 0` and redirects to `/free-agent/profile`.

### Free-agent profile creation
3. `apps/mobile/app/free-agent/profile.tsx` loads by calling `GET /me/free-agent-profile`
   and `GET /me/trial-invites` in parallel (`profile.tsx:78–81`).
4. On save, `profile.tsx:212–215` first ensures `registrationRole === 'FREE_AGENT'` by
   calling `PATCH /me/registration-role` if needed, then calls `POST /me/free-agent-profile`
   or `PATCH /me/free-agent-profile` depending on whether a profile already exists
   (`profile.tsx:220–233`).

### API endpoints for free-agent profile
5. `GET /me/free-agent-profile` → `MarketplaceController.getMyFreeAgentProfile`
   (`marketplace.controller.ts:30–33`).
6. `POST /me/free-agent-profile` → `MarketplaceController.createFreeAgentProfile`
   (`marketplace.controller.ts:36–44`).
7. `PATCH /me/free-agent-profile` → `MarketplaceController.updateFreeAgentProfile`
   (`marketplace.controller.ts:47–55`).
8. `GET /free-agents` (public discovery list) → `MarketplaceController.listFreeAgents`
   (`marketplace.controller.ts:71–76`).
9. `GET /free-agents/:id` (public profile) → `MarketplaceController.getFreeAgentProfile`
   (`marketplace.controller.ts:78–82`).
10. `GET /me/trial-invites` → `MarketplaceController.listMyTrialInvites`
    (`marketplace.controller.ts:105–108`).
11. `PATCH /trial-invites/:id` (accept/decline) → `MarketplaceController.respondToTrialInvite`
    (`marketplace.controller.ts:111–124`).
12. `POST /clubs/:clubId/trial-invites` (club sends invite) →
    `MarketplaceController.createTrialInvite` (`marketplace.controller.ts:86–95`).

    → **GAP 6** — `DELETE /me/free-agent-profile` does not exist. The mobile UI has no
    delete path, and there is no API endpoint to remove a profile. A free agent who
    subsequently joins a club cannot remove their public profile without using the GDPR
    account deletion flow. (Owner task: **Task 5**)

    → **GAP 7** — `DELETE /me/free-agent-profile/experience/:id` does not exist as a
    standalone endpoint. Experience entries are managed only via full-profile `PATCH`, which
    requires sending the entire experience array. This is workable but fragile; a concurrent
    edit can overwrite entries. (Owner task: **Task 5**)

### MembershipRole and TeamRole assignment
13. Free agents do not get a `Membership` or `TeamAccess` row at signup. If a trial invite
    is accepted (`PATCH /trial-invites/:id` with `status: ACCEPTED`), it records the
    acceptance on `TrialInvite.status` but does **not** create a `Membership` or
    `TeamAccess` row. Moving from trial-accepted to actual club member requires a separate
    invite from the club admin via the standard `MEMBER_INVITE` path.

    → **GAP 8** — Accepting a trial invite (`TrialInvite.status → ACCEPTED`) does not
    trigger `Membership` or `TeamAccess` creation. The free agent remains outside the club's
    data model until a coach or admin manually issues a `MEMBER_INVITE`. There is no
    automated handoff from trial-accept to membership. (Owner task: **Task 5**)

### Onboarding
14. A free agent with no memberships is routed directly to `/free-agent/profile`, bypassing
    the onboarding wizard entirely (`index.tsx:34–36`). There is no onboarding flow specific
    to free agents. Same GAP 3 applies if they later join a club.

---

## Consolidated Gap List

| # | Description | Location | Owner Task |
|---|---|---|---|
| 1 | JIT user creation (`clerk.guard.ts:189–198`) always sets `registrationRole` to the Prisma default `PLAYER` (`schema.prisma:30`). The correct role is patched separately via `PATCH /me/registration-role` after signup completes. A race or interrupted flow leaves `PLAYER` as the permanent value. | `apps/api/src/auth/clerk.guard.ts:189` | **Task 3** |
| 2 | `POST /clubs/setup` (`clubs.controller.ts:28–55`) has no guard that checks `registrationRole === CLUB_ADMIN`. Any authenticated user can call the endpoint and become a club owner. | `apps/api/src/clubs/clubs.controller.ts:28` | **Task 3** |
| 3 | Onboarding completion is stored only in `AsyncStorage` on the device (`AuthContext.tsx:488–493`). No `POST /me/onboarding` endpoint exists and `User` has no `onboardingCompletedAt` field. Clearing app data or switching devices re-triggers the onboarding wizard. | `apps/mobile/src/context/AuthContext.tsx:488` | **Task 7** |
| 4 | The `/join-club` screen (`join-club.tsx:21`, `join-club.tsx:274`) only exposes `PLAYER` and `PARENT` role options. A user with `registrationRole === COACH` who arrives here cannot express a coach intent; the join request is silently submitted as `PLAYER`. | `apps/mobile/app/join-club.tsx:21` | **Task 4** |
| 5 | The self-registration parent path via `/join-club` has no field for `guardianEmail` or `linkedPlayerUserId`. An admin must manually create the `MEMBER_INVITE` with `linkedPlayerUserId` to wire the `GuardianRelationship`. There is no automated parent-linking on join-request. | `apps/mobile/app/join-club.tsx:106–125` | **Task 4** |
| 6 | `DELETE /me/free-agent-profile` does not exist in `marketplace.controller.ts`. A free agent who later joins a club cannot remove their public profile without triggering GDPR account deletion. | `apps/api/src/marketplace/marketplace.controller.ts` | **Task 5** |
| 7 | No `DELETE /me/free-agent-profile/experience/:id` endpoint. Experience entries are managed only via full-profile `PATCH`, requiring the client to send the entire array; concurrent edits can silently overwrite entries. | `apps/api/src/marketplace/marketplace.controller.ts` | **Task 5** |
| 8 | Accepting a trial invite (`PATCH /trial-invites/:id` → `TrialInvite.status: ACCEPTED`) does not create a `Membership` or `TeamAccess` row. The free agent remains outside the club's role model until a coach manually issues a `MEMBER_INVITE`. | `apps/api/src/marketplace/marketplace.service.ts` | **Task 5** |
