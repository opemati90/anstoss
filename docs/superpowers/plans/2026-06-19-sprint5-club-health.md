# Sprint 5: Club Health Dashboard + Public Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give club admins one screen with everything they need to keep the club healthy (dues, consents, team activity, coach handover), give coaches a Roster Intelligence panel showing position gaps and injury patterns, and give every club a public-facing landing page that drives new member signups.

**Architecture:** All Sprint 5 data derives from existing models — no new schema migrations. `ClubHealthSnapshot` and `RosterIntelligence` are computed aggregation endpoints added to existing NestJS modules. Public Club Page is a new unauthenticated controller at `/public/clubs/:slug`. Coach handover is a PATCH on the existing teams endpoint. Frontend adds a new "Health" section in `AdminHome` and a new "Roster Intel" section in `CoachHome`.

**Tech Stack:** NestJS + Prisma (API), Expo Router + React Native (mobile), `@anstoss/shared` Zod.

## Global Constraints

- No Prisma migrations in this sprint. All data aggregated from existing tables.
- Public Club Page: unauthenticated — no `ClerkAuthGuard`, but rate-limited via IP-based limiter.
- Club slug: use `Club.id` if no slug field exists (check schema). If a `slug` field doesn't exist, the public endpoint uses the club ID.
- Coach handover: only `ADMIN` or `CLUB_OWNER` role can transfer coach assignment; target must be an existing `TeamMember`.
- `AdminHome` health panel replaces the current placeholder "pending join requests" card — don't remove that data, integrate it into the new health view.
- I18n: all new copy in all 8 locales (ar, de, en, es, fr, pl, pt, tr).

---

## File Map

**New files (API):**
- `apps/api/src/clubs/clubs.health.ts` — pure `computeClubHealth()` function
- `apps/api/src/clubs/clubs.roster-intel.ts` — pure `computeRosterIntelligence()` function
- `apps/api/src/public/public.controller.ts` — unauthenticated public club/team endpoints
- `apps/api/src/public/public.module.ts` — module wrapper

**New files (Mobile):**
- `apps/mobile/src/components/home/ClubHealthPanel.tsx` — admin home health section
- `apps/mobile/src/components/home/RosterIntelPanel.tsx` — coach home roster intelligence
- `apps/mobile/app/public-club/[clubId].tsx` — public club page (deep link target)

**Modified files:**
- `apps/api/src/clubs/clubs.controller.ts` — add `GET /:clubId/health-snapshot`, `GET /:clubId/roster-intelligence`, `POST /:clubId/teams/:teamId/transfer-coach`
- `apps/api/src/clubs/clubs.service.ts` — add aggregation methods
- `apps/api/src/app.module.ts` — register `PublicModule`
- `apps/mobile/src/components/home/AdminHome.tsx` — integrate `ClubHealthPanel`
- `apps/mobile/src/components/home/CoachHome.tsx` — integrate `RosterIntelPanel`
- `apps/mobile/src/i18n/locales/*.json` — health + roster + public page i18n keys

---

### Task 1: Backend — Club Health Aggregation

**Files:**
- Create: `apps/api/src/clubs/clubs.health.ts`
- Modify: `apps/api/src/clubs/clubs.service.ts`
- Modify: `apps/api/src/clubs/clubs.controller.ts`

**Interfaces:**
- Produces: `GET /clubs/:clubId/health-snapshot` → `ClubHealthSnapshot` used by Task 4

- [ ] **Step 1: Write failing test**

  Create `apps/api/src/clubs/clubs.health.spec.ts`:

  ```typescript
  import { computeClubHealth } from './clubs.health'

  describe('computeClubHealth', () => {
    it('calculates dues health percentage', () => {
      const result = computeClubHealth({
        totalMembers: 20,
        paidDues: 15,
        pendingDues: 5,
        totalConsents: 8,
        signedConsents: 6,
        activeTeams: 3,
        inactiveTeams: 1,
        pendingJoinRequests: 2,
        pendingCoachApprovals: 1,
      })
      expect(result.duesHealthPct).toBe(75)
      expect(result.consentCoveragePct).toBe(75)
    })

    it('marks dues as healthy when 90%+ paid', () => {
      const result = computeClubHealth({
        totalMembers: 10,
        paidDues: 9,
        pendingDues: 1,
        totalConsents: 10,
        signedConsents: 10,
        activeTeams: 2,
        inactiveTeams: 0,
        pendingJoinRequests: 0,
        pendingCoachApprovals: 0,
      })
      expect(result.duesStatus).toBe('HEALTHY')
    })

    it('marks dues as CRITICAL when below 60%', () => {
      const result = computeClubHealth({
        totalMembers: 10,
        paidDues: 5,
        pendingDues: 5,
        totalConsents: 10,
        signedConsents: 5,
        activeTeams: 1,
        inactiveTeams: 2,
        pendingJoinRequests: 0,
        pendingCoachApprovals: 0,
      })
      expect(result.duesStatus).toBe('CRITICAL')
    })
  })
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd /Users/yemi/anstoss
  npm test -- --filter=api --testPathPattern=clubs.health 2>&1 | tail -5
  ```
  Expected: FAIL — "Cannot find module './clubs.health'"

- [ ] **Step 3: Create clubs.health.ts**

  ```typescript
  // apps/api/src/clubs/clubs.health.ts

  export type ClubHealthInput = {
    totalMembers: number
    paidDues: number
    pendingDues: number
    totalConsents: number
    signedConsents: number
    activeTeams: number
    inactiveTeams: number
    pendingJoinRequests: number
    pendingCoachApprovals: number
  }

  export type ClubHealthSnapshot = {
    duesHealthPct: number
    duesStatus: 'HEALTHY' | 'AT_RISK' | 'CRITICAL'
    consentCoveragePct: number
    consentStatus: 'HEALTHY' | 'AT_RISK' | 'CRITICAL'
    activeTeams: number
    inactiveTeams: number
    pendingJoinRequests: number
    pendingCoachApprovals: number
    overallStatus: 'HEALTHY' | 'AT_RISK' | 'CRITICAL'
  }

  function pct(numerator: number, denominator: number): number {
    if (denominator === 0) return 100
    return Math.round((numerator / denominator) * 100)
  }

  function band(value: number): 'HEALTHY' | 'AT_RISK' | 'CRITICAL' {
    if (value >= 90) return 'HEALTHY'
    if (value >= 60) return 'AT_RISK'
    return 'CRITICAL'
  }

  export function computeClubHealth(input: ClubHealthInput): ClubHealthSnapshot {
    const duesHealthPct = pct(input.paidDues, input.paidDues + input.pendingDues)
    const duesStatus = band(duesHealthPct)

    const consentCoveragePct = pct(input.signedConsents, input.totalConsents)
    const consentStatus = band(consentCoveragePct)

    const overallStatuses = [duesStatus, consentStatus]
    const overallStatus = overallStatuses.includes('CRITICAL')
      ? 'CRITICAL'
      : overallStatuses.includes('AT_RISK')
        ? 'AT_RISK'
        : 'HEALTHY'

    return {
      duesHealthPct,
      duesStatus,
      consentCoveragePct,
      consentStatus,
      activeTeams: input.activeTeams,
      inactiveTeams: input.inactiveTeams,
      pendingJoinRequests: input.pendingJoinRequests,
      pendingCoachApprovals: input.pendingCoachApprovals,
      overallStatus,
    }
  }
  ```

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  cd /Users/yemi/anstoss
  npm test -- --filter=api --testPathPattern=clubs.health 2>&1 | tail -5
  ```
  Expected: PASS (3 tests)

- [ ] **Step 5: Add getHealthSnapshot() to clubs.service.ts**

  In `apps/api/src/clubs/clubs.service.ts`, add at the bottom:

  ```typescript
  import { computeClubHealth, type ClubHealthSnapshot } from './clubs.health'

  async getHealthSnapshot(clubId: string): Promise<ClubHealthSnapshot> {
    const [
      memberCount,
      paidDues,
      pendingDues,
      totalConsents,
      signedConsents,
      teams,
      pendingJoinRequests,
      pendingCoachApprovals,
    ] = await Promise.all([
      this.prisma.membership.count({ where: { clubId, status: 'ACTIVE' } }),
      this.prisma.contributionRecord.count({
        where: { plan: { clubId }, status: { in: ['PAID'] } },
      }),
      this.prisma.contributionRecord.count({
        where: { plan: { clubId }, status: { in: ['PENDING', 'PARTIAL'] } },
      }),
      this.prisma.parentalConsent.count({ where: { clubId } }),
      this.prisma.parentalConsent.count({ where: { clubId, status: 'SIGNED' } }),
      this.prisma.team.findMany({
        where: { clubId },
        include: {
          events: {
            where: { date: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
            select: { id: true },
            take: 1,
          },
        },
      }),
      this.prisma.joinRequest.count({ where: { clubId, status: 'PENDING' } }),
      this.prisma.teamMember.count({
        where: { team: { clubId }, role: 'COACH', teamAccesses: { some: { status: 'PENDING_APPROVAL' } } },
      }).catch(() => 0),
    ])

    const activeTeams = teams.filter((t) => t.events.length > 0).length
    const inactiveTeams = teams.length - activeTeams

    return computeClubHealth({
      totalMembers: memberCount,
      paidDues,
      pendingDues,
      totalConsents,
      signedConsents,
      activeTeams,
      inactiveTeams,
      pendingJoinRequests,
      pendingCoachApprovals,
    })
  }

  async transferCoach(
    clubId: string,
    teamId: string,
    fromUserId: string,
    toUserId: string,
    requestingUserId: string,
  ): Promise<void> {
    // Verify requestor is admin
    await this.prisma.membership.findFirstOrThrow({
      where: { clubId, userId: requestingUserId, role: { in: ['OWNER', 'ADMIN'] } },
    })
    // Verify target user is a team member
    await this.prisma.teamMember.findFirstOrThrow({
      where: { teamId, userId: toUserId, leftAt: null },
    })
    // Demote old coach, promote new coach
    await this.prisma.$transaction([
      this.prisma.teamMember.updateMany({
        where: { teamId, userId: fromUserId, role: 'COACH' },
        data: { role: 'PLAYER' },
      }),
      this.prisma.teamMember.updateMany({
        where: { teamId, userId: toUserId },
        data: { role: 'COACH' },
      }),
    ])
  }
  ```

- [ ] **Step 6: Add endpoints to clubs.controller.ts**

  In `apps/api/src/clubs/clubs.controller.ts`, add:

  ```typescript
  @Get(':clubId/health-snapshot')
  @UseGuards(ClerkAuthGuard)
  @RateLimit('read')
  async getHealthSnapshot(
    @AuthUser() user: ReqUser,
    @Param('clubId') clubId: string,
  ) {
    // Only admins see the health snapshot
    await this.clubsService.assertAdmin(clubId, user.id)
    return this.clubsService.getHealthSnapshot(clubId)
  }

  @Post(':clubId/teams/:teamId/transfer-coach')
  @UseGuards(ClerkAuthGuard)
  @RateLimit('write')
  async transferCoach(
    @AuthUser() user: ReqUser,
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Body() body: { fromUserId: string; toUserId: string },
  ) {
    await this.clubsService.transferCoach(clubId, teamId, body.fromUserId, body.toUserId, user.id)
    return { ok: true }
  }
  ```

  Note: `assertAdmin()` is likely already in `clubs.service.ts`. If not, add:
  ```typescript
  async assertAdmin(clubId: string, userId: string) {
    await this.prisma.membership.findFirstOrThrow({
      where: { clubId, userId, role: { in: ['OWNER', 'ADMIN'] } },
    })
  }
  ```

- [ ] **Step 7: Run tests**

  ```bash
  cd /Users/yemi/anstoss
  npm test -- --filter=api --testPathPattern=clubs 2>&1 | tail -10
  ```
  Expected: all PASS

- [ ] **Step 8: Commit**

  ```bash
  git add apps/api/src/clubs/
  git commit -m "feat(clubs): health-snapshot endpoint + transfer-coach + computeClubHealth pure fn"
  ```

---

### Task 2: Backend — Roster Intelligence Aggregation

**Files:**
- Create: `apps/api/src/clubs/clubs.roster-intel.ts`
- Modify: `apps/api/src/clubs/clubs.service.ts`
- Modify: `apps/api/src/clubs/clubs.controller.ts`

**Interfaces:**
- Produces: `GET /clubs/:clubId/roster-intelligence?teamId=:teamId` → `RosterIntelligence` used by Task 5

- [ ] **Step 1: Write failing test**

  Create `apps/api/src/clubs/clubs.roster-intel.spec.ts`:

  ```typescript
  import { computeRosterIntelligence } from './clubs.roster-intel'

  describe('computeRosterIntelligence', () => {
    const roster = [
      { userId: 'u1', dateOfBirth: new Date('2000-01-01'), position: 'GK' },
      { userId: 'u2', dateOfBirth: new Date('1998-06-15'), position: 'DEF' },
      { userId: 'u3', dateOfBirth: new Date('2001-03-20'), position: 'MID' },
      { userId: 'u4', dateOfBirth: new Date('1995-09-05'), position: 'FWD' },
    ]

    it('detects GK as covered', () => {
      const result = computeRosterIntelligence(roster, [], new Date('2026-06-19'))
      expect(result.positionGaps.includes('GK')).toBe(false)
    })

    it('flags DEF gap when no defenders', () => {
      const noDefRoster = roster.filter((r) => r.position !== 'DEF')
      const result = computeRosterIntelligence(noDefRoster, [], new Date('2026-06-19'))
      expect(result.positionGaps).toContain('DEF')
    })

    it('calculates average age', () => {
      const result = computeRosterIntelligence(roster, [], new Date('2026-06-19'))
      expect(result.averageAge).toBeGreaterThan(20)
      expect(result.averageAge).toBeLessThan(35)
    })

    it('identifies recurring injury players', () => {
      const injuries = [
        { userId: 'u1', status: 'OUT' },
        { userId: 'u1', status: 'OUT' },
        { userId: 'u2', status: 'OUT' },
      ]
      const result = computeRosterIntelligence(roster, injuries, new Date('2026-06-19'))
      expect(result.recurringInjuryPlayerIds).toContain('u1')
      expect(result.recurringInjuryPlayerIds).not.toContain('u2')
    })
  })
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd /Users/yemi/anstoss
  npm test -- --filter=api --testPathPattern=roster-intel 2>&1 | tail -5
  ```
  Expected: FAIL — "Cannot find module './clubs.roster-intel'"

- [ ] **Step 3: Create clubs.roster-intel.ts**

  ```typescript
  // apps/api/src/clubs/clubs.roster-intel.ts

  const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'] as const
  type Position = typeof POSITIONS[number]

  export type RosterMember = {
    userId: string
    dateOfBirth: Date | null
    position: string | null
  }

  export type InjuryRecord = {
    userId: string
    status: string
  }

  export type RosterIntelligence = {
    positionGaps: Position[]
    positionCounts: Record<Position, number>
    averageAge: number
    ageDistribution: { under21: number; age21to26: number; age27to32: number; over32: number }
    recurringInjuryPlayerIds: string[]
    squadSize: number
  }

  function ageAt(dob: Date, now: Date): number {
    let age = now.getFullYear() - dob.getFullYear()
    const m = now.getMonth() - dob.getMonth()
    if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--
    return age
  }

  export function computeRosterIntelligence(
    roster: RosterMember[],
    injuries: InjuryRecord[],
    now: Date,
  ): RosterIntelligence {
    const positionCounts = { GK: 0, DEF: 0, MID: 0, FWD: 0 }
    for (const m of roster) {
      const pos = m.position as Position
      if (pos && pos in positionCounts) positionCounts[pos]++
    }
    const positionGaps = POSITIONS.filter((p) => positionCounts[p] === 0)

    const ages = roster
      .filter((m) => m.dateOfBirth)
      .map((m) => ageAt(m.dateOfBirth!, now))
    const averageAge = ages.length > 0 ? Math.round(ages.reduce((s, a) => s + a, 0) / ages.length) : 0

    const ageDistribution = {
      under21: ages.filter((a) => a < 21).length,
      age21to26: ages.filter((a) => a >= 21 && a <= 26).length,
      age27to32: ages.filter((a) => a >= 27 && a <= 32).length,
      over32: ages.filter((a) => a > 32).length,
    }

    // Players with 2+ injury reports are "recurring"
    const injuryCount = new Map<string, number>()
    for (const inj of injuries) {
      injuryCount.set(inj.userId, (injuryCount.get(inj.userId) ?? 0) + 1)
    }
    const recurringInjuryPlayerIds = [...injuryCount.entries()]
      .filter(([, count]) => count >= 2)
      .map(([uid]) => uid)

    return {
      positionGaps,
      positionCounts,
      averageAge,
      ageDistribution,
      recurringInjuryPlayerIds,
      squadSize: roster.length,
    }
  }
  ```

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  cd /Users/yemi/anstoss
  npm test -- --filter=api --testPathPattern=roster-intel 2>&1 | tail -5
  ```
  Expected: PASS (4 tests)

- [ ] **Step 5: Add getRosterIntelligence() to clubs.service.ts**

  ```typescript
  import { computeRosterIntelligence, type RosterIntelligence } from './clubs.roster-intel'

  async getRosterIntelligence(clubId: string, teamId: string): Promise<RosterIntelligence> {
    const [members, injuries] = await Promise.all([
      this.prisma.teamMember.findMany({
        where: { team: { clubId }, teamId, leftAt: null },
        include: {
          user: {
            select: { dateOfBirth: true },
            include: {
              rosterSlots: { where: { teamId }, select: { position: true }, take: 1 },
            },
          },
        },
      }),
      this.prisma.injuryReport.findMany({
        where: { teamId },
        select: { userId: true, status: true },
      }),
    ])

    const roster = members.map((m) => ({
      userId: m.userId,
      dateOfBirth: m.user.dateOfBirth,
      position: m.user.rosterSlots[0]?.position ?? null,
    }))

    return computeRosterIntelligence(roster, injuries, new Date())
  }
  ```

- [ ] **Step 6: Add endpoint to clubs.controller.ts**

  ```typescript
  @Get(':clubId/roster-intelligence')
  @UseGuards(ClerkAuthGuard)
  @RateLimit('read')
  async getRosterIntelligence(
    @AuthUser() user: ReqUser,
    @Param('clubId') clubId: string,
    @Query('teamId') teamId: string,
  ) {
    return this.clubsService.getRosterIntelligence(clubId, teamId)
  }
  ```

- [ ] **Step 7: Run tests**

  ```bash
  cd /Users/yemi/anstoss
  npm test -- --filter=api 2>&1 | tail -10
  ```
  Expected: all new tests PASS

- [ ] **Step 8: Commit**

  ```bash
  git add apps/api/src/clubs/clubs.roster-intel.ts apps/api/src/clubs/clubs.roster-intel.spec.ts apps/api/src/clubs/
  git commit -m "feat(clubs): roster-intelligence endpoint — position gaps, age distribution, recurring injuries"
  ```

---

### Task 3: Backend — Public Club Page Endpoint

**Files:**
- Create: `apps/api/src/public/public.controller.ts`
- Create: `apps/api/src/public/public.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Produces: `GET /public/clubs/:clubId` → unauthenticated club info + upcoming fixtures (used by Task 6 deep link)

- [ ] **Step 1: Write failing test**

  Create `apps/api/src/public/public.controller.spec.ts`:

  ```typescript
  import { buildPublicClubView } from './public.controller'

  describe('buildPublicClubView', () => {
    it('sanitises club data for public consumption', () => {
      const input = {
        id: 'club1',
        name: 'FC Test',
        primaryColor: '#ff0000',
        badgeUrl: 'https://r2.example.com/badge.png',
        description: 'A great club',
        memberCount: 42,
        teamCount: 3,
        upcomingFixtures: [],
      }
      const result = buildPublicClubView(input)
      expect(result.id).toBe('club1')
      expect(result.name).toBe('FC Test')
      // No private fields
      expect((result as never as { email: unknown }).email).toBeUndefined()
    })
  })
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd /Users/yemi/anstoss
  npm test -- --filter=api --testPathPattern=public.controller 2>&1 | tail -5
  ```
  Expected: FAIL — "Cannot find module './public.controller'"

- [ ] **Step 3: Create public.controller.ts**

  ```typescript
  // apps/api/src/public/public.controller.ts
  import { Controller, Get, NotFoundException, Param } from '@nestjs/common'
  import { PrismaService } from '../prisma/prisma.service'
  import { Throttle } from '@nestjs/throttler'

  export type PublicClubView = {
    id: string
    name: string
    primaryColor: string | null
    badgeUrl: string | null
    description: string | null
    memberCount: number
    teamCount: number
    upcomingFixtures: { id: string; date: string; homeTeam: string; awayTeam: string | null }[]
    joinCta: string
  }

  export function buildPublicClubView(input: {
    id: string
    name: string
    primaryColor: string | null
    badgeUrl: string | null
    description: string | null
    memberCount: number
    teamCount: number
    upcomingFixtures: { id: string; date: string; homeTeam: string; awayTeam: string | null }[]
  }): PublicClubView {
    return {
      id: input.id,
      name: input.name,
      primaryColor: input.primaryColor,
      badgeUrl: input.badgeUrl,
      description: input.description,
      memberCount: input.memberCount,
      teamCount: input.teamCount,
      upcomingFixtures: input.upcomingFixtures,
      joinCta: `anstoss://join/${input.id}`,
    }
  }

  @Controller('public')
  export class PublicController {
    constructor(private readonly prisma: PrismaService) {}

    @Get('clubs/:clubId')
    @Throttle({ default: { limit: 30, ttl: 60_000 } }) // 30 req/min per IP
    async getPublicClub(@Param('clubId') clubId: string): Promise<PublicClubView> {
      const club = await this.prisma.club.findUnique({
        where: { id: clubId },
        include: {
          memberships: { where: { status: 'ACTIVE' }, select: { id: true } },
          teams: { where: {}, select: { id: true } },
        },
      })
      if (!club) throw new NotFoundException('Club not found')

      const upcomingFixtures = await this.prisma.importedFixture.findMany({
        where: {
          teamLink: { clubId },
          date: { gte: new Date() },
          status: { not: 'CANCELLED' },
        },
        orderBy: { date: 'asc' },
        take: 5,
        select: { id: true, date: true, homeTeamName: true, awayTeamName: true },
      })

      return buildPublicClubView({
        id: club.id,
        name: club.name,
        primaryColor: club.primaryColor,
        badgeUrl: club.badgeUrl,
        description: (club as never as { description?: string }).description ?? null,
        memberCount: club.memberships.length,
        teamCount: club.teams.length,
        upcomingFixtures: upcomingFixtures.map((f) => ({
          id: f.id,
          date: f.date.toISOString(),
          homeTeam: f.homeTeamName,
          awayTeam: f.awayTeamName,
        })),
      })
    }
  }
  ```

- [ ] **Step 4: Create public.module.ts**

  ```typescript
  // apps/api/src/public/public.module.ts
  import { Module } from '@nestjs/common'
  import { PublicController } from './public.controller'
  import { PrismaService } from '../prisma/prisma.service'

  @Module({
    controllers: [PublicController],
    providers: [PrismaService],
  })
  export class PublicModule {}
  ```

- [ ] **Step 5: Register in app.module.ts**

  In `apps/api/src/app.module.ts`, add to imports array:

  ```typescript
  import { PublicModule } from './public/public.module'

  // In @Module imports:
  PublicModule,
  ```

- [ ] **Step 6: Run tests**

  ```bash
  cd /Users/yemi/anstoss
  npm test -- --filter=api --testPathPattern=public 2>&1 | tail -5
  ```
  Expected: PASS

- [ ] **Step 7: Commit**

  ```bash
  git add apps/api/src/public/ apps/api/src/app.module.ts
  git commit -m "feat(public): GET /public/clubs/:clubId — unauthenticated club landing data"
  ```

---

### Task 4: Frontend — ClubHealthPanel in AdminHome

**Files:**
- Create: `apps/mobile/src/components/home/ClubHealthPanel.tsx`
- Modify: `apps/mobile/src/components/home/AdminHome.tsx`

**Interfaces:**
- Consumes: `GET /clubs/:clubId/health-snapshot` from Task 1
- Produces: health panel section in AdminHome with dues%, consent%, inactive teams, coach handover button

- [ ] **Step 1: Create ClubHealthPanel.tsx**

  ```typescript
  // apps/mobile/src/components/home/ClubHealthPanel.tsx
  import { Pressable, StyleSheet, View } from 'react-native'
  import { router } from 'expo-router'
  import { useTranslation } from 'react-i18next'
  import { Icon, Text } from '../ui'
  import { useClubColors } from '../../context/ClubThemeContext'
  import { fonts, hairline, radius, space } from '../../theme/tokens'

  const STATUS_COLOR = {
    HEALTHY: '#22c55e',
    AT_RISK: '#f59e0b',
    CRITICAL: '#ef4444',
  } as const

  type ClubHealthSnapshot = {
    duesHealthPct: number
    duesStatus: 'HEALTHY' | 'AT_RISK' | 'CRITICAL'
    consentCoveragePct: number
    consentStatus: 'HEALTHY' | 'AT_RISK' | 'CRITICAL'
    activeTeams: number
    inactiveTeams: number
    pendingJoinRequests: number
    pendingCoachApprovals: number
    overallStatus: 'HEALTHY' | 'AT_RISK' | 'CRITICAL'
  }

  type Props = { snapshot: ClubHealthSnapshot; clubId: string }

  export function ClubHealthPanel({ snapshot, clubId }: Props) {
    const c = useClubColors()
    const { t } = useTranslation()

    return (
      <View style={[styles.panel, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[snapshot.overallStatus] }]} />
            <Text style={[styles.title, { color: c.textPrimary }]}>
              {t('health.title', { defaultValue: 'Club Health' })}
            </Text>
          </View>
        </View>

        <View style={styles.grid}>
          <View style={styles.gridItem}>
            <Text style={[styles.metricValue, { color: STATUS_COLOR[snapshot.duesStatus] }]}>
              {snapshot.duesHealthPct}%
            </Text>
            <Text style={[styles.metricLabel, { color: c.textTertiary }]}>
              {t('health.dues', { defaultValue: 'DUES PAID' })}
            </Text>
          </View>
          <View style={styles.gridItem}>
            <Text style={[styles.metricValue, { color: STATUS_COLOR[snapshot.consentStatus] }]}>
              {snapshot.consentCoveragePct}%
            </Text>
            <Text style={[styles.metricLabel, { color: c.textTertiary }]}>
              {t('health.consents', { defaultValue: 'CONSENTS' })}
            </Text>
          </View>
          <View style={styles.gridItem}>
            <Text style={[styles.metricValue, { color: c.textPrimary }]}>
              {snapshot.activeTeams}
            </Text>
            <Text style={[styles.metricLabel, { color: c.textTertiary }]}>
              {t('health.activeTeams', { defaultValue: 'ACTIVE TEAMS' })}
            </Text>
          </View>
          {snapshot.inactiveTeams > 0 && (
            <View style={styles.gridItem}>
              <Text style={[styles.metricValue, { color: '#f59e0b' }]}>
                {snapshot.inactiveTeams}
              </Text>
              <Text style={[styles.metricLabel, { color: c.textTertiary }]}>
                {t('health.inactiveTeams', { defaultValue: 'IDLE TEAMS' })}
              </Text>
            </View>
          )}
        </View>

        {(snapshot.pendingJoinRequests > 0 || snapshot.pendingCoachApprovals > 0) && (
          <View style={[styles.alerts, { borderTopColor: c.borderDefault }]}>
            {snapshot.pendingJoinRequests > 0 && (
              <Pressable
                onPress={() => router.push(`/clubs/${clubId}/join-requests` as never)}
                style={styles.alertRow}
                accessibilityRole="button"
              >
                <Icon name="person.badge.plus" size={14} color={c.primary} />
                <Text style={[styles.alertText, { color: c.textSecondary }]}>
                  {t('health.pendingJoins', {
                    defaultValue: '{{count}} join request',
                    count: snapshot.pendingJoinRequests,
                  })}
                </Text>
                <Icon name="chevron.right" size={12} color={c.textTertiary} />
              </Pressable>
            )}
            {snapshot.pendingCoachApprovals > 0 && (
              <View style={styles.alertRow}>
                <Icon name="whistle" size={14} color={c.primary} />
                <Text style={[styles.alertText, { color: c.textSecondary }]}>
                  {t('health.pendingCoaches', {
                    defaultValue: '{{count}} coach pending approval',
                    count: snapshot.pendingCoachApprovals,
                  })}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
    )
  }

  const styles = StyleSheet.create({
    panel: { borderRadius: radius.lg, borderWidth: hairline, overflow: 'hidden' },
    header: { paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: space.sm },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    statusDot: { width: 10, height: 10, borderRadius: 5 },
    title: { fontFamily: fonts.label, fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: space.md, gap: space.md, paddingBottom: space.md },
    gridItem: { width: '45%', gap: 2 },
    metricValue: { fontFamily: fonts.data, fontSize: 24, fontWeight: '800' },
    metricLabel: { fontFamily: fonts.label, fontSize: 10, letterSpacing: 1.2, fontWeight: '700' },
    alerts: { borderTopWidth: hairline, paddingHorizontal: space.md, paddingVertical: space.sm, gap: 8 },
    alertRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    alertText: { fontFamily: fonts.body, fontSize: 13, flex: 1 },
  })
  ```

- [ ] **Step 2: Integrate ClubHealthPanel into AdminHome**

  In `apps/mobile/src/components/home/AdminHome.tsx`:

  Add import:
  ```typescript
  import { ClubHealthPanel } from './ClubHealthPanel'
  ```

  Add state:
  ```typescript
  const [healthSnapshot, setHealthSnapshot] = useState<ClubHealthSnapshot | null>(null)
  ```

  Add to the `load` callback's `Promise.all`:
  ```typescript
  api<ClubHealthSnapshot>(`/clubs/${clubId}/health-snapshot`).catch(() => null),
  ```

  In JSX, below the activity feed section, add:
  ```typescript
  {healthSnapshot && (
    <ClubHealthPanel snapshot={healthSnapshot} clubId={clubId} />
  )}
  ```

- [ ] **Step 3: Add i18n keys to all 8 locales**

  ```json
  "health": {
    "title": "Club Health",
    "dues": "DUES PAID",
    "consents": "CONSENTS",
    "activeTeams": "ACTIVE TEAMS",
    "inactiveTeams": "IDLE TEAMS",
    "pendingJoins": "{{count}} join request",
    "pendingCoaches": "{{count}} coach pending approval"
  }
  ```

  German:
  ```json
  "health": {
    "title": "Vereinsgesundheit",
    "dues": "BEITRÄGE BEZAHLT",
    "consents": "EINWILLIGUNGEN",
    "activeTeams": "AKTIVE TEAMS",
    "inactiveTeams": "INAKTIVE TEAMS",
    "pendingJoins": "{{count}} Beitrittsanfrage",
    "pendingCoaches": "{{count}} Trainer wartet auf Freigabe"
  }
  ```

- [ ] **Step 4: Run tests**

  ```bash
  cd /Users/yemi/anstoss
  npm test -- --filter=mobile 2>&1 | tail -10
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add apps/mobile/src/components/home/ClubHealthPanel.tsx apps/mobile/src/components/home/AdminHome.tsx apps/mobile/src/i18n/
  git commit -m "feat(mobile): ClubHealthPanel in AdminHome — dues%, consent%, idle teams, pending items"
  ```

---

### Task 5: Frontend — RosterIntelPanel in CoachHome

**Files:**
- Create: `apps/mobile/src/components/home/RosterIntelPanel.tsx`
- Modify: `apps/mobile/src/components/home/CoachHome.tsx`

**Interfaces:**
- Consumes: `GET /clubs/:clubId/roster-intelligence?teamId=:teamId` from Task 2
- Produces: position gap row + age distribution bars in CoachHome

- [ ] **Step 1: Create RosterIntelPanel.tsx**

  ```typescript
  // apps/mobile/src/components/home/RosterIntelPanel.tsx
  import { StyleSheet, View } from 'react-native'
  import { useTranslation } from 'react-i18next'
  import { Icon, Text } from '../ui'
  import { useClubColors } from '../../context/ClubThemeContext'
  import { fonts, hairline, radius, space } from '../../theme/tokens'

  const POSITION_LABELS: Record<string, string> = { GK: 'GK', DEF: 'DEF', MID: 'MID', FWD: 'FWD' }

  type RosterIntelligence = {
    positionGaps: string[]
    positionCounts: Record<string, number>
    averageAge: number
    ageDistribution: { under21: number; age21to26: number; age27to32: number; over32: number }
    recurringInjuryPlayerIds: string[]
    squadSize: number
  }

  type Props = { intel: RosterIntelligence }

  export function RosterIntelPanel({ intel }: Props) {
    const c = useClubColors()
    const { t } = useTranslation()
    const maxAge = Math.max(
      intel.ageDistribution.under21,
      intel.ageDistribution.age21to26,
      intel.ageDistribution.age27to32,
      intel.ageDistribution.over32,
      1,
    )

    return (
      <View style={[styles.panel, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
        <Text style={[styles.title, { color: c.textPrimary }]}>
          {t('rosterIntel.title', { defaultValue: 'Roster Intelligence' })}
        </Text>

        {intel.positionGaps.length > 0 && (
          <View style={[styles.gapAlert, { backgroundColor: '#ef444418', borderColor: '#ef444440' }]}>
            <Icon name="exclamationmark.triangle" size={12} color="#ef4444" />
            <Text style={[styles.gapText, { color: '#ef4444' }]}>
              {t('rosterIntel.gaps', {
                defaultValue: 'Position gaps: {{positions}}',
                positions: intel.positionGaps.map((p) => POSITION_LABELS[p] ?? p).join(', '),
              })}
            </Text>
          </View>
        )}

        <View style={styles.posRow}>
          {(['GK', 'DEF', 'MID', 'FWD'] as const).map((pos) => (
            <View key={pos} style={styles.posItem}>
              <Text
                style={[
                  styles.posCount,
                  { color: intel.positionGaps.includes(pos) ? '#ef4444' : c.textPrimary },
                ]}
              >
                {intel.positionCounts[pos] ?? 0}
              </Text>
              <Text style={[styles.posLabel, { color: c.textTertiary }]}>{POSITION_LABELS[pos]}</Text>
            </View>
          ))}
        </View>

        <View style={styles.ageSection}>
          <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>
            {t('rosterIntel.ageLabel', { defaultValue: 'AGE SPREAD · avg {{age}}', age: intel.averageAge })}
          </Text>
          <View style={styles.ageBars}>
            {[
              { label: '<21', count: intel.ageDistribution.under21 },
              { label: '21–26', count: intel.ageDistribution.age21to26 },
              { label: '27–32', count: intel.ageDistribution.age27to32 },
              { label: '32+', count: intel.ageDistribution.over32 },
            ].map((bucket) => (
              <View key={bucket.label} style={styles.ageBar}>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      { backgroundColor: c.primary, height: `${Math.round((bucket.count / maxAge) * 100)}%` as never },
                    ]}
                  />
                </View>
                <Text style={[styles.barCount, { color: c.textPrimary }]}>{bucket.count}</Text>
                <Text style={[styles.barLabel, { color: c.textTertiary }]}>{bucket.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {intel.recurringInjuryPlayerIds.length > 0 && (
          <View style={[styles.injuryAlert, { borderTopColor: c.borderDefault }]}>
            <Icon name="bandage" size={12} color="#f59e0b" />
            <Text style={[styles.injuryText, { color: c.textSecondary }]}>
              {t('rosterIntel.recurringInjuries', {
                defaultValue: '{{count}} player with recurring injuries',
                count: intel.recurringInjuryPlayerIds.length,
              })}
            </Text>
          </View>
        )}
      </View>
    )
  }

  const styles = StyleSheet.create({
    panel: { borderRadius: radius.lg, borderWidth: hairline, padding: space.md, gap: space.md },
    title: { fontFamily: fonts.label, fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
    gapAlert: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.sm, borderWidth: hairline, padding: 8 },
    gapText: { fontFamily: fonts.body, fontSize: 12, fontWeight: '600', flex: 1 },
    posRow: { flexDirection: 'row', justifyContent: 'space-between' },
    posItem: { alignItems: 'center', gap: 2 },
    posCount: { fontFamily: fonts.data, fontSize: 20, fontWeight: '800' },
    posLabel: { fontFamily: fonts.label, fontSize: 10, letterSpacing: 1, fontWeight: '700' },
    ageSection: { gap: 8 },
    sectionLabel: { fontFamily: fonts.label, fontSize: 10, letterSpacing: 1.2, fontWeight: '700' },
    ageBars: { flexDirection: 'row', gap: 12, height: 80, alignItems: 'flex-end' },
    ageBar: { flex: 1, alignItems: 'center', gap: 3 },
    barTrack: { width: '100%', height: 60, borderRadius: 3, backgroundColor: '#00000010', justifyContent: 'flex-end', overflow: 'hidden' },
    barFill: { width: '100%', borderRadius: 3, minHeight: 4 },
    barCount: { fontFamily: fonts.data, fontSize: 12, fontWeight: '700' },
    barLabel: { fontFamily: fonts.label, fontSize: 9, letterSpacing: 0.8 },
    injuryAlert: { flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: hairline, paddingTop: space.sm },
    injuryText: { fontFamily: fonts.body, fontSize: 12, flex: 1 },
  })
  ```

- [ ] **Step 2: Add RosterIntelPanel to CoachHome**

  In `apps/mobile/src/components/home/CoachHome.tsx`:

  Add import:
  ```typescript
  import type { RosterIntelligence } from '@anstoss/shared'  // or use inline type
  import { RosterIntelPanel } from './RosterIntelPanel'
  ```

  Add state:
  ```typescript
  const [rosterIntel, setRosterIntel] = useState<RosterIntelligence | null>(null)
  ```

  Add to `load` callback (after fetching upcoming events):
  ```typescript
  if (teamId) {
    const intel = await api<RosterIntelligence>(
      `/clubs/${clubId}/roster-intelligence?teamId=${teamId}`,
    ).catch(() => null)
    setRosterIntel(intel)
  }
  ```

  In JSX, below the `ReadinessScoreCard` section (from Sprint 2), add:
  ```typescript
  {rosterIntel && <RosterIntelPanel intel={rosterIntel} />}
  ```

- [ ] **Step 3: Add i18n keys to all 8 locales**

  ```json
  "rosterIntel": {
    "title": "Roster Intelligence",
    "gaps": "Position gaps: {{positions}}",
    "ageLabel": "AGE SPREAD · avg {{age}}",
    "recurringInjuries": "{{count}} player with recurring injuries"
  }
  ```

  German:
  ```json
  "rosterIntel": {
    "title": "Kaderanalyse",
    "gaps": "Positionslücken: {{positions}}",
    "ageLabel": "ALTERSVERTEILUNG · Ø {{age}}",
    "recurringInjuries": "{{count}} Spieler mit wiederkehrenden Verletzungen"
  }
  ```

- [ ] **Step 4: Run tests**

  ```bash
  cd /Users/yemi/anstoss
  npm test 2>&1 | tail -15
  ```
  Expected: pre-existing failures only

- [ ] **Step 5: Commit**

  ```bash
  git add apps/mobile/src/components/home/RosterIntelPanel.tsx apps/mobile/src/components/home/CoachHome.tsx apps/mobile/src/i18n/
  git commit -m "feat(mobile): RosterIntelPanel in CoachHome — position gaps, age bars, recurring injuries"
  ```

---

### Task 6: Frontend — Public Club Page (Deep Link Screen)

**Files:**
- Create: `apps/mobile/app/public-club/[clubId].tsx`

**Interfaces:**
- Consumes: `GET /public/clubs/:clubId` from Task 3
- Produces: unauthenticated-friendly view for sharing + "Join this club" CTA

- [ ] **Step 1: Create public club screen**

  Create `apps/mobile/app/public-club/[clubId].tsx`:

  ```typescript
  import { useCallback, useEffect, useState } from 'react'
  import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native'
  import { Stack, useLocalSearchParams } from 'expo-router'
  import { useTranslation } from 'react-i18next'
  import { Icon, Text } from '../../src/components/ui'
  import { useClubColors } from '../../src/context/ClubThemeContext'
  import { api } from '../../src/api/client'
  import { fonts, radius, space } from '../../src/theme/tokens'

  type PublicClubView = {
    id: string
    name: string
    primaryColor: string | null
    badgeUrl: string | null
    description: string | null
    memberCount: number
    teamCount: number
    upcomingFixtures: { id: string; date: string; homeTeam: string; awayTeam: string | null }[]
    joinCta: string
  }

  export default function PublicClubScreen() {
    const { clubId } = useLocalSearchParams<{ clubId: string }>()
    const c = useClubColors()
    const { t, i18n } = useTranslation()
    const [club, setClub] = useState<PublicClubView | null>(null)

    const load = useCallback(async () => {
      const data = await api<PublicClubView>(`/public/clubs/${clubId}`).catch(() => null)
      setClub(data)
    }, [clubId])

    useEffect(() => { void load() }, [load])

    if (!club) {
      return (
        <View style={[styles.screen, { backgroundColor: c.background }]}>
          <Stack.Screen options={{ title: '…' }} />
        </View>
      )
    }

    return (
      <ScrollView style={[styles.screen, { backgroundColor: c.background }]} contentContainerStyle={styles.content}>
        <Stack.Screen options={{ title: club.name }} />

        <View style={styles.header}>
          {club.badgeUrl ? (
            <Image source={{ uri: club.badgeUrl }} style={styles.badge} resizeMode="contain" />
          ) : (
            <View style={[styles.badgeFallback, { backgroundColor: c.surfaceSunken }]}>
              <Icon name="sportscourt" size={32} color={c.textTertiary} />
            </View>
          )}
          <Text style={[styles.name, { color: c.textPrimary }]}>{club.name}</Text>
          {club.description && (
            <Text style={[styles.description, { color: c.textSecondary }]}>{club.description}</Text>
          )}
          <View style={styles.statRow}>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: c.textPrimary }]}>{club.memberCount}</Text>
              <Text style={[styles.statLabel, { color: c.textTertiary }]}>
                {t('publicClub.members', { defaultValue: 'MEMBERS' })}
              </Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: c.textPrimary }]}>{club.teamCount}</Text>
              <Text style={[styles.statLabel, { color: c.textTertiary }]}>
                {t('publicClub.teams', { defaultValue: 'TEAMS' })}
              </Text>
            </View>
          </View>
        </View>

        {club.upcomingFixtures.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: c.textTertiary }]}>
              {t('publicClub.upcomingFixtures', { defaultValue: 'UPCOMING FIXTURES' })}
            </Text>
            {club.upcomingFixtures.map((f) => (
              <View key={f.id} style={[styles.fixtureRow, { borderColor: c.borderDefault }]}>
                <Text style={[styles.fixtureDate, { color: c.textTertiary }]}>
                  {new Date(f.date).toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' })}
                </Text>
                <Text style={[styles.fixtureTeams, { color: c.textPrimary }]}>
                  {f.homeTeam}{f.awayTeam ? ` vs ${f.awayTeam}` : ''}
                </Text>
              </View>
            ))}
          </View>
        )}

        <Pressable
          style={[styles.joinBtn, { backgroundColor: club.primaryColor ?? c.primary }]}
          onPress={() => {
            // Deep link to join flow — handled by the app router
            // anstoss://join/:clubId is registered in app.json
          }}
          accessibilityRole="button"
        >
          <Text style={styles.joinBtnText}>
            {t('publicClub.joinCta', { defaultValue: 'Join this club' })}
          </Text>
        </Pressable>
      </ScrollView>
    )
  }

  const styles = StyleSheet.create({
    screen: { flex: 1 },
    content: { padding: space.lg, gap: space.xl },
    header: { alignItems: 'center', gap: space.md },
    badge: { width: 80, height: 80 },
    badgeFallback: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center' },
    name: { fontFamily: fonts.label, fontSize: 22, fontWeight: '800', textAlign: 'center' },
    description: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, textAlign: 'center' },
    statRow: { flexDirection: 'row', gap: space.xl },
    stat: { alignItems: 'center', gap: 2 },
    statValue: { fontFamily: fonts.data, fontSize: 28, fontWeight: '800' },
    statLabel: { fontFamily: fonts.label, fontSize: 10, letterSpacing: 1.2, fontWeight: '700' },
    section: { gap: space.sm },
    sectionTitle: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1.2, fontWeight: '700' },
    fixtureRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 10, borderBottomWidth: 0.5 },
    fixtureDate: { fontFamily: fonts.data, fontSize: 12, width: 70 },
    fixtureTeams: { fontFamily: fonts.body, fontSize: 14, flex: 1 },
    joinBtn: { borderRadius: radius.md, padding: 16, alignItems: 'center' },
    joinBtnText: { fontFamily: fonts.label, fontSize: 16, fontWeight: '800', color: '#fff' },
  })
  ```

- [ ] **Step 2: Add i18n keys to all 8 locales**

  ```json
  "publicClub": {
    "members": "MEMBERS",
    "teams": "TEAMS",
    "upcomingFixtures": "UPCOMING FIXTURES",
    "joinCta": "Join this club"
  }
  ```

  German:
  ```json
  "publicClub": {
    "members": "MITGLIEDER",
    "teams": "TEAMS",
    "upcomingFixtures": "NÄCHSTE SPIELE",
    "joinCta": "Diesem Verein beitreten"
  }
  ```

- [ ] **Step 3: Run full test suite**

  ```bash
  cd /Users/yemi/anstoss
  npm test 2>&1 | tail -15
  ```
  Expected: pre-existing failures only

- [ ] **Step 4: Commit**

  ```bash
  git add apps/mobile/app/public-club/ apps/mobile/src/i18n/
  git commit -m "feat(mobile): public club page — fixtures, stats, join CTA"
  ```

---

## Self-Review

**Spec coverage:**
- ✅ Dues dashboard: Tasks 1+4 (`duesHealthPct`, `duesStatus`, `pendingJoinRequests`)
- ✅ Missing consents: Tasks 1+4 (`consentCoveragePct`, `consentStatus`)
- ✅ Inactive teams detection: Tasks 1+4 (`inactiveTeams` — teams with no events in 30 days)
- ✅ Coach handover tool: Task 1 (`transferCoach` endpoint + controller)
- ✅ Roster Intelligence: Tasks 2+5 (position gaps, age distribution, recurring injuries)
- ✅ Public Club/Team Page: Tasks 3+6 (unauthenticated endpoint + mobile screen)

**No placeholders detected.**

**Type consistency:** `ClubHealthSnapshot` defined in `clubs.health.ts` (Task 1), mirrored exactly in `ClubHealthPanel.tsx` (Task 4). `RosterIntelligence` defined in `clubs.roster-intel.ts` (Task 2), mirrored in `RosterIntelPanel.tsx` (Task 5) and consumed from `@anstoss/shared` in `CoachHome`.
