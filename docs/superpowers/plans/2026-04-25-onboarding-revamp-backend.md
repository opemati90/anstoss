# Onboarding Revamp — Backend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the backend primitives that the new mobile onboarding flow consumes: per-team join codes, admin-built roster slots, parent-managed sub-profile users, and the API endpoints that read/write them.

**Architecture:** All work is server-side in `apps/api` (NestJS + Prisma + Neon Postgres). Each task is a single Prisma migration or one HTTP endpoint behind `ClerkAuthGuard`, with tenant-scoping enforced via the existing `Membership` lookup pattern in `TeamsService`. `JoinRequest` already exists in the schema and has a controller — we leave it alone. We add `Team.joinCode`, a new `RosterSlot` model, and we make `User.clerkId` + `User.email` nullable to host parent-managed sub-profiles.

**Tech Stack:** NestJS 10, Prisma 5, Neon Postgres + PgBouncer, Zod (via `@anstoss/shared`), Jest, `ClerkAuthGuard`, `RateLimit` decorator (`'write'` / `'read'`).

**Spec:** `docs/superpowers/specs/2026-04-25-onboarding-revamp-design.md`

---

## File Structure

**Files created:**
- `apps/api/prisma/migrations/<ts>_add_team_join_code/migration.sql`
- `apps/api/prisma/migrations/<ts>_add_roster_slot/migration.sql`
- `apps/api/prisma/migrations/<ts>_user_clerk_email_optional/migration.sql`
- `apps/api/src/teams/team-join-code.util.ts` — code generator (5-char alphanumeric, no ambiguous chars)
- `apps/api/src/teams/team-join-code.util.spec.ts`
- `apps/api/src/teams/roster-slots.service.ts` — slot CRUD + claim
- `apps/api/src/teams/roster-slots.service.spec.ts`
- `apps/api/src/teams/roster-slots.controller.ts` — slot endpoints
- `apps/api/src/users/managed-sub-profiles.service.ts` — create-managed-user
- `apps/api/src/users/managed-sub-profiles.service.spec.ts`
- `apps/api/src/users/managed-sub-profiles.controller.ts`
- `packages/shared/src/schemas/roster-slot.schema.ts` — Zod input schemas
- `packages/shared/src/schemas/managed-sub-profile.schema.ts`

**Files modified:**
- `apps/api/prisma/schema.prisma` — add `Team.joinCode`, `RosterSlot` model, relax `User.clerkId` + `User.email` nullability
- `apps/api/src/teams/teams.module.ts` — register `RosterSlotsService` + controller
- `apps/api/src/teams/teams.service.ts` — `getTeamByCode`, `regenerateJoinCode`
- `apps/api/src/teams/teams.controller.ts` — `GET /teams/by-code/:code`, `POST /teams/:teamId/join-code`
- `apps/api/src/teams/teams.service.spec.ts` — coverage for the two new methods
- `apps/api/src/users/users.module.ts` — register `ManagedSubProfilesService` + controller
- `packages/shared/src/index.ts` — re-export new schemas

---

### Task 1: `Team.joinCode` migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma:276-308`
- Create: `apps/api/prisma/migrations/<ts>_add_team_join_code/migration.sql`

- [ ] **Step 1: Add the field to the Prisma schema**

In `apps/api/prisma/schema.prisma`, inside `model Team {`, add `joinCode` between `seasonStart` and `createdAt`:

```prisma
  joinCode    String?  @unique
```

And add an index right above `@@unique([groupId, displayName])`:

```prisma
  @@index([joinCode])
```

- [ ] **Step 2: Generate the migration**

Run: `cd apps/api && npx prisma migrate dev --name add_team_join_code --create-only`
Expected: a new folder `apps/api/prisma/migrations/<timestamp>_add_team_join_code/` with `migration.sql` containing `ALTER TABLE "Team" ADD COLUMN "joinCode" TEXT`, plus the unique index.

- [ ] **Step 3: Apply the migration locally**

Run: `cd apps/api && npx prisma migrate dev`
Expected: `Database is now in sync with your schema.` and Prisma Client regenerated.

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(api): add Team.joinCode column + unique index"
```

---

### Task 2: Join-code generator utility

**Files:**
- Create: `apps/api/src/teams/team-join-code.util.ts`
- Test: `apps/api/src/teams/team-join-code.util.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/teams/team-join-code.util.spec.ts`:

```ts
import { generateJoinCode, JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH } from './team-join-code.util'

describe('generateJoinCode', () => {
  it('returns a 5-char string', () => {
    expect(generateJoinCode()).toHaveLength(JOIN_CODE_LENGTH)
  })

  it('only uses the unambiguous alphabet (no 0, O, 1, I, L)', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateJoinCode()
      for (const ch of code) {
        expect(JOIN_CODE_ALPHABET).toContain(ch)
      }
    }
  })

  it('produces different codes on subsequent calls', () => {
    const codes = new Set<string>()
    for (let i = 0; i < 100; i++) codes.add(generateJoinCode())
    expect(codes.size).toBeGreaterThan(95)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/teams/team-join-code.util.spec.ts`
Expected: FAIL with `Cannot find module './team-join-code.util'`.

- [ ] **Step 3: Implement the util**

Create `apps/api/src/teams/team-join-code.util.ts`:

```ts
import { randomInt } from 'node:crypto'

export const JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const JOIN_CODE_LENGTH = 5

export function generateJoinCode(): string {
  let out = ''
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
    out += JOIN_CODE_ALPHABET[randomInt(0, JOIN_CODE_ALPHABET.length)]
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest src/teams/team-join-code.util.spec.ts`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/teams/team-join-code.util.ts apps/api/src/teams/team-join-code.util.spec.ts
git commit -m "feat(api): add join-code generator (5-char unambiguous)"
```

---

### Task 3: `TeamsService.regenerateJoinCode` + backfill on access

**Files:**
- Modify: `apps/api/src/teams/teams.service.ts` (add method near other team-mutation methods)
- Modify: `apps/api/src/teams/teams.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Append to `apps/api/src/teams/teams.service.spec.ts` (inside the existing top-level `describe('TeamsService', ...)`):

```ts
  describe('regenerateJoinCode', () => {
    it('sets a unique 5-char joinCode on the team', async () => {
      const { team, ownerId } = await seedClubWithTeam()
      const result = await service.regenerateJoinCode(team.clubId, team.id, ownerId)
      expect(result.joinCode).toMatch(/^[A-Z2-9]{5}$/)
    })

    it('rejects callers who are not OWNER/ADMIN', async () => {
      const { team } = await seedClubWithTeam()
      const stranger = await seedUser()
      await expect(
        service.regenerateJoinCode(team.clubId, team.id, stranger.id),
      ).rejects.toThrow(/access/i)
    })

    it('retries on collision and eventually succeeds', async () => {
      const { team, ownerId } = await seedClubWithTeam()
      // pre-seed another team with the same code we'll force first
      const collision = await seedClubWithTeam({ joinCode: 'AAAAA' })
      const spy = jest.spyOn(joinCodeUtil, 'generateJoinCode')
      spy.mockReturnValueOnce('AAAAA').mockReturnValueOnce('BBBBB')
      const result = await service.regenerateJoinCode(team.clubId, team.id, ownerId)
      expect(result.joinCode).toBe('BBBBB')
      spy.mockRestore()
    })
  })
```

(The existing spec file already has `seedClubWithTeam` and `seedUser` helpers; if not, model them on the patterns at the top of `apps/api/src/teams/teams.service.spec.ts`. Add the import: `import * as joinCodeUtil from './team-join-code.util'`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/teams/teams.service.spec.ts -t regenerateJoinCode`
Expected: FAIL with `service.regenerateJoinCode is not a function`.

- [ ] **Step 3: Implement the method**

In `apps/api/src/teams/teams.service.ts`, add the import at the top:

```ts
import { generateJoinCode } from './team-join-code.util'
```

And add the method inside the `TeamsService` class (place it next to other `team`-scoped mutations):

```ts
  async regenerateJoinCode(clubId: string, teamId: string, userId: string) {
    const membership = await this.getMembership(userId, clubId)
    if (!isClubManager(membership.role)) {
      throw new TeamAccessDeniedError('regenerate-join-code')
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateJoinCode()
      try {
        return await this.prisma.team.update({
          where: { id: teamId, clubId },
          data: { joinCode: code },
          select: { id: true, joinCode: true },
        })
      } catch (err: unknown) {
        if (
          err &&
          typeof err === 'object' &&
          'code' in err &&
          (err as { code: string }).code === 'P2002'
        ) {
          continue
        }
        throw err
      }
    }
    throw new Error('Could not allocate unique join code after 5 attempts')
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest src/teams/teams.service.spec.ts -t regenerateJoinCode`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/teams/teams.service.ts apps/api/src/teams/teams.service.spec.ts
git commit -m "feat(api): regenerate Team.joinCode (OWNER/ADMIN only, retry on collision)"
```

---

### Task 4: `TeamsService.getTeamByCode` (public lookup for join flow)

**Files:**
- Modify: `apps/api/src/teams/teams.service.ts`
- Modify: `apps/api/src/teams/teams.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Append to `teams.service.spec.ts`:

```ts
  describe('getTeamByCode', () => {
    it('returns the team and its club for a valid code', async () => {
      const { team, club, ownerId } = await seedClubWithTeam()
      await service.regenerateJoinCode(club.id, team.id, ownerId)
      const refreshed = await prisma.team.findUnique({ where: { id: team.id } })
      const result = await service.getTeamByCode(refreshed!.joinCode!)
      expect(result.team.id).toBe(team.id)
      expect(result.club.id).toBe(club.id)
    })

    it('throws NotFoundException for a missing code', async () => {
      await expect(service.getTeamByCode('ZZZZZ')).rejects.toThrow(NotFoundException)
    })

    it('uppercases input before lookup', async () => {
      const { team, club, ownerId } = await seedClubWithTeam()
      await service.regenerateJoinCode(club.id, team.id, ownerId)
      const refreshed = await prisma.team.findUnique({ where: { id: team.id } })
      const lower = refreshed!.joinCode!.toLowerCase()
      const result = await service.getTeamByCode(lower)
      expect(result.team.id).toBe(team.id)
    })
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/teams/teams.service.spec.ts -t getTeamByCode`
Expected: FAIL with `service.getTeamByCode is not a function`.

- [ ] **Step 3: Implement the method**

In `apps/api/src/teams/teams.service.ts`, add inside the class:

```ts
  async getTeamByCode(rawCode: string) {
    const code = rawCode.trim().toUpperCase()
    const team = await this.prisma.team.findUnique({
      where: { joinCode: code },
      include: { club: { select: { id: true, name: true, badgeUrl: true, primaryColor: true } } },
    })
    if (!team) throw new NotFoundException('Team not found for this code')
    return { team: { id: team.id, name: team.name, displayName: team.displayName, clubId: team.clubId }, club: team.club }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest src/teams/teams.service.spec.ts -t getTeamByCode`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/teams/teams.service.ts apps/api/src/teams/teams.service.spec.ts
git commit -m "feat(api): add getTeamByCode lookup for join flow"
```

---

### Task 5: Wire join-code endpoints in `TeamsController`

**Files:**
- Modify: `apps/api/src/teams/teams.controller.ts`

- [ ] **Step 1: Write the failing test**

Create or extend `apps/api/src/teams/teams.controller.spec.ts` (follow the existing controller-test pattern in the codebase — usually a thin test that wires the controller to a mocked service and asserts the call):

```ts
import { Test } from '@nestjs/testing'
import { TeamsController } from './teams.controller'
import { TeamsService } from './teams.service'

describe('TeamsController join-code endpoints', () => {
  let controller: TeamsController
  const service = {
    regenerateJoinCode: jest.fn(),
    getTeamByCode: jest.fn(),
  }

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TeamsController],
      providers: [{ provide: TeamsService, useValue: service }],
    })
      .overrideGuard(require('../auth/clerk.guard').ClerkAuthGuard).useValue({ canActivate: () => true })
      .compile()
    controller = moduleRef.get(TeamsController)
    jest.clearAllMocks()
  })

  it('POST /clubs/:clubId/teams/:teamId/join-code calls regenerateJoinCode', async () => {
    service.regenerateJoinCode.mockResolvedValue({ id: 't1', joinCode: 'ABCDE' })
    const res = await controller.regenerateJoinCode('c1', 't1', { id: 'u1' } as any)
    expect(service.regenerateJoinCode).toHaveBeenCalledWith('c1', 't1', 'u1')
    expect(res.joinCode).toBe('ABCDE')
  })

  it('GET /teams/by-code/:code calls getTeamByCode', async () => {
    service.getTeamByCode.mockResolvedValue({ team: { id: 't1' }, club: { id: 'c1' } })
    const res = await controller.getTeamByCode('ABCDE')
    expect(service.getTeamByCode).toHaveBeenCalledWith('ABCDE')
    expect(res.team.id).toBe('t1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/teams/teams.controller.spec.ts`
Expected: FAIL with `controller.regenerateJoinCode is not a function`.

- [ ] **Step 3: Add the controller methods**

In `apps/api/src/teams/teams.controller.ts`, inside the `TeamsController` class, add:

```ts
  @Post('teams/:teamId/join-code')
  @RateLimit('write')
  async regenerateJoinCode(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.teamsService.regenerateJoinCode(clubId, teamId, user.id)
  }
```

The `getTeamByCode` endpoint lives outside the `clubs/:clubId` prefix, so add a new controller class at the bottom of the same file:

```ts
@Controller('teams')
@UseGuards(ClerkAuthGuard)
export class TeamLookupController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get('by-code/:code')
  @RateLimit('read')
  async getTeamByCode(@Param('code') code: string) {
    return this.teamsService.getTeamByCode(code)
  }
}
```

Then in `apps/api/src/teams/teams.module.ts`, add `TeamLookupController` to the `controllers` array.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest src/teams/teams.controller.spec.ts`
Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/teams/teams.controller.ts apps/api/src/teams/teams.controller.spec.ts apps/api/src/teams/teams.module.ts
git commit -m "feat(api): expose POST /teams/:id/join-code and GET /teams/by-code/:code"
```

---

### Task 6: `RosterSlot` Prisma model + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<ts>_add_roster_slot/migration.sql`

- [ ] **Step 1: Add the model**

In `apps/api/prisma/schema.prisma`, append a new model below `JoinRequest` (around line 1078):

```prisma
model RosterSlot {
  id             String         @id @default(cuid())
  teamId         String
  fullName       String
  dateOfBirth    DateTime?
  position       PlayerPosition?
  jerseyNumber   Int?
  claimedByUserId String?       @unique
  claimedAt      DateTime?
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt

  team        Team @relation(fields: [teamId], references: [id], onDelete: Cascade)
  claimedBy   User? @relation(fields: [claimedByUserId], references: [id])

  @@index([teamId])
  @@index([teamId, claimedByUserId])
}
```

Then add the back-relation on `Team` (in `model Team {`, near the other relations):

```prisma
  rosterSlots       RosterSlot[]
```

And on `User`:

```prisma
  claimedRosterSlot RosterSlot?
```

- [ ] **Step 2: Generate the migration**

Run: `cd apps/api && npx prisma migrate dev --name add_roster_slot --create-only`
Expected: new migration folder containing the `CREATE TABLE "RosterSlot"` SQL.

- [ ] **Step 3: Apply locally**

Run: `cd apps/api && npx prisma migrate dev`
Expected: `Database is now in sync with your schema.`

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(api): add RosterSlot model (admin pre-built rosters, claimable by users)"
```

---

### Task 7: `RosterSlotsService.bulkCreate` + `list`

**Files:**
- Create: `apps/api/src/teams/roster-slots.service.ts`
- Test: `apps/api/src/teams/roster-slots.service.spec.ts`
- Create: `packages/shared/src/schemas/roster-slot.schema.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Add the Zod schema**

Create `packages/shared/src/schemas/roster-slot.schema.ts`:

```ts
import { z } from 'zod'
import { playerPositionSchema } from './player-position.schema'

export const rosterSlotInputSchema = z.object({
  fullName: z.string().min(1).max(80),
  dateOfBirth: z.string().datetime().optional(),
  position: playerPositionSchema.optional(),
  jerseyNumber: z.number().int().min(1).max(99).optional(),
})
export type RosterSlotInput = z.infer<typeof rosterSlotInputSchema>

export const bulkRosterSlotsInputSchema = z.object({
  slots: z.array(rosterSlotInputSchema).min(1).max(40),
})
export type BulkRosterSlotsInput = z.infer<typeof bulkRosterSlotsInputSchema>
```

(If `player-position.schema.ts` does not exist, create one that mirrors the `PlayerPosition` Prisma enum: `export const playerPositionSchema = z.enum(['GK', 'DEF', 'MID', 'FWD'])`.)

In `packages/shared/src/index.ts`, add: `export * from './schemas/roster-slot.schema'`.

Run: `cd packages/shared && npm run build`
Expected: build succeeds, `dist/` updated.

- [ ] **Step 2: Write the failing service test**

Create `apps/api/src/teams/roster-slots.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing'
import { PrismaService } from '../prisma/prisma.service'
import { TeamAccessDeniedError } from '@anstoss/shared'
import { RosterSlotsService } from './roster-slots.service'

describe('RosterSlotsService', () => {
  let service: RosterSlotsService
  let prisma: PrismaService

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      providers: [RosterSlotsService, PrismaService],
    }).compile()
    service = mod.get(RosterSlotsService)
    prisma = mod.get(PrismaService)
  })

  // assume seedClubWithTeam, seedUser exist as they do in teams.service.spec.ts

  it('admin can bulk-create slots', async () => {
    const { team, club, ownerId } = await seedClubWithTeam()
    const slots = await service.bulkCreate(club.id, team.id, ownerId, {
      slots: [
        { fullName: 'Lukas B.', position: 'MID', jerseyNumber: 7 },
        { fullName: 'Yemi A.', position: 'FWD', jerseyNumber: 9 },
      ],
    })
    expect(slots).toHaveLength(2)
    expect(slots[0].fullName).toBe('Lukas B.')
  })

  it('non-admin caller is rejected', async () => {
    const { team, club } = await seedClubWithTeam()
    const stranger = await seedUser()
    await expect(
      service.bulkCreate(club.id, team.id, stranger.id, { slots: [{ fullName: 'X' }] }),
    ).rejects.toThrow(TeamAccessDeniedError)
  })

  it('list returns all slots for the team', async () => {
    const { team, club, ownerId } = await seedClubWithTeam()
    await service.bulkCreate(club.id, team.id, ownerId, {
      slots: [{ fullName: 'A' }, { fullName: 'B' }],
    })
    const found = await service.list(club.id, team.id, ownerId)
    expect(found).toHaveLength(2)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/api && npx jest src/teams/roster-slots.service.spec.ts`
Expected: FAIL with `Cannot find module './roster-slots.service'`.

- [ ] **Step 4: Implement the service**

Create `apps/api/src/teams/roster-slots.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common'
import { TeamAccessDeniedError, type BulkRosterSlotsInput } from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'

const MANAGER_ROLES = new Set(['OWNER', 'ADMIN'])

@Injectable()
export class RosterSlotsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertManager(userId: string, clubId: string) {
    const m = await this.prisma.membership.findFirst({ where: { userId, clubId } })
    if (!m || !MANAGER_ROLES.has(m.role)) {
      throw new TeamAccessDeniedError('roster-slots')
    }
  }

  async bulkCreate(clubId: string, teamId: string, userId: string, body: BulkRosterSlotsInput) {
    await this.assertManager(userId, clubId)
    const team = await this.prisma.team.findFirst({ where: { id: teamId, clubId } })
    if (!team) throw new NotFoundException('Team not found in this club')
    return this.prisma.$transaction(
      body.slots.map((s) =>
        this.prisma.rosterSlot.create({
          data: {
            teamId,
            fullName: s.fullName,
            dateOfBirth: s.dateOfBirth ? new Date(s.dateOfBirth) : null,
            position: s.position ?? null,
            jerseyNumber: s.jerseyNumber ?? null,
          },
        }),
      ),
    )
  }

  async list(clubId: string, teamId: string, userId: string) {
    const m = await this.prisma.membership.findFirst({ where: { userId, clubId } })
    if (!m) throw new TeamAccessDeniedError('roster-slots-list')
    return this.prisma.rosterSlot.findMany({
      where: { teamId, team: { clubId } },
      orderBy: [{ jerseyNumber: 'asc' }, { fullName: 'asc' }],
    })
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/api && npx jest src/teams/roster-slots.service.spec.ts`
Expected: 3 passing.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/teams/roster-slots.service.ts apps/api/src/teams/roster-slots.service.spec.ts packages/shared/src/schemas/roster-slot.schema.ts packages/shared/src/index.ts
git commit -m "feat(api): RosterSlotsService with bulk upsert and list (manager-only)"
```

---

### Task 8: `RosterSlotsService.claim` (race-safe)

**Files:**
- Modify: `apps/api/src/teams/roster-slots.service.ts`
- Modify: `apps/api/src/teams/roster-slots.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Append to `roster-slots.service.spec.ts`:

```ts
  describe('claim', () => {
    it('marks the slot claimed by the user', async () => {
      const { team, club, ownerId } = await seedClubWithTeam()
      const [slot] = await service.bulkCreate(club.id, team.id, ownerId, {
        slots: [{ fullName: 'Yemi A.' }],
      })
      const claimer = await seedUser()
      const result = await service.claim(team.id, slot.id, claimer.id)
      expect(result.claimedByUserId).toBe(claimer.id)
      expect(result.claimedAt).toBeInstanceOf(Date)
    })

    it('rejects claim on an already-claimed slot', async () => {
      const { team, club, ownerId } = await seedClubWithTeam()
      const [slot] = await service.bulkCreate(club.id, team.id, ownerId, {
        slots: [{ fullName: 'Y' }],
      })
      const u1 = await seedUser()
      const u2 = await seedUser()
      await service.claim(team.id, slot.id, u1.id)
      await expect(service.claim(team.id, slot.id, u2.id)).rejects.toThrow(/already claimed/i)
    })

    it('rejects when user already claimed a different slot', async () => {
      const { team, club, ownerId } = await seedClubWithTeam()
      const [a, b] = await service.bulkCreate(club.id, team.id, ownerId, {
        slots: [{ fullName: 'A' }, { fullName: 'B' }],
      })
      const u = await seedUser()
      await service.claim(team.id, a.id, u.id)
      await expect(service.claim(team.id, b.id, u.id)).rejects.toThrow(/already on the roster/i)
    })
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/teams/roster-slots.service.spec.ts -t claim`
Expected: FAIL with `service.claim is not a function`.

- [ ] **Step 3: Implement the method**

In `apps/api/src/teams/roster-slots.service.ts`, add to the class:

```ts
  async claim(teamId: string, slotId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.rosterSlot.findFirst({ where: { teamId, claimedByUserId: userId } })
      if (existing) throw new Error('You are already on the roster for this team')
      const slot = await tx.rosterSlot.findUnique({ where: { id: slotId } })
      if (!slot || slot.teamId !== teamId) throw new NotFoundException('Slot not found')
      if (slot.claimedByUserId) throw new Error('Slot already claimed')
      return tx.rosterSlot.update({
        where: { id: slotId, claimedByUserId: null },
        data: { claimedByUserId: userId, claimedAt: new Date() },
      })
    })
  }
```

(Note: `where: { id: slotId, claimedByUserId: null }` would fail at runtime in older Prisma versions where compound `where` on update isn't allowed; if the local Prisma errors, drop the `claimedByUserId: null` from the `where` and rely on the explicit check above — the transaction guarantees correctness.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest src/teams/roster-slots.service.spec.ts -t claim`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/teams/roster-slots.service.ts apps/api/src/teams/roster-slots.service.spec.ts
git commit -m "feat(api): roster-slot claim (transactional, race-safe)"
```

---

### Task 9: `RosterSlotsController` endpoints

**Files:**
- Create: `apps/api/src/teams/roster-slots.controller.ts`
- Modify: `apps/api/src/teams/teams.module.ts`
- Test: `apps/api/src/teams/roster-slots.controller.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/teams/roster-slots.controller.spec.ts`:

```ts
import { Test } from '@nestjs/testing'
import { RosterSlotsController } from './roster-slots.controller'
import { RosterSlotsService } from './roster-slots.service'
import { ClerkAuthGuard } from '../auth/clerk.guard'

describe('RosterSlotsController', () => {
  let controller: RosterSlotsController
  const service = { bulkCreate: jest.fn(), list: jest.fn(), claim: jest.fn() }

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      controllers: [RosterSlotsController],
      providers: [{ provide: RosterSlotsService, useValue: service }],
    })
      .overrideGuard(ClerkAuthGuard).useValue({ canActivate: () => true })
      .compile()
    controller = mod.get(RosterSlotsController)
    jest.clearAllMocks()
  })

  it('POST roster-slots calls bulkCreate with parsed body', async () => {
    service.bulkCreate.mockResolvedValue([{ id: 's1' }])
    const res = await controller.bulkCreate('c1', 't1', { id: 'u1' } as any, {
      slots: [{ fullName: 'X' }],
    })
    expect(service.bulkCreate).toHaveBeenCalledWith('c1', 't1', 'u1', { slots: [{ fullName: 'X' }] })
    expect(res).toHaveLength(1)
  })

  it('GET roster-slots calls list', async () => {
    service.list.mockResolvedValue([])
    await controller.list('c1', 't1', { id: 'u1' } as any)
    expect(service.list).toHaveBeenCalledWith('c1', 't1', 'u1')
  })

  it('POST claim calls claim', async () => {
    service.claim.mockResolvedValue({ id: 's1', claimedByUserId: 'u1' })
    const res = await controller.claim('c1', 't1', 's1', { id: 'u1' } as any)
    expect(service.claim).toHaveBeenCalledWith('t1', 's1', 'u1')
    expect(res.claimedByUserId).toBe('u1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/teams/roster-slots.controller.spec.ts`
Expected: FAIL with `Cannot find module './roster-slots.controller'`.

- [ ] **Step 3: Implement the controller**

Create `apps/api/src/teams/roster-slots.controller.ts`:

```ts
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { bulkRosterSlotsInputSchema } from '@anstoss/shared'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { CurrentUser } from '../auth/user.decorator'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { RosterSlotsService } from './roster-slots.service'

@Controller('clubs/:clubId/teams/:teamId/roster-slots')
@UseGuards(ClerkAuthGuard)
export class RosterSlotsController {
  constructor(private readonly service: RosterSlotsService) {}

  @Get()
  @RateLimit('read')
  list(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.list(clubId, teamId, user.id)
  }

  @Post()
  @RateLimit('write')
  bulkCreate(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @CurrentUser() user: { id: string },
    @Body() body: unknown,
  ) {
    const parsed = bulkRosterSlotsInputSchema.parse(body)
    return this.service.bulkCreate(clubId, teamId, user.id, parsed)
  }

  @Post(':slotId/claim')
  @RateLimit('write')
  claim(
    @Param('clubId') _clubId: string,
    @Param('teamId') teamId: string,
    @Param('slotId') slotId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.claim(teamId, slotId, user.id)
  }
}
```

In `apps/api/src/teams/teams.module.ts`, add `RosterSlotsService` to `providers` and `RosterSlotsController` to `controllers`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest src/teams/roster-slots.controller.spec.ts`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/teams/roster-slots.controller.ts apps/api/src/teams/roster-slots.controller.spec.ts apps/api/src/teams/teams.module.ts
git commit -m "feat(api): expose roster-slots endpoints (list, bulk upsert, claim)"
```

---

### Task 10: Make `User.clerkId` and `User.email` nullable for managed sub-profiles

**Files:**
- Modify: `apps/api/prisma/schema.prisma:24-68`
- Create: `apps/api/prisma/migrations/<ts>_user_clerk_email_optional/migration.sql`

- [ ] **Step 1: Update the schema**

In `apps/api/prisma/schema.prisma`, change `model User`:

```prisma
  clerkId     String?  @unique
  email       String?  @unique
  managedById String?
  managedBy   User?    @relation("ManagedSubProfile", fields: [managedById], references: [id])
  managedSubProfiles User[] @relation("ManagedSubProfile")
```

Place `managedById` and the relations after `email` and before `name` so the diff stays compact.

- [ ] **Step 2: Generate the migration**

Run: `cd apps/api && npx prisma migrate dev --name user_clerk_email_optional --create-only`
Expected: a migration that drops `NOT NULL` from `clerkId` and `email`, adds `managedById`, and adds the self-relation FK.

- [ ] **Step 3: Apply locally**

Run: `cd apps/api && npx prisma migrate dev`
Expected: `Database is now in sync with your schema.`

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(api): allow nullable clerkId/email + managedBy self-relation on User"
```

---

### Task 11: `ManagedSubProfilesService.create` (parent registers under-16 kid)

**Files:**
- Create: `packages/shared/src/schemas/managed-sub-profile.schema.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `apps/api/src/users/managed-sub-profiles.service.ts`
- Test: `apps/api/src/users/managed-sub-profiles.service.spec.ts`

- [ ] **Step 1: Add the Zod schema**

Create `packages/shared/src/schemas/managed-sub-profile.schema.ts`:

```ts
import { z } from 'zod'

export const createManagedSubProfileSchema = z.object({
  fullName: z.string().min(1).max(80),
  dateOfBirth: z.string().datetime(),
  teamId: z.string().min(1),
  rosterSlotId: z.string().min(1),
})
export type CreateManagedSubProfileInput = z.infer<typeof createManagedSubProfileSchema>
```

In `packages/shared/src/index.ts` add: `export * from './schemas/managed-sub-profile.schema'`.

Run: `cd packages/shared && npm run build`
Expected: build succeeds.

- [ ] **Step 2: Write the failing service test**

Create `apps/api/src/users/managed-sub-profiles.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing'
import { PrismaService } from '../prisma/prisma.service'
import { ManagedSubProfilesService } from './managed-sub-profiles.service'

describe('ManagedSubProfilesService', () => {
  let service: ManagedSubProfilesService
  let prisma: PrismaService

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      providers: [ManagedSubProfilesService, PrismaService],
    }).compile()
    service = mod.get(ManagedSubProfilesService)
    prisma = mod.get(PrismaService)
  })

  it('creates a managed sub-profile and claims the roster slot', async () => {
    const parent = await seedUser()
    const { team, club, ownerId } = await seedClubWithTeam()
    const [slot] = await prisma.rosterSlot.createManyAndReturn({
      data: [{ teamId: team.id, fullName: 'Mara' }],
    })
    const result = await service.create(parent.id, {
      fullName: 'Mara',
      dateOfBirth: new Date('2017-05-04').toISOString(),
      teamId: team.id,
      rosterSlotId: slot.id,
    })
    expect(result.user.managedById).toBe(parent.id)
    expect(result.user.clerkId).toBeNull()
    expect(result.user.email).toBeNull()
    expect(result.slot.claimedByUserId).toBe(result.user.id)
  })

  it('rejects when DOB is older than 16 (use phone OTP instead)', async () => {
    const parent = await seedUser()
    const { team } = await seedClubWithTeam()
    const [slot] = await prisma.rosterSlot.createManyAndReturn({
      data: [{ teamId: team.id, fullName: 'X' }],
    })
    await expect(
      service.create(parent.id, {
        fullName: 'X',
        dateOfBirth: new Date('2005-01-01').toISOString(),
        teamId: team.id,
        rosterSlotId: slot.id,
      }),
    ).rejects.toThrow(/16/)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/api && npx jest src/users/managed-sub-profiles.service.spec.ts`
Expected: FAIL with `Cannot find module './managed-sub-profiles.service'`.

- [ ] **Step 4: Implement the service**

Create `apps/api/src/users/managed-sub-profiles.service.ts`:

```ts
import { BadRequestException, Injectable } from '@nestjs/common'
import type { CreateManagedSubProfileInput } from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'

const UNDER_16_CUTOFF_YEARS = 16

function ageInYears(dob: Date, now: Date = new Date()): number {
  let age = now.getFullYear() - dob.getFullYear()
  const m = now.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--
  return age
}

@Injectable()
export class ManagedSubProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(parentUserId: string, input: CreateManagedSubProfileInput) {
    const dob = new Date(input.dateOfBirth)
    if (ageInYears(dob) >= UNDER_16_CUTOFF_YEARS) {
      throw new BadRequestException(
        '16+ users must register their own account via phone OTP, not as a managed sub-profile.',
      )
    }
    return this.prisma.$transaction(async (tx) => {
      const slot = await tx.rosterSlot.findFirst({
        where: { id: input.rosterSlotId, teamId: input.teamId, claimedByUserId: null },
      })
      if (!slot) throw new BadRequestException('Roster slot not available')

      const user = await tx.user.create({
        data: {
          name: input.fullName,
          dateOfBirth: dob,
          managedById: parentUserId,
          registrationRole: 'PLAYER',
        },
      })
      const updatedSlot = await tx.rosterSlot.update({
        where: { id: slot.id },
        data: { claimedByUserId: user.id, claimedAt: new Date() },
      })
      return { user, slot: updatedSlot }
    })
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/api && npx jest src/users/managed-sub-profiles.service.spec.ts`
Expected: 2 passing.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/users/managed-sub-profiles.service.ts apps/api/src/users/managed-sub-profiles.service.spec.ts packages/shared/src/schemas/managed-sub-profile.schema.ts packages/shared/src/index.ts
git commit -m "feat(api): create managed sub-profile + claim slot (under-16 only)"
```

---

### Task 12: `ManagedSubProfilesController` endpoint

**Files:**
- Create: `apps/api/src/users/managed-sub-profiles.controller.ts`
- Modify: `apps/api/src/users/users.module.ts`
- Test: `apps/api/src/users/managed-sub-profiles.controller.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/users/managed-sub-profiles.controller.spec.ts`:

```ts
import { Test } from '@nestjs/testing'
import { ManagedSubProfilesController } from './managed-sub-profiles.controller'
import { ManagedSubProfilesService } from './managed-sub-profiles.service'
import { ClerkAuthGuard } from '../auth/clerk.guard'

describe('ManagedSubProfilesController', () => {
  let controller: ManagedSubProfilesController
  const service = { create: jest.fn() }

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      controllers: [ManagedSubProfilesController],
      providers: [{ provide: ManagedSubProfilesService, useValue: service }],
    })
      .overrideGuard(ClerkAuthGuard).useValue({ canActivate: () => true })
      .compile()
    controller = mod.get(ManagedSubProfilesController)
    jest.clearAllMocks()
  })

  it('POST calls create with parsed body and parent id', async () => {
    service.create.mockResolvedValue({ user: { id: 'kid' }, slot: { id: 's1' } })
    const body = {
      fullName: 'Mara',
      dateOfBirth: '2017-05-04T00:00:00.000Z',
      teamId: 't1',
      rosterSlotId: 's1',
    }
    const res = await controller.create({ id: 'parent' } as any, body)
    expect(service.create).toHaveBeenCalledWith('parent', body)
    expect(res.user.id).toBe('kid')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/users/managed-sub-profiles.controller.spec.ts`
Expected: FAIL with `Cannot find module './managed-sub-profiles.controller'`.

- [ ] **Step 3: Implement the controller**

Create `apps/api/src/users/managed-sub-profiles.controller.ts`:

```ts
import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { createManagedSubProfileSchema } from '@anstoss/shared'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { CurrentUser } from '../auth/user.decorator'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { ManagedSubProfilesService } from './managed-sub-profiles.service'

@Controller('users/managed-sub-profiles')
@UseGuards(ClerkAuthGuard)
export class ManagedSubProfilesController {
  constructor(private readonly service: ManagedSubProfilesService) {}

  @Post()
  @RateLimit('write')
  create(@CurrentUser() user: { id: string }, @Body() body: unknown) {
    const parsed = createManagedSubProfileSchema.parse(body)
    return this.service.create(user.id, parsed)
  }
}
```

In `apps/api/src/users/users.module.ts`, register the new controller and provider.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest src/users/managed-sub-profiles.controller.spec.ts`
Expected: 1 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/users/managed-sub-profiles.controller.ts apps/api/src/users/managed-sub-profiles.controller.spec.ts apps/api/src/users/users.module.ts
git commit -m "feat(api): expose POST /users/managed-sub-profiles endpoint"
```

---

### Task 13: Full backend test sweep

**Files:** none

- [ ] **Step 1: Run the full API test suite**

Run: `cd apps/api && npm test`
Expected: all tests pass, no regressions in `teams.service.spec.ts`, `users.service.spec.ts`, or any other module touched by the schema migrations (Membership, JoinRequest, etc.).

- [ ] **Step 2: Run lint**

Run: `cd apps/api && npm run lint`
Expected: no errors.

- [ ] **Step 3: Verify types compile**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: If anything fails, fix it before continuing.** Do not skip lint or type errors.

---

## Self-Review

**Spec coverage check:**
- §3.4 #1 `Team.joinCode` → Tasks 1, 3, 4, 5 ✓
- §3.4 #2 `RosterSlot` → Tasks 6, 7, 8, 9 ✓
- §3.4 #3 `JoinRequest` → already exists in schema and controller, no work needed ✓
- §3.4 #4 Phone-OTP path in Clerk → out of scope for this plan (separate ticket per spec §8) ✓
- §3.4 #5 Parent-managed sub-profile → Tasks 10, 11, 12 ✓
- §3.4 #6–8 Contributions deltas → out of scope for this plan (Plan 4) ✓

**Placeholder scan:** none. Each step shows the actual code or command.

**Type consistency:** `generateJoinCode`, `JOIN_CODE_LENGTH`, `JOIN_CODE_ALPHABET` consistent across Tasks 2 and 3. `RosterSlot` field names (`claimedByUserId`, `claimedAt`) consistent across Tasks 6, 7, 8, 9, 11. `bulkRosterSlotsInputSchema` / `BulkRosterSlotsInput` consistent across Tasks 7 and 9. `createManagedSubProfileSchema` / `CreateManagedSubProfileInput` consistent across Tasks 11 and 12.

---

## Follow-Up Plans

After this plan ships and is reviewed:

- **Plan 2:** `2026-04-25-onboarding-revamp-mobile-auth.md` — welcome → role pick → branches → roster claim screens (consumes the endpoints above, gated by `anstoss.newOnboarding`)
- **Plan 3:** `2026-04-25-onboarding-revamp-mobile-home.md` — restyle home + events + match-detail + more tab
- **Plan 4:** `2026-04-25-onboarding-revamp-contributions.md` — SEPA mandate screen + member-facing contributions screen (the contribution Prisma models already exist, see schema lines 840–957)
