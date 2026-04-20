# Phase 2 — Backend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit and close gaps in the backend role model so every registration path (`CLUB_ADMIN`, `COACH`, `PLAYER`, `PARENT`, `FREE_AGENT`) flows cleanly end-to-end, without relying on manual DB seeding or undocumented auto-assignment behavior. Add regression tests that lock the intended behavior before UI work in Phase 3 consumes it.

**Architecture:** Audit-first (§ 3.1 trace → doc), then lock-before-fix (tests pin current behavior, then fixes correct it), then additive-only migrations. Shared schemas in `packages/shared` stay canonical; both client and server consume them.

**Tech Stack:** NestJS, Prisma, Postgres (Neon), Zod (`packages/shared`), Jest, Supertest (controller specs), test containers for integration tests.

**Spec reference:** `docs/superpowers/specs/2026-04-20-anstoss-revamp-design.md` § 3.

---

## File Structure

### Created
- `docs/revamp/role-flow.md` — trace doc, one section per `RegistrationRole`.

### Modified (likely — confirmed by trace in Task 1)
- `apps/api/src/clubs/clubs.service.ts` — guard auto-assignment behind `RegistrationRole.CLUB_ADMIN`.
- `apps/api/src/clubs/clubs.service.spec.ts` — regression tests.
- `apps/api/src/invites/invites.service.ts` — verify `TeamRole` propagation through redemption.
- `apps/api/src/invites/invites.service.spec.ts` — regression tests.
- `apps/api/src/marketplace/marketplace.service.ts` — free-agent profile CRUD completeness.
- `apps/api/src/marketplace/marketplace.service.spec.ts` — coverage fill-ins.
- `apps/api/src/users/users.service.ts` — `RegistrationRole` persisted at JIT user creation.
- `packages/shared/src/schemas/auth.ts` — onboarding payload schema.
- `packages/shared/src/schemas/club.ts` — club-create payload alignment with Prisma.
- `packages/shared/src/schemas/marketplace.ts` — free-agent profile update schema.

### Not modified in this phase
- `apps/api/prisma/schema.prisma` — no enum value changes, no destructive migrations in this phase. Additive migrations only if trace reveals a missing field.

---

## Task 1 — Role-flow trace doc

**Files:**
- Create: `docs/revamp/role-flow.md`

- [ ] **Step 1.1: Scaffold the trace doc.**

```bash
cat > docs/revamp/role-flow.md <<'EOF'
# Role Flow Trace

For each `RegistrationRole` enum value, trace: signup → JIT user creation → first club interaction → `MembershipRole` assignment → `TeamRole` assignment. Record file:line references and current behavior. Flag gaps with `→ GAP`.

## CLUB_ADMIN
- Signup entry point: `apps/mobile/app/(auth)/sign-in.tsx` → Clerk magic link.
- JIT user creation: `apps/api/src/users/users.service.ts:<line>` — note whether `RegistrationRole` is persisted.
- Onboarding route: `apps/mobile/app/onboarding.tsx` (CLUB_ADMIN branch, if present).
- Club creation path: `apps/api/src/clubs/clubs.service.ts:<line>` `createClubWithTeam`.
- Membership assigned: OWNER (confirmed at `clubs.service.ts:38`).
- Team role assigned: HEAD_COACH (confirmed at `clubs.service.ts:98-...`).
- → GAP: [note any missing steps]

## COACH
- (same structure)

## PLAYER
- (same structure)

## PARENT
- (same structure)

## FREE_AGENT
- (same structure)

## Consolidated gap list
- [ ] Gap 1: [description] — owner: Task N below.
- [ ] Gap 2: [description] — owner: Task N below.
EOF
```

- [ ] **Step 1.2: Fill in each role's trace.**

For each role, open `apps/mobile/app/onboarding.tsx` and walk the branch, then open each API call it triggers and record the path. Capture `file:line` for every step. Mark actual vs. intended behavior — `GAP` where they diverge.

- [ ] **Step 1.3: Consolidate gap list at the bottom.**

Each gap gets mapped to one of Tasks 3-6 below. If a gap falls outside this plan, note it and move on (it becomes a follow-up).

- [ ] **Step 1.4: Commit.**

```bash
git add docs/revamp/role-flow.md
git commit -m "docs(revamp): trace role flow for all registration paths"
```

---

## Task 2 — Regression tests: lock current club-create behavior

Before modifying `clubs.service.ts`, pin current behavior with tests. Phase 2 fixes then change expectations explicitly, not accidentally.

**Files:**
- Modify: `apps/api/src/clubs/clubs.service.spec.ts`

- [ ] **Step 2.1: Add regression test for `createClubWithTeam`.**

Append to `apps/api/src/clubs/clubs.service.spec.ts`:

```typescript
describe('createClubWithTeam — regression lock', () => {
  it('assigns OWNER membership to the creator', async () => {
    const user = await createTestUser({ role: 'CLUB_ADMIN' })
    const { clubId } = await clubsService.createClubWithTeam(
      user.id,
      { name: 'Test Club', primaryColor: '#2563EB' },
      { name: '1. Mannschaft' },
    )
    const membership = await prisma.membership.findFirst({
      where: { userId: user.id, clubId },
    })
    expect(membership?.role).toBe('OWNER')
  })

  it('adds the creator as HEAD_COACH on the first team', async () => {
    const user = await createTestUser({ role: 'CLUB_ADMIN' })
    const { teamId, clubId } = await clubsService.createClubWithTeam(
      user.id,
      { name: 'Test Club', primaryColor: '#2563EB' },
      { name: '1. Mannschaft' },
    )
    const access = await prisma.teamAccess.findFirst({
      where: { userId: user.id, teamId, clubId },
    })
    expect(access?.role).toBe('HEAD_COACH')
    expect(access?.status).toBe('ACTIVE')
  })

  it('seeds DEFAULT_TEAM_GROUPS in sort order', async () => {
    const user = await createTestUser({ role: 'CLUB_ADMIN' })
    const { clubId } = await clubsService.createClubWithTeam(
      user.id,
      { name: 'Test Club', primaryColor: '#2563EB' },
      { name: '1. Mannschaft' },
    )
    const groups = await prisma.teamGroup.findMany({
      where: { clubId },
      orderBy: { sortOrder: 'asc' },
    })
    expect(groups.length).toBeGreaterThan(0)
    expect(groups[0].sortOrder).toBe(0)
  })
})
```

- [ ] **Step 2.2: Run tests.**

```bash
cd apps/api && npm test -- clubs.service.spec.ts
```

Expected: all three new tests pass (locking current behavior). Existing tests still pass.

- [ ] **Step 2.3: Commit.**

```bash
git add apps/api/src/clubs/clubs.service.spec.ts
git commit -m "test(clubs): lock createClubWithTeam behavior before revamp gap fixes"
```

---

## Task 3 — Guard club auto-assignment behind CLUB_ADMIN

Gap (likely, confirmed by Task 1 trace): `createClubWithTeam` currently auto-assigns OWNER+HEAD_COACH regardless of `RegistrationRole`. Non-CLUB_ADMIN registrations should not reach this code path in practice, but the guard makes the contract explicit and fail-loud.

**Files:**
- Modify: `apps/api/src/clubs/clubs.service.ts`
- Modify: `apps/api/src/clubs/clubs.service.spec.ts`
- Modify: `apps/api/src/users/users.service.ts` (if `registrationRole` not already persisted on the user)

- [ ] **Step 3.1: Confirm gap from Task 1 trace.**

Open `docs/revamp/role-flow.md`. If the CLUB_ADMIN section shows `registrationRole` is persisted at JIT user creation and `createClubWithTeam` checks it, this task is a no-op — skip to Task 4. If the trace shows it's missing, continue.

- [ ] **Step 3.2: Write failing guard test.**

Append to `clubs.service.spec.ts`:

```typescript
describe('createClubWithTeam — registration role guard', () => {
  it('rejects creation if the caller is not registered as CLUB_ADMIN', async () => {
    const user = await createTestUser({ registrationRole: 'PLAYER' })
    await expect(
      clubsService.createClubWithTeam(
        user.id,
        { name: 'Should Fail', primaryColor: '#2563EB' },
        { name: '1. Mannschaft' },
      ),
    ).rejects.toThrow(/CLUB_ADMIN/)
  })

  it('allows creation for a CLUB_ADMIN-registered user', async () => {
    const user = await createTestUser({ registrationRole: 'CLUB_ADMIN' })
    await expect(
      clubsService.createClubWithTeam(
        user.id,
        { name: 'OK Club', primaryColor: '#2563EB' },
        { name: '1. Mannschaft' },
      ),
    ).resolves.toBeDefined()
  })
})
```

- [ ] **Step 3.3: Run the new tests and confirm they fail.**

```bash
cd apps/api && npm test -- clubs.service.spec.ts -t 'registration role guard'
```

Expected: first test fails (no guard yet), second passes (always allowed currently).

- [ ] **Step 3.4: Implement the guard.**

In `apps/api/src/clubs/clubs.service.ts`, inside `createClubWithTeam`, before the `$transaction` call:

```typescript
const user = await this.prisma.user.findUnique({
  where: { id: userId },
  select: { registrationRole: true },
})
if (!user) {
  throw new NotFoundException('User not found')
}
if (user.registrationRole !== 'CLUB_ADMIN') {
  throw new ForbiddenException(
    'Only users registered as CLUB_ADMIN can create a club',
  )
}
```

Imports at the top:

```typescript
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
```

- [ ] **Step 3.5: Run tests and confirm pass.**

```bash
cd apps/api && npm test -- clubs.service.spec.ts
```

Expected: all tests pass, including the guard tests.

- [ ] **Step 3.6: Commit.**

```bash
git add apps/api/src/clubs/clubs.service.ts apps/api/src/clubs/clubs.service.spec.ts
git commit -m "feat(clubs): guard createClubWithTeam behind RegistrationRole.CLUB_ADMIN"
```

---

## Task 4 — Verify and lock invite-role propagation

`apps/api/src/invites/invites.service.ts:20` already imports `TeamRole` and uses it. The gap (if any) is in redemption: does the resulting `TeamAccess` row carry the invite's `role`, not a hardcoded default?

**Files:**
- Modify: `apps/api/src/invites/invites.service.spec.ts`
- Modify: `apps/api/src/invites/invites.service.ts` (only if tests reveal a bug)

- [ ] **Step 4.1: Write regression tests covering each TeamRole via redemption.**

Append to `apps/api/src/invites/invites.service.spec.ts`:

```typescript
describe('InvitesService — role propagation through redemption', () => {
  const roles: TeamRole[] = ['HEAD_COACH', 'ASSISTANT_COACH', 'PLAYER', 'PARENT']

  it.each(roles)(
    'redeems an invite with role=%s and creates TeamAccess with the same role',
    async (role) => {
      const admin = await createTestUser({ registrationRole: 'CLUB_ADMIN' })
      const { clubId, teamId } = await clubsService.createClubWithTeam(
        admin.id,
        { name: 'Role Test', primaryColor: '#2563EB' },
        { name: '1. Mannschaft' },
      )
      const invite = await invitesService.create(clubId, admin.id, {
        teamId,
        role,
        phase: 'FULL',
        kind: 'MEMBER_INVITE',
        deliveryChannel: 'EMAIL',
        email: `${role}@test.com`,
      })

      const redeemer = await createTestUser({ email: `${role}@test.com` })
      await invitesService.redeem(invite.token, redeemer.id, {})

      const access = await prisma.teamAccess.findFirst({
        where: { userId: redeemer.id, teamId },
      })
      expect(access?.role).toBe(role)
      expect(access?.status).toBe('ACTIVE')
    },
  )
})
```

- [ ] **Step 4.2: Run tests.**

```bash
cd apps/api && npm test -- invites.service.spec.ts -t 'role propagation'
```

Expected: if the service already propagates correctly, all four pass. If any fail, the failure message localizes the bug (role mismatch between invite and TeamAccess).

- [ ] **Step 4.3: Fix if any test fails.**

Open `apps/api/src/invites/invites.service.ts`, find the redemption path (search for `redeem`), and confirm the `TeamAccess` creation uses `invite.role`, not a hardcoded value. If a hardcoded value is present, replace it:

```typescript
// Before (hypothetical bug):
role: TeamRole.PLAYER,

// After:
role: invite.role,
```

- [ ] **Step 4.4: Re-run tests.**

```bash
cd apps/api && npm test -- invites.service.spec.ts
```

Expected: all pass.

- [ ] **Step 4.5: Commit.**

```bash
git add apps/api/src/invites/
git commit -m "test(invites): lock role propagation from invite to TeamAccess"
```

(Or `feat(invites): ...` if a fix was made.)

---

## Task 5 — Free-agent profile endpoint completeness

`apps/api/src/marketplace/marketplace.service.ts` hosts free-agent profile logic. Verify CRUD completeness, visibility rules, and discovery search.

**Files:**
- Modify: `apps/api/src/marketplace/marketplace.service.spec.ts`
- Modify: `apps/api/src/marketplace/marketplace.service.ts` (only if gap found)
- Modify: `packages/shared/src/schemas/marketplace.ts` (only if schema missing fields)

- [ ] **Step 5.1: Inventory current endpoints.**

```bash
grep -n "@Get\|@Post\|@Patch\|@Delete\|@Put" apps/api/src/marketplace/marketplace.controller.ts
```

Note each route. Expected shape (spec intent):

- `POST /marketplace/free-agents` — create profile (for `FREE_AGENT` users)
- `PATCH /marketplace/free-agents/me` — update own profile
- `GET /marketplace/free-agents/me` — fetch own profile
- `GET /marketplace/free-agents` — list/search (club-admin visibility)
- `GET /marketplace/free-agents/:id` — detail view
- `DELETE /marketplace/free-agents/me` — remove from marketplace

Any missing route = gap. Add the test in 5.2, implement in 5.4.

- [ ] **Step 5.2: Add spec coverage for each endpoint.**

For each endpoint, add a controller spec that hits the endpoint with a real test user and asserts the happy path + one auth failure (e.g., `PLAYER` tries to create a free-agent profile → 403).

```typescript
describe('MarketplaceController — free agent profile', () => {
  it('allows a FREE_AGENT user to create their profile', async () => {
    const user = await createTestUser({ registrationRole: 'FREE_AGENT' })
    const res = await request(app.getHttpServer())
      .post('/marketplace/free-agents')
      .set('Authorization', `Bearer ${await tokenFor(user)}`)
      .send({
        position: ['CM', 'CAM'],
        experienceYears: 5,
        location: 'Berlin',
        availableForTrials: true,
        bio: 'Box-to-box midfielder, former Regionalliga.',
      })
    expect(res.status).toBe(201)
    expect(res.body.userId).toBe(user.id)
  })

  it('forbids a PLAYER from creating a free-agent profile', async () => {
    const user = await createTestUser({ registrationRole: 'PLAYER' })
    const res = await request(app.getHttpServer())
      .post('/marketplace/free-agents')
      .set('Authorization', `Bearer ${await tokenFor(user)}`)
      .send({
        position: ['CM'],
        experienceYears: 5,
        location: 'Berlin',
        availableForTrials: true,
        bio: '...',
      })
    expect(res.status).toBe(403)
  })

  // Repeat the (allowed for FREE_AGENT, forbidden for others) pattern for each endpoint.
})
```

- [ ] **Step 5.3: Run tests.**

```bash
cd apps/api && npm test -- marketplace
```

Expected: passes for endpoints that exist and behave correctly; fails for missing endpoints or incorrect authorization.

- [ ] **Step 5.4: Fill each gap.**

For each failing test, implement the route in `marketplace.controller.ts` and the service method in `marketplace.service.ts`. Example for the `PATCH /marketplace/free-agents/me` endpoint:

```typescript
// marketplace.controller.ts
@Patch('free-agents/me')
@UseGuards(AuthGuard)
async updateMyFreeAgentProfile(
  @CurrentUser() user: AuthUser,
  @Body() body: UpdateFreeAgentProfileInput,
) {
  if (user.registrationRole !== 'FREE_AGENT') {
    throw new ForbiddenException('Only FREE_AGENT users have profiles')
  }
  return this.marketplaceService.updateFreeAgentProfile(user.id, body)
}

// marketplace.service.ts
async updateFreeAgentProfile(userId: string, input: UpdateFreeAgentProfileInput) {
  return this.prisma.freeAgentProfile.update({
    where: { userId },
    data: {
      position: input.position,
      experienceYears: input.experienceYears,
      location: input.location,
      availableForTrials: input.availableForTrials,
      bio: input.bio,
    },
  })
}
```

(Confirmed model name: `FreeAgentProfile` at `apps/api/prisma/schema.prisma:732`.)

- [ ] **Step 5.5: Ensure the Zod schema exists in shared.**

Open `packages/shared/src/schemas/marketplace.ts`. Confirm `createFreeAgentProfileSchema` and `updateFreeAgentProfileSchema` exist. If not, add:

```typescript
import { z } from 'zod'

export const createFreeAgentProfileSchema = z.object({
  position: z.array(z.string()).min(1).max(4),
  experienceYears: z.number().int().min(0).max(50),
  location: z.string().min(1).max(120),
  availableForTrials: z.boolean(),
  bio: z.string().max(500),
})

export const updateFreeAgentProfileSchema =
  createFreeAgentProfileSchema.partial()

export type CreateFreeAgentProfileInput = z.infer<
  typeof createFreeAgentProfileSchema
>
export type UpdateFreeAgentProfileInput = z.infer<
  typeof updateFreeAgentProfileSchema
>
```

Re-export from `packages/shared/src/index.ts`.

- [ ] **Step 5.6: Re-run tests.**

```bash
cd apps/api && npm test -- marketplace
```

Expected: all pass.

- [ ] **Step 5.7: Commit.**

```bash
git add apps/api/src/marketplace/ packages/shared/src/schemas/marketplace.ts packages/shared/src/index.ts
git commit -m "feat(marketplace): fill free-agent profile endpoint gaps"
```

---

## Task 6 — Shared onboarding payload schema

The onboarding flow (Phase 3a) will POST a role selection + role-specific payload. Define the schema once in shared, consumed by client and server.

**Files:**
- Modify: `packages/shared/src/schemas/auth.ts`
- Modify: `packages/shared/src/schemas/auth.spec.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 6.1: Write failing schema tests.**

Append to `packages/shared/src/schemas/auth.spec.ts`:

```typescript
import {
  completeOnboardingSchema,
  type CompleteOnboardingInput,
} from './auth'

describe('completeOnboardingSchema', () => {
  it('accepts a CLUB_ADMIN payload with club-create fields', () => {
    const valid: CompleteOnboardingInput = {
      registrationRole: 'CLUB_ADMIN',
      profile: { displayName: 'Jane Doe', dateOfBirth: '1990-01-01' },
      clubCreate: {
        name: 'FC Test',
        primaryColor: '#2563EB',
        firstTeamName: '1. Mannschaft',
      },
    }
    expect(completeOnboardingSchema.parse(valid)).toEqual(valid)
  })

  it('rejects a CLUB_ADMIN payload missing clubCreate', () => {
    expect(() =>
      completeOnboardingSchema.parse({
        registrationRole: 'CLUB_ADMIN',
        profile: { displayName: 'Jane', dateOfBirth: '1990-01-01' },
      }),
    ).toThrow()
  })

  it('accepts a FREE_AGENT payload with profile + freeAgent fields', () => {
    const valid: CompleteOnboardingInput = {
      registrationRole: 'FREE_AGENT',
      profile: { displayName: 'Sam', dateOfBirth: '1998-06-15' },
      freeAgent: {
        position: ['CM'],
        experienceYears: 4,
        location: 'Munich',
        availableForTrials: true,
        bio: 'Looking for a Kreisliga team.',
      },
    }
    expect(completeOnboardingSchema.parse(valid)).toEqual(valid)
  })

  it('accepts a PLAYER or COACH payload with an inviteCode', () => {
    expect(
      completeOnboardingSchema.parse({
        registrationRole: 'PLAYER',
        profile: { displayName: 'Leo', dateOfBirth: '2005-03-20' },
        join: { inviteCode: 'ABC123' },
      }),
    ).toBeDefined()
  })

  it('age-gates under 16s as a validation error', () => {
    expect(() =>
      completeOnboardingSchema.parse({
        registrationRole: 'PLAYER',
        profile: { displayName: 'Tiny', dateOfBirth: '2015-01-01' },
        join: { inviteCode: 'ABC123' },
      }),
    ).toThrow(/16/)
  })
})
```

- [ ] **Step 6.2: Run the failing tests.**

```bash
cd packages/shared && npm test -- auth.spec.ts
```

Expected: all new tests fail (schema not yet defined).

- [ ] **Step 6.3: Implement the schema.**

Append to `packages/shared/src/schemas/auth.ts`:

```typescript
import { z } from 'zod'

const MIN_AGE = 16

const profileSchema = z.object({
  displayName: z.string().min(1).max(80),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((d) => {
      const dob = new Date(d)
      const now = new Date()
      const age =
        now.getFullYear() -
        dob.getFullYear() -
        (now < new Date(dob.setFullYear(now.getFullYear())) ? 1 : 0)
      return age >= MIN_AGE
    }, { message: `Must be at least ${MIN_AGE} years old` }),
  photoUrl: z.string().url().optional(),
})

const clubCreateSchema = z.object({
  name: z.string().min(2).max(80),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  badgeUrl: z.string().url().optional(),
  welcomeText: z.string().max(500).optional(),
  firstTeamName: z.string().min(1).max(80),
})

const joinSchema = z.object({
  inviteCode: z.string().min(4).max(32).optional(),
  clubId: z.string().cuid().optional(),
}).refine(
  (v) => Boolean(v.inviteCode) !== Boolean(v.clubId),
  { message: 'Provide either inviteCode or clubId, not both' },
)

const freeAgentSchema = z.object({
  position: z.array(z.string()).min(1).max(4),
  experienceYears: z.number().int().min(0).max(50),
  location: z.string().min(1).max(120),
  availableForTrials: z.boolean(),
  bio: z.string().max(500),
})

const parentLinkSchema = z.object({
  approvalInviteCode: z.string().min(4).max(32).optional(),
  childEmail: z.string().email().optional(),
}).refine(
  (v) => Boolean(v.approvalInviteCode) || Boolean(v.childEmail),
  { message: 'Parents must provide an approval code or the child email' },
)

export const completeOnboardingSchema = z.discriminatedUnion(
  'registrationRole',
  [
    z.object({
      registrationRole: z.literal('CLUB_ADMIN'),
      profile: profileSchema,
      clubCreate: clubCreateSchema,
    }),
    z.object({
      registrationRole: z.literal('COACH'),
      profile: profileSchema,
      join: joinSchema,
    }),
    z.object({
      registrationRole: z.literal('PLAYER'),
      profile: profileSchema,
      join: joinSchema,
    }),
    z.object({
      registrationRole: z.literal('PARENT'),
      profile: profileSchema,
      parentLink: parentLinkSchema,
    }),
    z.object({
      registrationRole: z.literal('FREE_AGENT'),
      profile: profileSchema,
      freeAgent: freeAgentSchema,
    }),
  ],
)

export type CompleteOnboardingInput = z.infer<typeof completeOnboardingSchema>
```

- [ ] **Step 6.4: Re-export from the package entry.**

In `packages/shared/src/index.ts`, add:

```typescript
export {
  completeOnboardingSchema,
  type CompleteOnboardingInput,
} from './schemas/auth'
```

- [ ] **Step 6.5: Run tests and confirm pass.**

```bash
cd packages/shared && npm test -- auth.spec.ts
```

Expected: all pass.

- [ ] **Step 6.6: Commit.**

```bash
git add packages/shared/src/schemas/auth.ts packages/shared/src/schemas/auth.spec.ts packages/shared/src/index.ts
git commit -m "feat(shared): add completeOnboardingSchema with role-discriminated payloads"
```

---

## Task 7 — Wire the completeOnboardingSchema into the API

**Files:**
- Modify: `apps/api/src/users/users.controller.ts`
- Modify: `apps/api/src/users/users.service.ts`
- Modify: `apps/api/src/users/users.service.spec.ts`

- [ ] **Step 7.1: Write failing controller spec.**

Append to `apps/api/src/users/users.service.spec.ts`:

```typescript
describe('POST /me/onboarding', () => {
  it('completes a CLUB_ADMIN onboarding end-to-end', async () => {
    const user = await createTestUser({
      registrationRole: 'CLUB_ADMIN',
      displayName: null,
      dateOfBirth: null,
    })
    const res = await request(app.getHttpServer())
      .post('/me/onboarding')
      .set('Authorization', `Bearer ${await tokenFor(user)}`)
      .send({
        registrationRole: 'CLUB_ADMIN',
        profile: { displayName: 'Jane', dateOfBirth: '1990-01-01' },
        clubCreate: {
          name: 'FC Wire',
          primaryColor: '#2563EB',
          firstTeamName: '1. Mannschaft',
        },
      })

    expect(res.status).toBe(201)
    expect(res.body.clubId).toBeDefined()

    const updated = await prisma.user.findUnique({ where: { id: user.id } })
    expect(updated?.displayName).toBe('Jane')
  })

  it('rejects mismatched role in body vs. user record', async () => {
    const user = await createTestUser({ registrationRole: 'PLAYER' })
    const res = await request(app.getHttpServer())
      .post('/me/onboarding')
      .set('Authorization', `Bearer ${await tokenFor(user)}`)
      .send({
        registrationRole: 'CLUB_ADMIN',
        profile: { displayName: 'Jane', dateOfBirth: '1990-01-01' },
        clubCreate: {
          name: 'FC Mismatch',
          primaryColor: '#2563EB',
          firstTeamName: '1. Mannschaft',
        },
      })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 7.2: Run, confirm failure.**

```bash
cd apps/api && npm test -- users.service.spec.ts -t 'onboarding'
```

Expected: fail (endpoint doesn't exist).

- [ ] **Step 7.3: Implement controller + service.**

In `apps/api/src/users/users.controller.ts`:

```typescript
@Post('me/onboarding')
@UseGuards(AuthGuard)
@UsePipes(new ZodValidationPipe(completeOnboardingSchema))
async completeOnboarding(
  @CurrentUser() authUser: AuthUser,
  @Body() body: CompleteOnboardingInput,
) {
  return this.usersService.completeOnboarding(authUser.id, body)
}
```

In `apps/api/src/users/users.service.ts`:

```typescript
async completeOnboarding(userId: string, input: CompleteOnboardingInput) {
  const user = await this.prisma.user.findUnique({
    where: { id: userId },
    select: { registrationRole: true },
  })
  if (!user) throw new NotFoundException('User not found')
  if (user.registrationRole !== input.registrationRole) {
    throw new BadRequestException(
      'registrationRole in payload must match the user record',
    )
  }

  await this.prisma.user.update({
    where: { id: userId },
    data: {
      displayName: input.profile.displayName,
      dateOfBirth: new Date(input.profile.dateOfBirth),
      photoUrl: input.profile.photoUrl ?? null,
    },
  })

  switch (input.registrationRole) {
    case 'CLUB_ADMIN': {
      const { clubId, teamId } = await this.clubsService.createClubWithTeam(
        userId,
        {
          name: input.clubCreate.name,
          primaryColor: input.clubCreate.primaryColor,
          badgeUrl: input.clubCreate.badgeUrl,
        },
        { name: input.clubCreate.firstTeamName },
      )
      return { clubId, teamId }
    }
    case 'COACH':
    case 'PLAYER': {
      if (input.join.inviteCode) {
        return this.invitesService.redeem(input.join.inviteCode, userId, {})
      }
      return this.clubsService.requestJoin(input.join.clubId!, userId)
    }
    case 'FREE_AGENT': {
      return this.marketplaceService.createFreeAgentProfile(
        userId,
        input.freeAgent,
      )
    }
    case 'PARENT': {
      if (input.parentLink.approvalInviteCode) {
        return this.invitesService.redeem(
          input.parentLink.approvalInviteCode,
          userId,
          {},
        )
      }
      return this.invitesService.requestParentApproval(
        userId,
        input.parentLink.childEmail!,
      )
    }
  }
}
```

Inject the dependencies at constructor: `ClubsService`, `InvitesService`, `MarketplaceService`.

- [ ] **Step 7.4: Run tests and confirm pass.**

```bash
cd apps/api && npm test -- users.service.spec.ts
```

Expected: all pass.

- [ ] **Step 7.5: Commit.**

```bash
git add apps/api/src/users/
git commit -m "feat(users): POST /me/onboarding with role-dispatched completion"
```

---

## Task 8 — PR open + coverage gate

- [ ] **Step 8.1: Run full test suite.**

```bash
cd apps/api && npm test
```

Expected: all pass. Coverage report ≥80% on touched files.

- [ ] **Step 8.2: Run lint + typecheck.**

```bash
cd /Users/yemi/anstoss && npm run lint && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8.3: Open PR.**

```bash
gh pr create --base main --title "Phase 2: Backend foundation for role-aware onboarding" --body "$(cat <<'EOF'
## Summary
- Traced every registration role end-to-end (`docs/revamp/role-flow.md`)
- Locked club-create + invite-redemption behavior with regression tests
- Added `completeOnboardingSchema` with role-discriminated payloads in `@anstoss/shared`
- Wired `POST /me/onboarding` to dispatch role-specific completion (club-create / join / free-agent profile / parent link)
- Filled free-agent profile endpoint gaps in marketplace module

## Test plan
- [ ] `npm test` in `apps/api` — all green
- [ ] `npm test` in `packages/shared` — all green
- [ ] Manual: hit `POST /me/onboarding` with each of the 5 `RegistrationRole` payloads; verify side effects in DB

See `docs/superpowers/specs/2026-04-20-anstoss-revamp-design.md` and `docs/superpowers/plans/2026-04-20-phase-2-backend.md` for context.
EOF
)"
```

---

## Self-review checklist (run after plan writing)

- [x] Every task has files + steps + exact code.
- [x] No `TBD` / `TODO` / "handle errors" placeholders.
- [x] Type consistency: `CompleteOnboardingInput` used identically across tasks.
- [x] Spec coverage: each bullet of § 3 of the spec maps to one or more tasks above.
- [x] Task 1 (trace) gates the later tasks — trace output can skip or adjust Tasks 3-5 if gaps aren't there.
