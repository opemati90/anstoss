# Phase 3b — Join Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the slug-exact-match join-club search with a real name-or-city search, fold the legacy `/join.tsx` redirect into the canonical `/join/[...code]` invite surface, add a manual-code entry screen, and turn `/pending-approval` into a proper empty state so every join entry point (invite deep link, search, manual code) converges on the same `preview → confirm → result` pattern defined in spec §4.2.

**Architecture:** Backend gets a new `GET /clubs/search?q=...` endpoint (Zod-validated via `clubSearchQuerySchema` in `@anstoss/shared`) plus an additive Prisma migration adding a nullable `city String?` column on `Club` so search results can render `badge + name + city + member count` per the spec. Mobile rebuilds `app/join-club.tsx` from slug-exact-match into a `SearchBar` + `ListRow` results list that deep-links into a new `app/club/[slug].tsx` preview screen sharing the confirm/result pattern of `app/join/[...code]`. A new `app/join-code.tsx` screen takes a manual invite code and `router.replace`s into `/join/{code}`. `app/join.tsx` is deleted (redundant legacy duplicate). `app/pending-approval.tsx` gets a real empty state with estimated time and a "notify admin" action wired to a new `POST /clubs/:clubId/join-requests/:id/remind` endpoint. Entry to manual-code lives inside `/register/join.tsx` (already shipped in Phase 3a) via a new "Have a code? Enter it" inline link, and search lives inside the new `app/find-club.tsx` entry reachable from `/register/join`.

**Tech Stack:** NestJS controller + service + Prisma (API), Zod (`@anstoss/shared`), Expo Router file-based mobile routes, existing `SearchBar` / `ListRow` / `Card` / `Button` / `Text` / `Icon` UI primitives, `useClubColors()` theme hook, `api()` client wrapper, `react-i18next` (strings added to `en.ts` + `de.ts`). Jest + React Native Testing Library for mobile specs; Jest + Nest `Test.createTestingModule` for API.

---

## File Structure

**New files:**

- `apps/api/prisma/migrations/20260423000000_add_club_city/migration.sql` — additive migration, adds `"city" TEXT` nullable column + btree index to `Club`.
- `apps/api/src/clubs/clubs-search.controller.ts` — `GET /clubs/search?q=&limit=&cursor=`.
- `apps/api/src/clubs/clubs-search.service.ts` — service layer over Prisma for search.
- `apps/api/src/clubs/clubs-search.service.spec.ts` — unit tests.
- `apps/api/src/clubs/clubs-search.controller.spec.ts` — controller-level Zod validation test.
- `apps/api/src/clubs/join-request-reminders.service.spec.ts` — service spec for reminder endpoint.
- `apps/mobile/app/find-club.tsx` — search surface (pill SearchBar + ListRow results).
- `apps/mobile/app/club/[slug].tsx` — club preview + "Request to join" action.
- `apps/mobile/app/join-code.tsx` — manual invite-code entry.
- `apps/mobile/app/__tests__/find-club.spec.tsx` — search render + submit.
- `apps/mobile/app/__tests__/club-slug-preview.spec.tsx` — preview + request-to-join.
- `apps/mobile/app/__tests__/join-code.spec.tsx` — manual-code routing.
- `apps/mobile/app/__tests__/pending-approval.spec.tsx` — empty state + remind action.

**Modified files:**

- `packages/shared/src/schemas/club.ts` — add `clubSearchQuerySchema`, `ClubSearchQuery`, `clubSearchResultSchema`, `ClubSearchResult`.
- `packages/shared/src/schemas/club.spec.ts` — cases for new schemas.
- `apps/api/prisma/schema.prisma` — add `city String?` on `Club` + `@@index([city])`.
- `apps/api/src/clubs/clubs.module.ts` — register new controller + service.
- `apps/api/src/clubs/clubs.service.ts` — extend `findBySlug` return with `memberCount` + `city`.
- `apps/api/src/clubs/join-requests.service.ts` — add `sendReminder(userId, clubId, requestId)` method (5-minute cooldown via Redis key).
- `apps/api/src/clubs/join-requests.controller.ts` — add `POST /clubs/:clubId/join-requests/:id/remind`.
- `apps/api/src/public/public.service.ts` — include `city` in `getClubBySlug` output.
- `apps/mobile/app/join-club.tsx` — REPLACED (full rewrite from slug-lookup to search results list). The file path stays for back-compat with deep links that already reference `/join-club`; body becomes a thin redirect to `/find-club`.
- `apps/mobile/app/join.tsx` — DELETED (legacy duplicate; `/join` deep links already route to `/join/[...code]`).
- `apps/mobile/app/pending-approval.tsx` — replace copy/state with empty-state + remind action.
- `apps/mobile/app/register/join.tsx` — add two inline secondary links: "Search for your club" → `/find-club`, and keep the invite-code input as-is.
- `apps/mobile/src/i18n/en.ts`, `apps/mobile/src/i18n/de.ts` — add `findClub.*`, `clubPreview.*`, `joinCode.*`, `pendingApproval.*` namespaces.
- `apps/mobile/app/__tests__/join-club-auth.spec.tsx` — update expected deep-link target (`/join-club?slug=sv-albatros` now redirects to `/find-club?slug=sv-albatros` or `/club/sv-albatros` depending on whether the slug already resolves).

**Deleted files:**

- `apps/mobile/app/join.tsx` (see Task 7).

---

## Schemas

```typescript
// packages/shared/src/schemas/club.ts — append after existing createJoinRequestSchema

export const clubSearchQuerySchema = z.object({
  q: z.string().trim().min(2, 'Search query must be at least 2 characters').max(80),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().trim().min(1).max(200).optional(),
})

export const clubSearchResultSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  badgeUrl: z.string().url().nullable(),
  primaryColor: z.string(),
  city: z.string().nullable(),
  memberCount: z.number().int().min(0),
})

export const clubSearchResponseSchema = z.object({
  results: z.array(clubSearchResultSchema),
  nextCursor: z.string().nullable(),
})

export type ClubSearchQuery = z.infer<typeof clubSearchQuerySchema>
export type ClubSearchResult = z.infer<typeof clubSearchResultSchema>
export type ClubSearchResponse = z.infer<typeof clubSearchResponseSchema>
```

---

## Task 0: Baseline

**Files:** (none modified)

- [ ] **Step 1: Confirm branch and clean tree**

Run:
```bash
git status
git rev-parse --abbrev-ref HEAD
```
Expected: branch is `feat/revamp-join` (or a similar feature branch cut from `feat/renuir-design-revamp`). If tree is not clean, stash; if branch is wrong:
```bash
git checkout -b feat/revamp-join feat/renuir-design-revamp
```

- [ ] **Step 2: Mobile test baseline**

Run:
```bash
cd apps/mobile && npm test -- --watch=false 2>&1 | tail -30
```
Expected: record the "Tests: X passed, Y failed" line. The four pre-existing failing suites noted in the Phase 3a plan (`home-role-behavior`, `more-tab`, `home-stats-layout`, `admin-dashboard`) may still be red; `join-layout.spec.tsx` and `join-club-auth.spec.tsx` must be GREEN before continuing.

- [ ] **Step 3: API test baseline**

Run:
```bash
cd apps/api && npm test -- --watch=false 2>&1 | tail -20
```
Expected: all suites pass.

- [ ] **Step 4: Typecheck baseline**

Run (independently, so a fail in one does not hide the other):
```bash
cd packages/shared && npx tsc --noEmit
cd apps/api && npx tsc --noEmit
cd apps/mobile && npx tsc --noEmit
```
Expected: all three clean.

- [ ] **Step 5: Record baseline in commit message (no code change)**

No commit — Task 0 is observational. If any expected green test is red, STOP and investigate before starting Task 1.

---

## Task 1: Shared schemas for club search

**Files:**
- Modify: `packages/shared/src/schemas/club.ts`
- Modify: `packages/shared/src/schemas/club.spec.ts`

- [ ] **Step 1: Write failing test cases for `clubSearchQuerySchema` and `clubSearchResultSchema`**

Append to `packages/shared/src/schemas/club.spec.ts`:

```typescript
import {
  clubSearchQuerySchema,
  clubSearchResultSchema,
  clubSearchResponseSchema,
} from './club'

describe('clubSearchQuerySchema', () => {
  it('accepts a minimal query', () => {
    const result = clubSearchQuerySchema.safeParse({ q: 'FC' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.limit).toBe(20)
    }
  })

  it('rejects single-character query', () => {
    const result = clubSearchQuerySchema.safeParse({ q: 'F' })
    expect(result.success).toBe(false)
  })

  it('trims whitespace before length check', () => {
    const result = clubSearchQuerySchema.safeParse({ q: '   FC Bayern   ' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.q).toBe('FC Bayern')
  })

  it('coerces limit from string', () => {
    const result = clubSearchQuerySchema.safeParse({ q: 'FC', limit: '5' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.limit).toBe(5)
  })

  it('rejects limit over 50', () => {
    const result = clubSearchQuerySchema.safeParse({ q: 'FC', limit: 51 })
    expect(result.success).toBe(false)
  })
})

describe('clubSearchResultSchema', () => {
  it('accepts a well-formed result', () => {
    const result = clubSearchResultSchema.safeParse({
      id: 'c1',
      name: 'FC Bayern',
      slug: 'fc-bayern',
      badgeUrl: 'https://cdn.example.com/badge.png',
      primaryColor: '#D50000',
      city: 'Munich',
      memberCount: 42,
    })
    expect(result.success).toBe(true)
  })

  it('accepts null badge and null city', () => {
    const result = clubSearchResultSchema.safeParse({
      id: 'c1',
      name: 'FC',
      slug: 'fc',
      badgeUrl: null,
      primaryColor: '#000000',
      city: null,
      memberCount: 0,
    })
    expect(result.success).toBe(true)
  })

  it('rejects negative memberCount', () => {
    const result = clubSearchResultSchema.safeParse({
      id: 'c1',
      name: 'FC',
      slug: 'fc',
      badgeUrl: null,
      primaryColor: '#000000',
      city: null,
      memberCount: -1,
    })
    expect(result.success).toBe(false)
  })
})

describe('clubSearchResponseSchema', () => {
  it('accepts empty results', () => {
    const result = clubSearchResponseSchema.safeParse({ results: [], nextCursor: null })
    expect(result.success).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd packages/shared && npx jest src/schemas/club.spec.ts 2>&1 | tail -20
```
Expected: FAIL (imports `clubSearchQuerySchema` etc. not exported).

- [ ] **Step 3: Add schemas to `packages/shared/src/schemas/club.ts`**

Append to the bottom of `packages/shared/src/schemas/club.ts`:

```typescript
export const clubSearchQuerySchema = z.object({
  q: z.string().trim().min(2, 'Search query must be at least 2 characters').max(80),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().trim().min(1).max(200).optional(),
})

export const clubSearchResultSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  badgeUrl: z.string().url().nullable(),
  primaryColor: z.string(),
  city: z.string().nullable(),
  memberCount: z.number().int().min(0),
})

export const clubSearchResponseSchema = z.object({
  results: z.array(clubSearchResultSchema),
  nextCursor: z.string().nullable(),
})

export type ClubSearchQuery = z.infer<typeof clubSearchQuerySchema>
export type ClubSearchResult = z.infer<typeof clubSearchResultSchema>
export type ClubSearchResponse = z.infer<typeof clubSearchResponseSchema>
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cd packages/shared && npx jest src/schemas/club.spec.ts 2>&1 | tail -20
```
Expected: PASS (all cases in the append block + all pre-existing cases).

- [ ] **Step 5: Typecheck shared**

Run:
```bash
cd packages/shared && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/schemas/club.ts packages/shared/src/schemas/club.spec.ts
git commit -m "feat(shared): add clubSearchQuery/Result/Response schemas"
```

---

## Task 2: Prisma migration + schema for `Club.city`

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260423000000_add_club_city/migration.sql`

- [ ] **Step 1: Edit `apps/api/prisma/schema.prisma` — add `city` field to `Club`**

Inside the `model Club { ... }` block, between `welcomeText  String?` and `createdAt    DateTime @default(now())`, insert:

```prisma
  city         String?
```

And inside the same model, immediately before the closing brace (after the last relation line `conversations         Conversation[]`), replace the existing line:

```prisma
  @@index([slug])
```

with:

```prisma
  @@index([slug])
  @@index([city])
```

- [ ] **Step 2: Create the migration file**

Create `apps/api/prisma/migrations/20260423000000_add_club_city/migration.sql` with:

```sql
-- AlterTable
ALTER TABLE "Club" ADD COLUMN "city" TEXT;

-- CreateIndex
CREATE INDEX "Club_city_idx" ON "Club"("city");
```

- [ ] **Step 3: Generate Prisma client**

Run:
```bash
cd apps/api && npx prisma generate
```
Expected: `Generated Prisma Client` success message.

- [ ] **Step 4: Typecheck API (Prisma types need regen to compile)**

Run:
```bash
cd apps/api && npx tsc --noEmit
```
Expected: clean (the new `city` field is optional so no existing call-site requires an update yet).

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260423000000_add_club_city
git commit -m "feat(api): add nullable city column on Club with btree index"
```

---

## Task 3: `ClubsSearchService` + controller

**Files:**
- Create: `apps/api/src/clubs/clubs-search.service.ts`
- Create: `apps/api/src/clubs/clubs-search.service.spec.ts`
- Create: `apps/api/src/clubs/clubs-search.controller.ts`
- Create: `apps/api/src/clubs/clubs-search.controller.spec.ts`
- Modify: `apps/api/src/clubs/clubs.module.ts`

- [ ] **Step 1: Write failing service spec**

Create `apps/api/src/clubs/clubs-search.service.spec.ts`:

```typescript
import { ClubsSearchService } from './clubs-search.service'

describe('ClubsSearchService.search', () => {
  function mockPrisma(rows: Array<Record<string, unknown>>) {
    return {
      club: {
        findMany: jest.fn().mockResolvedValue(rows),
      },
    } as unknown as Parameters<typeof makeService>[0]
  }

  function makeService(prisma: Parameters<typeof ClubsSearchService['prototype']['search']>) {
    return new ClubsSearchService(prisma as never)
  }

  it('returns results with memberCount flattened', async () => {
    const prisma = mockPrisma([
      {
        id: 'c1',
        name: 'FC Bayern',
        slug: 'fc-bayern',
        badgeUrl: 'https://cdn/b.png',
        primaryColor: '#D50000',
        city: 'Munich',
        _count: { memberships: 42 },
      },
    ])
    const svc = new ClubsSearchService(prisma as never)

    const res = await svc.search({ q: 'bayern', limit: 20 })

    expect(res.results).toHaveLength(1)
    expect(res.results[0]).toEqual({
      id: 'c1',
      name: 'FC Bayern',
      slug: 'fc-bayern',
      badgeUrl: 'https://cdn/b.png',
      primaryColor: '#D50000',
      city: 'Munich',
      memberCount: 42,
    })
    expect(res.nextCursor).toBeNull()
  })

  it('queries name OR city case-insensitively', async () => {
    const prisma = mockPrisma([])
    const svc = new ClubsSearchService(prisma as never)

    await svc.search({ q: 'Berlin', limit: 20 })

    const findMany = (prisma as unknown as { club: { findMany: jest.Mock } }).club.findMany
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { name: { contains: 'Berlin', mode: 'insensitive' } },
            { city: { contains: 'Berlin', mode: 'insensitive' } },
          ],
        },
        take: 21, // limit + 1 for cursor detection
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
    )
  })

  it('sets nextCursor to last id when rows overflow limit', async () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({
      id: `c${i}`,
      name: `Club ${i}`,
      slug: `club-${i}`,
      badgeUrl: null,
      primaryColor: '#000000',
      city: null,
      _count: { memberships: 0 },
    }))
    const prisma = mockPrisma(rows)
    const svc = new ClubsSearchService(prisma as never)

    const res = await svc.search({ q: 'club', limit: 20 })

    expect(res.results).toHaveLength(20)
    expect(res.nextCursor).toBe('c19')
  })

  it('applies cursor via skip:1 + cursor', async () => {
    const prisma = mockPrisma([])
    const svc = new ClubsSearchService(prisma as never)

    await svc.search({ q: 'FC', limit: 20, cursor: 'c19' })

    const findMany = (prisma as unknown as { club: { findMany: jest.Mock } }).club.findMany
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: { id: 'c19' },
        skip: 1,
      }),
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd apps/api && npx jest src/clubs/clubs-search.service.spec.ts 2>&1 | tail -20
```
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `clubs-search.service.ts`**

Create `apps/api/src/clubs/clubs-search.service.ts`:

```typescript
import { Injectable } from '@nestjs/common'
import type { ClubSearchQuery, ClubSearchResponse } from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class ClubsSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: ClubSearchQuery): Promise<ClubSearchResponse> {
    const { q, limit, cursor } = query

    const rows = await this.prisma.club.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { city: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        name: true,
        slug: true,
        badgeUrl: true,
        primaryColor: true,
        city: true,
        _count: { select: { memberships: true } },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })

    const hasMore = rows.length > limit
    const sliced = hasMore ? rows.slice(0, limit) : rows
    const nextCursor = hasMore ? sliced[sliced.length - 1].id : null

    return {
      results: sliced.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        badgeUrl: r.badgeUrl,
        primaryColor: r.primaryColor,
        city: r.city,
        memberCount: r._count.memberships,
      })),
      nextCursor,
    }
  }
}
```

- [ ] **Step 4: Run service test to verify it passes**

Run:
```bash
cd apps/api && npx jest src/clubs/clubs-search.service.spec.ts 2>&1 | tail -20
```
Expected: PASS (4 tests).

- [ ] **Step 5: Write failing controller spec**

Create `apps/api/src/clubs/clubs-search.controller.spec.ts`:

```typescript
import { BadRequestException } from '@nestjs/common'
import { ClubsSearchController } from './clubs-search.controller'
import { ClubsSearchService } from './clubs-search.service'

describe('ClubsSearchController', () => {
  function makeController(search: jest.Mock) {
    const svc = { search } as unknown as ClubsSearchService
    return new ClubsSearchController(svc)
  }

  it('validates query via Zod and calls service', async () => {
    const search = jest.fn().mockResolvedValue({ results: [], nextCursor: null })
    const ctrl = makeController(search)

    const out = await ctrl.search({ q: 'bayern', limit: '5' as unknown as number })

    expect(search).toHaveBeenCalledWith({ q: 'bayern', limit: 5 })
    expect(out).toEqual({ results: [], nextCursor: null })
  })

  it('rejects single-character query', async () => {
    const search = jest.fn()
    const ctrl = makeController(search)

    await expect(ctrl.search({ q: 'F' })).rejects.toThrow()
    expect(search).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 6: Run controller test to verify it fails**

Run:
```bash
cd apps/api && npx jest src/clubs/clubs-search.controller.spec.ts 2>&1 | tail -20
```
Expected: FAIL.

- [ ] **Step 7: Implement `clubs-search.controller.ts`**

Create `apps/api/src/clubs/clubs-search.controller.ts`:

```typescript
import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { clubSearchQuerySchema } from '@anstoss/shared'
import { ClubsSearchService } from './clubs-search.service'

@Controller('clubs')
@UseGuards(ClerkAuthGuard)
export class ClubsSearchController {
  constructor(private readonly search: ClubsSearchService) {}

  /**
   * GET /clubs/search?q=&limit=&cursor= — authenticated club search.
   * Case-insensitive contains match on name + city.
   */
  @Get('search')
  @RateLimit('read')
  async searchClubs(@Query() raw: Record<string, unknown>) {
    const query = clubSearchQuerySchema.parse(raw)
    return this.search.search(query)
  }
}
```

> **Note:** The controller method is named `searchClubs` but the spec test uses `search`. Update the spec call to `searchClubs` before running:

Rewrite the two test `await ctrl.search(...)` calls to `await ctrl.searchClubs(...)`. Save, then:

- [ ] **Step 8: Run controller test to verify it passes**

Run:
```bash
cd apps/api && npx jest src/clubs/clubs-search.controller.spec.ts 2>&1 | tail -20
```
Expected: PASS (2 tests).

- [ ] **Step 9: Register controller + service in `clubs.module.ts`**

Edit `apps/api/src/clubs/clubs.module.ts`:

```typescript
import { Module } from '@nestjs/common'
import { ClubsController } from './clubs.controller'
import { JoinRequestsController } from './join-requests.controller'
import { ClubsSearchController } from './clubs-search.controller'
import { ClubsService } from './clubs.service'
import { JoinRequestsService } from './join-requests.service'
import { ClubsSearchService } from './clubs-search.service'
import { PushModule } from '../push/push.module'
import { AuditModule } from '../audit/audit.module'

@Module({
  imports: [PushModule, AuditModule],
  controllers: [ClubsController, JoinRequestsController, ClubsSearchController],
  providers: [ClubsService, JoinRequestsService, ClubsSearchService],
  exports: [ClubsService],
})
export class ClubsModule {}
```

- [ ] **Step 10: Full API test + typecheck**

Run:
```bash
cd apps/api && npx tsc --noEmit && npm test -- --watch=false 2>&1 | tail -20
```
Expected: clean typecheck, all tests pass.

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/clubs/clubs-search.controller.ts apps/api/src/clubs/clubs-search.controller.spec.ts apps/api/src/clubs/clubs-search.service.ts apps/api/src/clubs/clubs-search.service.spec.ts apps/api/src/clubs/clubs.module.ts
git commit -m "feat(api): add GET /clubs/search for name+city lookup"
```

---

## Task 4: Extend public club-by-slug to return `city` + `memberCount`

**Files:**
- Modify: `apps/api/src/public/public.service.ts`
- Create: `apps/api/src/public/public.service.spec.ts` (if absent)

- [ ] **Step 1: Write failing test for `getClubBySlug` returning city**

Create `apps/api/src/public/public.service.spec.ts` (or append if file exists):

```typescript
import { NotFoundException } from '@nestjs/common'
import { PublicService } from './public.service'

describe('PublicService.getClubBySlug', () => {
  it('returns city alongside member + team count', async () => {
    const prisma = {
      club: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'c1',
          name: 'FC Bayern',
          slug: 'fc-bayern',
          badgeUrl: null,
          primaryColor: '#D50000',
          city: 'Munich',
          _count: { memberships: 10, teams: 3 },
        }),
      },
    }

    const svc = new PublicService(
      {} as never,
      {} as never,
      prisma as never,
    )

    const result = await svc.getClubBySlug('fc-bayern')

    expect(result).toEqual({
      id: 'c1',
      name: 'FC Bayern',
      slug: 'fc-bayern',
      badgeUrl: null,
      primaryColor: '#D50000',
      city: 'Munich',
      memberCount: 10,
      teamCount: 3,
    })
  })

  it('throws NotFound when slug missing', async () => {
    const prisma = {
      club: { findUnique: jest.fn().mockResolvedValue(null) },
    }
    const svc = new PublicService({} as never, {} as never, prisma as never)

    await expect(svc.getClubBySlug('nope')).rejects.toBeInstanceOf(NotFoundException)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd apps/api && npx jest src/public/public.service.spec.ts 2>&1 | tail -20
```
Expected: FAIL (current `getClubBySlug` does not select/return `city`).

- [ ] **Step 3: Update `public.service.ts`**

In `apps/api/src/public/public.service.ts`, edit `getClubBySlug` to select `city` and include it in the return:

```typescript
  async getClubBySlug(slug: string) {
    const club = await this.prisma.club.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        badgeUrl: true,
        primaryColor: true,
        city: true,
        _count: { select: { memberships: true, teams: true } },
      },
    })

    if (!club) {
      throw new NotFoundException('Club not found')
    }

    return {
      id: club.id,
      name: club.name,
      slug: club.slug,
      badgeUrl: club.badgeUrl,
      primaryColor: club.primaryColor,
      city: club.city,
      memberCount: club._count.memberships,
      teamCount: club._count.teams,
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cd apps/api && npx jest src/public/public.service.spec.ts 2>&1 | tail -20
```
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/public/public.service.ts apps/api/src/public/public.service.spec.ts
git commit -m "feat(api): include city in GET /public/clubs/:slug response"
```

---

## Task 5: Join-request reminder endpoint

**Files:**
- Modify: `apps/api/src/clubs/join-requests.service.ts`
- Modify: `apps/api/src/clubs/join-requests.controller.ts`
- Create: `apps/api/src/clubs/join-request-reminders.service.spec.ts`

- [ ] **Step 1: Write failing service spec**

Create `apps/api/src/clubs/join-request-reminders.service.spec.ts`:

```typescript
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { JoinRequestsService } from './join-requests.service'

describe('JoinRequestsService.sendReminder', () => {
  function makeService(overrides: {
    findJoinRequest?: jest.Mock
    findAdminUserIds?: jest.Mock
    cacheGet?: jest.Mock
    cacheSet?: jest.Mock
    pushSend?: jest.Mock
  } = {}) {
    const prisma = {
      joinRequest: {
        findFirst: overrides.findJoinRequest ?? jest.fn().mockResolvedValue({
          id: 'jr1',
          userId: 'u1',
          clubId: 'c1',
          status: 'PENDING',
          club: { name: 'FC Bayern' },
        }),
      },
      membership: {
        findMany: overrides.findAdminUserIds ?? jest.fn().mockResolvedValue([
          { userId: 'admin1' },
          { userId: 'admin2' },
        ]),
      },
    }

    const cache = {
      get: overrides.cacheGet ?? jest.fn().mockResolvedValue(null),
      set: overrides.cacheSet ?? jest.fn().mockResolvedValue('OK'),
    }

    const push = {
      sendToUsers: overrides.pushSend ?? jest.fn().mockResolvedValue(undefined),
    }

    const audit = { log: jest.fn().mockResolvedValue(undefined) }

    return {
      service: new JoinRequestsService(
        prisma as never,
        cache as never,
        push as never,
        audit as never,
      ),
      prisma,
      cache,
      push,
    }
  }

  it('sends a push to all club ADMIN/OWNER users when no cooldown', async () => {
    const { service, push, cache } = makeService()

    await service.sendReminder('u1', 'c1', 'jr1')

    expect(push.sendToUsers).toHaveBeenCalledWith(
      ['admin1', 'admin2'],
      expect.objectContaining({
        title: expect.any(String),
        body: expect.stringContaining('FC Bayern'),
      }),
    )
    expect(cache.set).toHaveBeenCalledWith(
      'join-request-reminder:jr1',
      '1',
      'EX',
      5 * 60,
    )
  })

  it('throws BadRequest when cooldown still active', async () => {
    const { service } = makeService({
      cacheGet: jest.fn().mockResolvedValue('1'),
    })

    await expect(service.sendReminder('u1', 'c1', 'jr1')).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })

  it('throws NotFound when request does not belong to user', async () => {
    const { service } = makeService({
      findJoinRequest: jest.fn().mockResolvedValue(null),
    })

    await expect(service.sendReminder('u1', 'c1', 'jr1')).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd apps/api && npx jest src/clubs/join-request-reminders.service.spec.ts 2>&1 | tail -20
```
Expected: FAIL (`sendReminder` does not exist yet).

- [ ] **Step 3: Inspect the current `JoinRequestsService` constructor**

Run:
```bash
head -40 apps/api/src/clubs/join-requests.service.ts
```
Note the exact constructor signature. The spec above assumes `(prisma, cache, push, audit)`. If the real constructor differs, adapt the spec's `makeService` call but keep the test assertions identical.

- [ ] **Step 4: Add `sendReminder` method to `JoinRequestsService`**

In `apps/api/src/clubs/join-requests.service.ts`, add (near other methods):

```typescript
async sendReminder(userId: string, clubId: string, requestId: string) {
  const request = await this.prisma.joinRequest.findFirst({
    where: { id: requestId, clubId, userId, status: 'PENDING' },
    include: { club: { select: { name: true } } },
  })
  if (!request) {
    throw new NotFoundException('Join request not found')
  }

  const cooldownKey = `join-request-reminder:${requestId}`
  const existing = await this.cache.get(cooldownKey)
  if (existing) {
    throw new BadRequestException('You already sent a reminder in the last 5 minutes')
  }

  const admins = await this.prisma.membership.findMany({
    where: {
      clubId,
      role: { in: ['OWNER', 'ADMIN'] as never },
    },
    select: { userId: true },
  })

  await this.push.sendToUsers(
    admins.map((a) => a.userId),
    {
      title: 'Join request reminder',
      body: `Someone is waiting for approval to join ${request.club.name}.`,
      data: { kind: 'JOIN_REQUEST_REMINDER', clubId, requestId },
    },
  )

  await this.cache.set(cooldownKey, '1', 'EX', 5 * 60)
}
```

Add the imports at the top if missing:

```typescript
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
```

- [ ] **Step 5: Run service test to verify it passes**

Run:
```bash
cd apps/api && npx jest src/clubs/join-request-reminders.service.spec.ts 2>&1 | tail -20
```
Expected: PASS (3 tests).

- [ ] **Step 6: Wire the controller route**

In `apps/api/src/clubs/join-requests.controller.ts`, after the `rejectRequest` handler, add:

```typescript
  /**
   * POST /clubs/:clubId/join-requests/:id/remind — nudge club admins.
   * 5-minute cooldown enforced via Redis.
   */
  @Post(':clubId/join-requests/:id/remind')
  @UseGuards(ClerkAuthGuard, AgeGateGuard)
  @RateLimit('write')
  async remindJoinRequest(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Param('id') requestId: string,
  ) {
    await this.joinRequests.sendReminder(user.id, clubId, requestId)
    return { ok: true }
  }
```

- [ ] **Step 7: API typecheck + full test**

Run:
```bash
cd apps/api && npx tsc --noEmit && npm test -- --watch=false 2>&1 | tail -20
```
Expected: clean + all tests pass.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/clubs/join-requests.service.ts apps/api/src/clubs/join-requests.controller.ts apps/api/src/clubs/join-request-reminders.service.spec.ts
git commit -m "feat(api): POST /clubs/:clubId/join-requests/:id/remind with 5m cooldown"
```

---

## Task 6: Mobile — `app/find-club.tsx` search surface

**Files:**
- Create: `apps/mobile/app/find-club.tsx`
- Create: `apps/mobile/app/__tests__/find-club.spec.tsx`
- Modify: `apps/mobile/src/i18n/en.ts`
- Modify: `apps/mobile/src/i18n/de.ts`

- [ ] **Step 1: Add i18n keys (English)**

Append to `apps/mobile/src/i18n/en.ts` inside the translation object (before the closing brace of the `en` export):

```typescript
  findClub: {
    title: 'Find your club',
    subtitle: 'Search by club name or city. Tap a result to see details.',
    searchPlaceholder: 'Club name or city',
    empty: 'No clubs match that search. Try a different name or city.',
    startTyping: 'Start typing to search German amateur clubs.',
    memberCount_one: '{{count}} member',
    memberCount_other: '{{count}} members',
    loadError: 'Could not load clubs. Try again.',
    retry: 'Try again',
    requestToJoin: 'Request to join',
  },
  clubPreview: {
    title: 'Club details',
    requestToJoin: 'Request to join',
    alreadyMember: 'You are already a member of this club.',
    requestError: 'Could not submit request. Try again.',
    memberCount_one: '{{count}} member',
    memberCount_other: '{{count}} members',
    teamCount_one: '{{count}} team',
    teamCount_other: '{{count}} teams',
  },
  joinCode: {
    title: 'Enter your invite code',
    subtitle: 'Paste or type the short code your coach or club admin shared.',
    placeholder: 'Invite code',
    continue: 'Continue',
    invalid: 'Enter at least 4 characters.',
    notFound: 'No invite matches that code. Check the code or ask for a new one.',
  },
  pendingApproval: {
    eyebrow: 'AWAITING APPROVAL',
    title: 'Your request is with the club',
    body: 'Most clubs reply within 1–2 days. You will see this screen clear automatically once an admin approves you.',
    ageGateBody: 'We emailed {{email}} to confirm your age. You can keep using the app as soon as they approve.',
    remindCta: 'Ping the club admin',
    remindSuccess: 'We let the admin know.',
    remindCooldown: 'You already pinged them. Try again in a few minutes.',
    checkStatus: 'Check again',
    signOut: 'Sign out',
  },
```

- [ ] **Step 2: Mirror keys into `apps/mobile/src/i18n/de.ts`**

Append the same block, translated:

```typescript
  findClub: {
    title: 'Verein finden',
    subtitle: 'Suche nach Vereinsname oder Stadt. Tippe ein Ergebnis an.',
    searchPlaceholder: 'Vereinsname oder Stadt',
    empty: 'Keine Vereine gefunden. Versuch es mit einem anderen Namen oder einer anderen Stadt.',
    startTyping: 'Beginne zu tippen, um deutsche Amateurvereine zu suchen.',
    memberCount_one: '{{count}} Mitglied',
    memberCount_other: '{{count}} Mitglieder',
    loadError: 'Vereine konnten nicht geladen werden. Versuche es erneut.',
    retry: 'Erneut versuchen',
    requestToJoin: 'Mitgliedschaft anfragen',
  },
  clubPreview: {
    title: 'Vereinsdetails',
    requestToJoin: 'Mitgliedschaft anfragen',
    alreadyMember: 'Du bist bereits Mitglied dieses Vereins.',
    requestError: 'Anfrage konnte nicht gesendet werden. Versuche es erneut.',
    memberCount_one: '{{count}} Mitglied',
    memberCount_other: '{{count}} Mitglieder',
    teamCount_one: '{{count}} Mannschaft',
    teamCount_other: '{{count}} Mannschaften',
  },
  joinCode: {
    title: 'Einladungscode eingeben',
    subtitle: 'Füge den kurzen Code ein, den dein Trainer oder Vereinsadmin geteilt hat.',
    placeholder: 'Einladungscode',
    continue: 'Weiter',
    invalid: 'Gib mindestens 4 Zeichen ein.',
    notFound: 'Kein passender Code. Prüfe den Code oder bitte um einen neuen.',
  },
  pendingApproval: {
    eyebrow: 'WARTET AUF FREIGABE',
    title: 'Deine Anfrage liegt beim Verein',
    body: 'Die meisten Vereine antworten innerhalb von 1–2 Tagen. Dieser Bildschirm verschwindet automatisch, sobald ein Admin dich freigibt.',
    ageGateBody: 'Wir haben {{email}} angeschrieben, um dein Alter zu bestätigen. Du kannst die App nutzen, sobald freigegeben.',
    remindCta: 'Admin anstupsen',
    remindSuccess: 'Wir haben den Admin benachrichtigt.',
    remindCooldown: 'Du hast bereits angestupst. Versuche es in ein paar Minuten erneut.',
    checkStatus: 'Erneut prüfen',
    signOut: 'Abmelden',
  },
```

- [ ] **Step 3: Write failing spec for `find-club.tsx`**

Create `apps/mobile/app/__tests__/find-club.spec.tsx`:

```tsx
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import FindClubScreen from '../find-club'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: jest.fn() },
  useLocalSearchParams: () => ({}),
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { count?: number }) => {
      if (opts?.count != null && key.includes('memberCount')) {
        return `${opts.count} members`
      }
      const map: Record<string, string> = {
        'findClub.title': 'Find your club',
        'findClub.searchPlaceholder': 'Club name or city',
        'findClub.empty': 'No clubs match',
        'findClub.startTyping': 'Start typing to search',
      }
      return map[key] ?? key
    },
  }),
}))

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, isSignedIn: true, isLoading: false }),
}))

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))

const mockApi = jest.fn()
jest.mock('../../src/api/client', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class extends Error {},
}))

describe('FindClubScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders an empty-state hint before the user types', () => {
    const { getByText } = render(<FindClubScreen />)
    expect(getByText('Start typing to search')).toBeTruthy()
  })

  it('fetches results when query >= 2 chars and renders them', async () => {
    mockApi.mockResolvedValueOnce({
      results: [
        {
          id: 'c1',
          name: 'FC Bayern',
          slug: 'fc-bayern',
          badgeUrl: null,
          primaryColor: '#D50000',
          city: 'Munich',
          memberCount: 42,
        },
      ],
      nextCursor: null,
    })

    const { getByPlaceholderText, findByText } = render(<FindClubScreen />)
    fireEvent.changeText(getByPlaceholderText('Club name or city'), 'FC')

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith(
        expect.stringContaining('/clubs/search?q=FC'),
      )
    })

    expect(await findByText('FC Bayern')).toBeTruthy()
    expect(await findByText(/Munich/i)).toBeTruthy()
    expect(await findByText(/42 members/i)).toBeTruthy()
  })

  it('tapping a result pushes to /club/[slug]', async () => {
    mockApi.mockResolvedValueOnce({
      results: [
        {
          id: 'c1',
          name: 'FC Bayern',
          slug: 'fc-bayern',
          badgeUrl: null,
          primaryColor: '#D50000',
          city: 'Munich',
          memberCount: 42,
        },
      ],
      nextCursor: null,
    })

    const { getByPlaceholderText, findByText } = render(<FindClubScreen />)
    fireEvent.changeText(getByPlaceholderText('Club name or city'), 'FC')
    const row = await findByText('FC Bayern')
    fireEvent.press(row)

    expect(mockPush).toHaveBeenCalledWith('/club/fc-bayern')
  })

  it('shows empty state when results array is empty', async () => {
    mockApi.mockResolvedValueOnce({ results: [], nextCursor: null })
    const { getByPlaceholderText, findByText } = render(<FindClubScreen />)
    fireEvent.changeText(getByPlaceholderText('Club name or city'), 'XX')
    expect(await findByText('No clubs match')).toBeTruthy()
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run:
```bash
cd apps/mobile && npm test -- --testPathPattern='find-club.spec' --watch=false 2>&1 | tail -20
```
Expected: FAIL (module not found).

- [ ] **Step 5: Implement `app/find-club.tsx`**

Create `apps/mobile/app/find-club.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Image, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { ClubSearchResponse, ClubSearchResult } from '@anstoss/shared'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { Screen, SearchBar, ListRow, Text } from '../src/components/ui'
import { useClubColors } from '../src/context/ClubThemeContext'
import { hairline, radius, space } from '../src/theme/tokens'

const MIN_QUERY_LEN = 2
const DEBOUNCE_MS = 300

export default function FindClubScreen() {
  const { t } = useTranslation()
  const c = useClubColors()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ClubSearchResult[]>([])
  const [isLoading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < MIN_QUERY_LEN) {
      setResults([])
      setHasSearched(false)
      setError(null)
      return
    }

    let cancelled = false
    const handle = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await api<ClubSearchResponse>(
          `/clubs/search?q=${encodeURIComponent(trimmed)}`,
        )
        if (cancelled) return
        setResults(res.results)
        setHasSearched(true)
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : t('findClub.loadError'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [query, t])

  const renderEmpty = () => {
    if (isLoading) return null
    if (!hasSearched) {
      return <EmptyHint text={t('findClub.startTyping')} />
    }
    if (error) {
      return <EmptyHint text={error} />
    }
    return <EmptyHint text={t('findClub.empty')} />
  }

  return (
    <Screen header={<ModalHeader title={t('findClub.title')} />} padded={false}>
      <View style={styles.container}>
        <View style={styles.searchWrap}>
          <SearchBar
            value={query}
            onChangeText={setQuery}
            placeholder={t('findClub.searchPlaceholder')}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="search"
            testID="find-club-search"
          />
        </View>

        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={renderEmpty}
          ListHeaderComponent={isLoading ? <LoadingRow color={c.textTertiary} /> : null}
          renderItem={({ item }) => (
            <ListRow
              testID={`find-club-row-${item.slug}`}
              title={item.name}
              subtitle={buildSubtitle(item, t)}
              onPress={() => router.push(`/club/${item.slug}`)}
              showChevron
              left={<BadgeThumb club={item} />}
            />
          )}
        />
      </View>
    </Screen>
  )
}

function buildSubtitle(c: ClubSearchResult, t: (k: string, o?: { count?: number }) => string) {
  const parts: string[] = []
  if (c.city) parts.push(c.city)
  parts.push(t('findClub.memberCount', { count: c.memberCount }))
  return parts.join(' · ')
}

function BadgeThumb({ club }: { club: ClubSearchResult }) {
  const c = useClubColors()
  if (club.badgeUrl) {
    return (
      <Image
        source={{ uri: club.badgeUrl }}
        style={[styles.badge, { backgroundColor: c.background, borderColor: c.borderDefault }]}
        resizeMode="contain"
      />
    )
  }
  return (
    <View
      style={[
        styles.badgeFallback,
        { backgroundColor: club.primaryColor, borderColor: c.borderDefault },
      ]}
    >
      <Text variant="label" color="inverse">
        {club.name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase()}
      </Text>
    </View>
  )
}

function EmptyHint({ text }: { text: string }) {
  const c = useClubColors()
  return (
    <View style={styles.empty}>
      <Text variant="body" color="secondary" align="center" style={{ color: c.textSecondary }}>
        {text}
      </Text>
    </View>
  )
}

function LoadingRow({ color }: { color: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="small" color={color} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchWrap: { paddingHorizontal: space.lg, paddingVertical: space.sm },
  listContent: { paddingHorizontal: space.lg, paddingBottom: space['2xl'], gap: space.xs },
  empty: { padding: space['2xl'], alignItems: 'center', justifyContent: 'center' },
  loading: { paddingVertical: space.md, alignItems: 'center' },
  badge: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: hairline,
  },
  badgeFallback: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
```

- [ ] **Step 6: Run test to verify it passes**

Run:
```bash
cd apps/mobile && npm test -- --testPathPattern='find-club.spec' --watch=false 2>&1 | tail -20
```
Expected: PASS (4 tests).

- [ ] **Step 7: Mobile typecheck**

Run:
```bash
cd apps/mobile && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/app/find-club.tsx apps/mobile/app/__tests__/find-club.spec.tsx apps/mobile/src/i18n/en.ts apps/mobile/src/i18n/de.ts
git commit -m "feat(mobile): club search screen with name+city results list"
```

---

## Task 7: Mobile — `app/club/[slug].tsx` preview + request flow

**Files:**
- Create: `apps/mobile/app/club/[slug].tsx`
- Create: `apps/mobile/app/__tests__/club-slug-preview.spec.tsx`

- [ ] **Step 1: Write failing spec**

Create `apps/mobile/app/__tests__/club-slug-preview.spec.tsx`:

```tsx
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import ClubPreview from '../club/[slug]'

const mockReplace = jest.fn()
const mockBack = jest.fn()
jest.mock('expo-router', () => ({
  router: { replace: (...a: unknown[]) => mockReplace(...a), back: () => mockBack() },
  useLocalSearchParams: () => ({ slug: 'fc-bayern' }),
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { count?: number }) => {
      if (opts?.count != null) return `${opts.count} x ${key}`
      const map: Record<string, string> = {
        'clubPreview.title': 'Club details',
        'clubPreview.requestToJoin': 'Request to join',
        'clubPreview.alreadyMember': 'Already a member',
      }
      return map[key] ?? key
    },
  }),
}))

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1' },
    isSignedIn: true,
    memberships: [],
    isLoading: false,
  }),
}))

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))

const mockApi = jest.fn()
jest.mock('../../src/api/client', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class extends Error {},
}))

describe('ClubPreview', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders the club hero after fetch', async () => {
    mockApi.mockResolvedValueOnce({
      id: 'c1',
      name: 'FC Bayern',
      slug: 'fc-bayern',
      badgeUrl: null,
      primaryColor: '#D50000',
      city: 'Munich',
      memberCount: 42,
      teamCount: 5,
    })

    const { findByText } = render(<ClubPreview />)

    expect(await findByText('FC Bayern')).toBeTruthy()
    expect(await findByText(/Munich/i)).toBeTruthy()
  })

  it('submits a join request and navigates to pending-approval', async () => {
    mockApi
      .mockResolvedValueOnce({
        id: 'c1',
        name: 'FC Bayern',
        slug: 'fc-bayern',
        badgeUrl: null,
        primaryColor: '#D50000',
        city: 'Munich',
        memberCount: 42,
        teamCount: 5,
      })
      .mockResolvedValueOnce({ id: 'jr1', status: 'PENDING' })

    const { findByText } = render(<ClubPreview />)
    const cta = await findByText('Request to join')
    fireEvent.press(cta)

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith(
        '/clubs/c1/join-requests',
        expect.objectContaining({ method: 'POST' }),
      )
      expect(mockReplace).toHaveBeenCalledWith('/pending-approval')
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd apps/mobile && npm test -- --testPathPattern='club-slug-preview.spec' --watch=false 2>&1 | tail -20
```
Expected: FAIL.

- [ ] **Step 3: Implement `app/club/[slug].tsx`**

Create `apps/mobile/app/club/[slug].tsx`:

```tsx
import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Image, StyleSheet, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { api, ApiError } from '../../src/api/client'
import { useAuth } from '../../src/context/AuthContext'
import { ModalHeader } from '../../src/components/ModalHeader'
import { Screen, Card, Button, Text } from '../../src/components/ui'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { hairline, radius, space } from '../../src/theme/tokens'

type ClubPublic = {
  id: string
  name: string
  slug: string
  badgeUrl: string | null
  primaryColor: string
  city: string | null
  memberCount: number
  teamCount: number
}

export default function ClubPreview() {
  const { t } = useTranslation()
  const { slug: slugParam } = useLocalSearchParams<{ slug?: string | string[] }>()
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam
  const { memberships } = useAuth()
  const c = useClubColors()

  const [club, setClub] = useState<ClubPublic | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!slug) {
      setError(t('common.error'))
      setLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await api<ClubPublic>(`/public/clubs/${slug}`)
        if (!cancelled) setClub(res)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : t('common.error'))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug, t])

  const alreadyMember = !!club && memberships.some((m) => m.club?.id === club.id)

  const handleRequest = async () => {
    if (!club) return
    setSubmitting(true)
    try {
      await api(`/clubs/${club.id}/join-requests`, {
        method: 'POST',
        body: { role: 'PLAYER' },
      })
      router.replace('/pending-approval')
    } catch (e) {
      const msg = e instanceof ApiError && e.message ? e.message : t('clubPreview.requestError')
      Alert.alert(t('common.error'), msg)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <Screen header={<ModalHeader title={t('clubPreview.title')} />}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={c.textSecondary} />
        </View>
      </Screen>
    )
  }

  if (error || !club) {
    return (
      <Screen header={<ModalHeader title={t('clubPreview.title')} />}>
        <View style={styles.center}>
          <Text variant="body" color="secondary" align="center">
            {error || t('common.error')}
          </Text>
        </View>
      </Screen>
    )
  }

  return (
    <Screen header={<ModalHeader title={t('clubPreview.title')} />} padded={false} scroll>
      <View style={styles.content}>
        <Card padding="card" style={{ gap: space.md }}>
          <View style={styles.hero}>
            {club.badgeUrl ? (
              <Image
                source={{ uri: club.badgeUrl }}
                style={[styles.badge, { backgroundColor: c.background, borderColor: c.borderDefault }]}
                resizeMode="contain"
              />
            ) : (
              <View
                style={[
                  styles.badgeFallback,
                  { backgroundColor: club.primaryColor, borderColor: c.borderDefault },
                ]}
              >
                <Text variant="title3" color="inverse">
                  {club.name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={{ flex: 1, gap: space.xs }}>
              <Text variant="title2" color="primary">{club.name}</Text>
              {club.city ? (
                <Text variant="footnote" color="secondary">{club.city}</Text>
              ) : null}
            </View>
          </View>

          <View style={styles.stats}>
            <Text variant="footnote" color="secondary">
              {t('clubPreview.memberCount', { count: club.memberCount })}
            </Text>
            <Text variant="footnote" color="tertiary"> · </Text>
            <Text variant="footnote" color="secondary">
              {t('clubPreview.teamCount', { count: club.teamCount })}
            </Text>
          </View>
        </Card>

        {alreadyMember ? (
          <Text variant="body" color="secondary" align="center" style={{ marginTop: space.md }}>
            {t('clubPreview.alreadyMember')}
          </Text>
        ) : (
          <Button
            label={t('clubPreview.requestToJoin')}
            variant="filled"
            size="lg"
            fullWidth
            loading={submitting}
            onPress={() => void handleRequest()}
            style={{ marginTop: space.md }}
            testID="club-preview-request-to-join"
          />
        )}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  content: { padding: space.lg, gap: space.md },
  hero: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  badge: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    borderWidth: hairline,
  },
  badgeFallback: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stats: { flexDirection: 'row', alignItems: 'center' },
})
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cd apps/mobile && npm test -- --testPathPattern='club-slug-preview.spec' --watch=false 2>&1 | tail -20
```
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/club/[slug].tsx apps/mobile/app/__tests__/club-slug-preview.spec.tsx
git commit -m "feat(mobile): club slug preview with request-to-join action"
```

---

## Task 8: Mobile — manual invite code screen (`app/join-code.tsx`)

**Files:**
- Create: `apps/mobile/app/join-code.tsx`
- Create: `apps/mobile/app/__tests__/join-code.spec.tsx`

- [ ] **Step 1: Write failing spec**

Create `apps/mobile/app/__tests__/join-code.spec.tsx`:

```tsx
import { fireEvent, render } from '@testing-library/react-native'
import JoinCodeScreen from '../join-code'

const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  router: { replace: (...a: unknown[]) => mockReplace(...a), back: jest.fn() },
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'joinCode.title': 'Enter your invite code',
        'joinCode.placeholder': 'Invite code',
        'joinCode.continue': 'Continue',
        'joinCode.invalid': 'Enter at least 4 characters.',
      }
      return map[key] ?? key
    },
  }),
}))

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))

describe('JoinCodeScreen', () => {
  beforeEach(() => jest.clearAllMocks())

  it('blocks continue until code >= 4 chars', () => {
    const { getByText, getByPlaceholderText } = render(<JoinCodeScreen />)
    fireEvent.changeText(getByPlaceholderText('Invite code'), 'abc')
    fireEvent.press(getByText('Continue'))
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('replaces to /join/{code} on valid submit', () => {
    const { getByText, getByPlaceholderText } = render(<JoinCodeScreen />)
    fireEvent.changeText(getByPlaceholderText('Invite code'), 'ABCD1234')
    fireEvent.press(getByText('Continue'))
    expect(mockReplace).toHaveBeenCalledWith('/join/ABCD1234')
  })

  it('upper-cases and trims before routing', () => {
    const { getByText, getByPlaceholderText } = render(<JoinCodeScreen />)
    fireEvent.changeText(getByPlaceholderText('Invite code'), '  ab12xy  ')
    fireEvent.press(getByText('Continue'))
    expect(mockReplace).toHaveBeenCalledWith('/join/AB12XY')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd apps/mobile && npm test -- --testPathPattern='join-code.spec' --watch=false 2>&1 | tail -20
```
Expected: FAIL.

- [ ] **Step 3: Implement `app/join-code.tsx`**

Create `apps/mobile/app/join-code.tsx`:

```tsx
import { useMemo, useState } from 'react'
import { StyleSheet, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ModalHeader } from '../src/components/ModalHeader'
import { Screen, Card, Button, Text } from '../src/components/ui'
import { useClubColors } from '../src/context/ClubThemeContext'
import { fontSize, fonts, hairline, radius, space } from '../src/theme/tokens'

export default function JoinCodeScreen() {
  const { t } = useTranslation()
  const c = useClubColors()
  const [code, setCode] = useState('')

  const trimmed = code.trim().toUpperCase()
  const canContinue = useMemo(() => trimmed.length >= 4 && trimmed.length <= 32, [trimmed])

  const handleContinue = () => {
    if (!canContinue) return
    router.replace(`/join/${trimmed}`)
  }

  return (
    <Screen header={<ModalHeader title={t('joinCode.title')} />} padded={false} scroll>
      <View style={styles.content}>
        <Text variant="body" color="secondary">{t('joinCode.subtitle')}</Text>

        <Card padding="card" style={{ gap: space.sm, marginTop: space.md }}>
          <TextInput
            placeholder={t('joinCode.placeholder')}
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={32}
            style={[styles.input, { borderColor: c.borderDefault, color: c.textPrimary }]}
            placeholderTextColor={c.textTertiary}
            testID="join-code-input"
          />
          {code.length > 0 && !canContinue ? (
            <Text variant="footnote" color="danger">{t('joinCode.invalid')}</Text>
          ) : null}
        </Card>

        <Button
          label={t('joinCode.continue')}
          variant="filled"
          size="lg"
          fullWidth
          disabled={!canContinue}
          onPress={handleContinue}
          style={{ marginTop: space.lg }}
          testID="join-code-continue"
        />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { padding: space.lg },
  input: {
    height: 52,
    borderWidth: hairline,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    letterSpacing: 1.2,
  },
})
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cd apps/mobile && npm test -- --testPathPattern='join-code.spec' --watch=false 2>&1 | tail -20
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/join-code.tsx apps/mobile/app/__tests__/join-code.spec.tsx
git commit -m "feat(mobile): manual invite-code screen routing to /join/[code]"
```

---

## Task 9: Delete legacy `/join.tsx`, redirect `/join-club` to `/find-club`

**Files:**
- Delete: `apps/mobile/app/join.tsx`
- Modify: `apps/mobile/app/join-club.tsx` (full rewrite to redirect)
- Modify: `apps/mobile/app/__tests__/join-club-auth.spec.tsx` (update expectation)

- [ ] **Step 1: Verify nothing else imports `/join.tsx`**

Run:
```bash
cd /Users/yemi/anstoss && grep -rn "from.*app/join'" apps/ || true
grep -rn "'/join'" apps/mobile/app apps/mobile/src || true
```
Expected: only `app/join/[...code].tsx` references exist. The bare `/join.tsx` file is not imported anywhere. Deep links hitting `anstoss.app/join/{code}` resolve to `/join/[...code].tsx` (tested in Task 10 smoke).

- [ ] **Step 2: Delete `/join.tsx`**

Run:
```bash
git rm apps/mobile/app/join.tsx
```

- [ ] **Step 3: Rewrite `app/join-club.tsx` as a redirect shim**

Overwrite `apps/mobile/app/join-club.tsx` with:

```tsx
import { useEffect } from 'react'
import { router, useLocalSearchParams } from 'expo-router'
import { View } from 'react-native'
import { Screen } from '../src/components/ui'

/**
 * Legacy route. Existing deep links and sign-in redirects may still point
 * here. Forward to the new `/find-club` (or `/club/{slug}` when a slug is
 * supplied) so the new search-based join flow handles them.
 */
export default function JoinClubRedirect() {
  const params = useLocalSearchParams<{ slug?: string | string[] }>()
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug

  useEffect(() => {
    if (slug && slug.trim().length > 0) {
      router.replace(`/club/${slug.trim().toLowerCase()}`)
    } else {
      router.replace('/find-club')
    }
  }, [slug])

  return (
    <Screen>
      <View />
    </Screen>
  )
}
```

- [ ] **Step 4: Update `join-club-auth.spec.tsx`**

Replace the test body so the expectation now matches the redirect (no auth guard, no sign-in flow — those moved to the downstream `/club/[slug]` screen):

Overwrite `apps/mobile/app/__tests__/join-club-auth.spec.tsx`:

```tsx
import renderer, { act } from 'react-test-renderer'
import JoinClubScreen from '../join-club'

const mockReplace = jest.fn()

jest.mock('expo-router', () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args), back: jest.fn() },
  useLocalSearchParams: () => ({ slug: 'sv-albatros' }),
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}))

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))

describe('JoinClubScreen (legacy redirect)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('redirects to /club/[slug] when a slug is supplied', () => {
    act(() => {
      renderer.create(<JoinClubScreen />)
    })
    expect(mockReplace).toHaveBeenCalledWith('/club/sv-albatros')
  })
})
```

- [ ] **Step 5: Add a second test for the no-slug path**

Append to the same file:

```tsx
describe('JoinClubScreen (no slug)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('redirects to /find-club when no slug supplied', () => {
    jest.resetModules()
    jest.doMock('expo-router', () => ({
      router: { replace: (...args: unknown[]) => mockReplace(...args), back: jest.fn() },
      useLocalSearchParams: () => ({}),
    }))
    const FreshScreen = require('../join-club').default
    act(() => {
      renderer.create(<FreshScreen />)
    })
    expect(mockReplace).toHaveBeenCalledWith('/find-club')
  })
})
```

- [ ] **Step 6: Run the updated test**

Run:
```bash
cd apps/mobile && npm test -- --testPathPattern='join-club-auth.spec' --watch=false 2>&1 | tail -20
```
Expected: PASS (2 tests).

- [ ] **Step 7: Mobile typecheck**

Run:
```bash
cd apps/mobile && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/app/join.tsx apps/mobile/app/join-club.tsx apps/mobile/app/__tests__/join-club-auth.spec.tsx
git commit -m "refactor(mobile): delete legacy /join, redirect /join-club to /find-club or /club/[slug]"
```

---

## Task 10: Wire manual-code + search entries into `/register/join.tsx`

**Files:**
- Modify: `apps/mobile/app/register/join.tsx`

- [ ] **Step 1: Add two secondary links after the invite-code card**

Read the current `apps/mobile/app/register/join.tsx` (shipped in Phase 3a). Locate the `<Card>` containing the invite-code `TextInput`. Directly AFTER that card (still inside the `ScrollView`, before the `Continue` button `<View style={styles.actions}>`), add:

```tsx
        <View style={{ marginTop: space.lg, gap: space.sm }}>
          <PressableScale onPress={() => router.push('/find-club')}>
            <Card padding="card">
              <Text variant="body" color="primary">Search for your club</Text>
              <Text variant="footnote" color="secondary">
                Don&apos;t have a code? Find your club by name or city.
              </Text>
            </Card>
          </PressableScale>
        </View>
```

At the top of the file, add these imports next to the existing ones (the file already imports `router`, `space`, etc.):

```tsx
import { PressableScale } from '../../src/components/ui/PressableScale'
```

If `Card` / `Text` aren't already imported from the UI barrel, ensure they are (the Phase 3a file already imports them).

- [ ] **Step 2: Run the existing register-join test**

Run:
```bash
cd apps/mobile && npm test -- --testPathPattern='register-join-branch.spec' --watch=false 2>&1 | tail -20
```
Expected: PASS (2 tests) — the added secondary card does not change any of the existing assertions because the spec queries by placeholder + button label, both still unique.

- [ ] **Step 3: Mobile typecheck**

Run:
```bash
cd apps/mobile && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/register/join.tsx
git commit -m "feat(mobile): surface club-search entry from register join step"
```

---

## Task 11: Pending-approval as a real empty state + remind action

**Files:**
- Modify: `apps/mobile/app/pending-approval.tsx`
- Create: `apps/mobile/app/__tests__/pending-approval.spec.tsx`

- [ ] **Step 1: Write failing spec**

Create `apps/mobile/app/__tests__/pending-approval.spec.tsx`:

```tsx
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import PendingApprovalScreen from '../pending-approval'

const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  router: { replace: (...a: unknown[]) => mockReplace(...a), back: jest.fn() },
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { email?: string }) => {
      if (key === 'pendingApproval.ageGateBody' && opts?.email) {
        return `We emailed ${opts.email}`
      }
      const map: Record<string, string> = {
        'pendingApproval.eyebrow': 'AWAITING APPROVAL',
        'pendingApproval.title': 'Your request is with the club',
        'pendingApproval.body': 'Most clubs reply within 1–2 days.',
        'pendingApproval.remindCta': 'Ping the club admin',
        'pendingApproval.remindSuccess': 'We let the admin know.',
        'pendingApproval.remindCooldown': 'Try again in a few minutes.',
        'pendingApproval.checkStatus': 'Check again',
        'pendingApproval.signOut': 'Sign out',
      }
      return map[key] ?? key
    },
  }),
}))

const mockRefreshUser = jest.fn()
const mockSignOut = jest.fn()
const mockPendingJoinRequest = { clubId: 'c1', id: 'jr1' }

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    ageGate: null,
    refreshUser: mockRefreshUser,
    signOut: mockSignOut,
    pendingJoinRequest: mockPendingJoinRequest,
  }),
}))

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))

const mockApi = jest.fn()
jest.mock('../../src/api/client', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class extends Error {
    status?: number
  },
}))

describe('PendingApprovalScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockApi.mockReset()
  })

  it('renders the empty-state copy', () => {
    const { getByText } = render(<PendingApprovalScreen />)
    expect(getByText('Your request is with the club')).toBeTruthy()
    expect(getByText('Most clubs reply within 1–2 days.')).toBeTruthy()
  })

  it('posts to the remind endpoint on ping', async () => {
    mockApi.mockResolvedValueOnce({ ok: true })
    const { getByText } = render(<PendingApprovalScreen />)
    fireEvent.press(getByText('Ping the club admin'))
    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith(
        '/clubs/c1/join-requests/jr1/remind',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  it('shows cooldown message on 400 response', async () => {
    const ApiError = require('../../src/api/client').ApiError
    const err = new ApiError('cooldown')
    ;(err as { status?: number }).status = 400
    mockApi.mockRejectedValueOnce(err)
    const { getByText, findByText } = render(<PendingApprovalScreen />)
    fireEvent.press(getByText('Ping the club admin'))
    expect(await findByText('Try again in a few minutes.')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd apps/mobile && npm test -- --testPathPattern='pending-approval.spec' --watch=false 2>&1 | tail -20
```
Expected: FAIL (current screen has no remind button; also relies on `pendingJoinRequest` which does not exist on AuthContext yet).

- [ ] **Step 3: Expose `pendingJoinRequest` on AuthContext**

Open `apps/mobile/src/context/AuthContext.tsx`. Find the part where `memberships` / `ageGate` etc. are derived and returned. Add a `pendingJoinRequest` field derived from `user?.pendingJoinRequests?.[0]` (match whatever shape the `/me` endpoint returns). If `/me` does not currently return pending join-requests, add it on the API side:

Edit `apps/api/src/users/users.controller.ts` (or wherever `GET /me` is implemented — confirm with a quick grep) and extend the returned payload with:

```typescript
pendingJoinRequest: await this.prisma.joinRequest.findFirst({
  where: { userId: user.id, status: 'PENDING' },
  select: { id: true, clubId: true },
  orderBy: { createdAt: 'desc' },
}),
```

In `AuthContext.tsx`, plumb it through:

```typescript
// Inside the user refresh handler:
setPendingJoinRequest(fetched.pendingJoinRequest ?? null)

// In the context value:
pendingJoinRequest,
```

Update the `AuthState` type to include:

```typescript
pendingJoinRequest: { id: string; clubId: string } | null
```

- [ ] **Step 4: Rewrite `app/pending-approval.tsx`**

Replace `apps/mobile/app/pending-approval.tsx` with:

```tsx
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { api, ApiError } from '../src/api/client'
import { useAuth } from '../src/context/AuthContext'
import { Screen, Button, Text, Icon } from '../src/components/ui'
import { useClubColors } from '../src/context/ClubThemeContext'
import { radius, space } from '../src/theme/tokens'

export default function PendingApprovalScreen() {
  const { t } = useTranslation()
  const { ageGate, signOut, refreshUser, pendingJoinRequest } = useAuth()
  const c = useClubColors()
  const [remindStatus, setRemindStatus] = useState<'idle' | 'sent' | 'cooldown' | 'error'>('idle')
  const [remindLoading, setRemindLoading] = useState(false)

  const isAgeGate = !!ageGate && (ageGate as { status?: string }).status === 'PENDING_PARENT_APPROVAL'

  const handleSignOut = () => {
    void signOut()
    router.replace('/(auth)/sign-in')
  }

  const handleRemind = async () => {
    if (!pendingJoinRequest) return
    setRemindLoading(true)
    setRemindStatus('idle')
    try {
      await api(`/clubs/${pendingJoinRequest.clubId}/join-requests/${pendingJoinRequest.id}/remind`, {
        method: 'POST',
      })
      setRemindStatus('sent')
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) {
        setRemindStatus('cooldown')
      } else {
        setRemindStatus('error')
      }
    } finally {
      setRemindLoading(false)
    }
  }

  const bodyText = isAgeGate
    ? t('pendingApproval.ageGateBody', {
        email: (ageGate as { guardianEmail?: string })?.guardianEmail ?? '',
      })
    : t('pendingApproval.body')

  const statusCopy =
    remindStatus === 'sent'
      ? t('pendingApproval.remindSuccess')
      : remindStatus === 'cooldown'
        ? t('pendingApproval.remindCooldown')
        : remindStatus === 'error'
          ? t('common.error')
          : null

  return (
    <Screen padded={false}>
      <View style={styles.container}>
        <View style={[styles.iconTile, { backgroundColor: hexWithAlpha(c.info, 0.12) }]}>
          <Icon name="clock.fill" size={72} color="info" />
        </View>
        <Text variant="caption2" color="info" tracking="wide" align="center" style={styles.eyebrow}>
          {t('pendingApproval.eyebrow').toUpperCase()}
        </Text>
        <Text variant="title1" color="primary" align="center" style={styles.title}>
          {t('pendingApproval.title')}
        </Text>
        <Text variant="body" color="secondary" align="center" style={styles.body}>
          {bodyText}
        </Text>

        {statusCopy ? (
          <Text
            variant="footnote"
            color={remindStatus === 'sent' ? 'success' : 'secondary'}
            align="center"
            style={styles.status}
          >
            {statusCopy}
          </Text>
        ) : null}

        <View style={styles.actions}>
          {pendingJoinRequest && !isAgeGate ? (
            <Button
              label={t('pendingApproval.remindCta')}
              variant="filled"
              size="lg"
              fullWidth
              loading={remindLoading}
              disabled={remindStatus === 'sent' || remindStatus === 'cooldown'}
              onPress={() => void handleRemind()}
              testID="pending-approval-remind"
            />
          ) : null}
          <Button
            label={t('pendingApproval.checkStatus')}
            variant={pendingJoinRequest && !isAgeGate ? 'secondary' : 'filled'}
            size="lg"
            fullWidth
            onPress={() => void refreshUser()}
          />
          <Button
            label={t('pendingApproval.signOut')}
            variant="plain"
            size="lg"
            fullWidth
            onPress={handleSignOut}
          />
        </View>
      </View>
    </Screen>
  )
}

function hexWithAlpha(color: string, alpha: number): string {
  if (!color.startsWith('#')) return color
  const r = parseInt(color.slice(1, 3), 16)
  const g = parseInt(color.slice(3, 5), 16)
  const b = parseInt(color.slice(5, 7), 16)
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return color
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconTile: {
    width: 120,
    height: 120,
    borderRadius: radius.xl,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xl,
  },
  eyebrow: { marginBottom: space.xs },
  title: { marginBottom: space.sm, paddingHorizontal: space.md },
  body: { maxWidth: 360, paddingHorizontal: space.md },
  status: { marginTop: space.md, paddingHorizontal: space.md },
  actions: {
    marginTop: space.xl,
    alignSelf: 'stretch',
    maxWidth: 360,
    gap: space.sm,
  },
})
```

- [ ] **Step 5: Run test to verify it passes**

Run:
```bash
cd apps/mobile && npm test -- --testPathPattern='pending-approval.spec' --watch=false 2>&1 | tail -20
```
Expected: PASS (3 tests).

- [ ] **Step 6: Full-suite sanity**

Run:
```bash
cd apps/mobile && npx tsc --noEmit
cd /Users/yemi/anstoss && cd apps/api && npx tsc --noEmit
```
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/app/pending-approval.tsx apps/mobile/app/__tests__/pending-approval.spec.tsx apps/mobile/src/context/AuthContext.tsx apps/api/src/users/users.controller.ts
git commit -m "feat(mobile): pending-approval empty state with ping-admin action"
```

> If `apps/api/src/users/users.controller.ts` was not the correct file for the `/me` extension, adjust the path in both Step 3 and this commit command (check with `grep -rn "Get('me')" apps/api/src`).

---

## Task 12: Full sweep + push + PR

- [ ] **Step 1: Full API test + typecheck**

Run:
```bash
cd apps/api && npx tsc --noEmit && npm test -- --watch=false 2>&1 | tail -30
```
Expected: clean + all tests green (API coverage ≥80% held).

- [ ] **Step 2: Full shared test + typecheck**

Run:
```bash
cd packages/shared && npx tsc --noEmit && npx jest 2>&1 | tail -20
```
Expected: clean + green.

- [ ] **Step 3: Full mobile test + typecheck**

Run:
```bash
cd apps/mobile && npx tsc --noEmit && npm test -- --watch=false 2>&1 | tail -40
```
Expected: clean; new suites (`find-club`, `club-slug-preview`, `join-code`, `pending-approval`, `join-club-auth`) all green; the four pre-existing failing suites (`home-role-behavior`, `more-tab`, `home-stats-layout`, `admin-dashboard`) may remain red — do not fix them in this PR.

- [ ] **Step 4: Push branch**

Run:
```bash
git push -u origin feat/revamp-join
```
Expected: push succeeds.

- [ ] **Step 5: Open / update PR**

Run:
```bash
gh pr create --title "Phase 3b: join flow (search, manual code, preview, pending empty state)" --body "$(cat <<'EOF'
## Summary
- Adds `GET /clubs/search` (name+city, Zod-validated, rate-limited read) and an additive `Club.city` column.
- Replaces the slug-exact-match `/join-club` with a real search surface (`/find-club`) + preview screen (`/club/[slug]`).
- Adds a manual invite-code entry (`/join-code`) that resolves into the existing canonical `/join/[...code]` surface.
- Turns `/pending-approval` into a real empty state with a "ping the club admin" action backed by a new `POST /clubs/:clubId/join-requests/:id/remind` endpoint (5-minute Redis cooldown).
- Deletes the redundant legacy `/join.tsx` and redirects `/join-club` into the new flow.

## Test plan
- [ ] `apps/api`: `npm test` green (new service + controller specs covered).
- [ ] `packages/shared`: `npx jest` green (search schema cases added).
- [ ] `apps/mobile`: all new suites green; four pre-existing failing suites unchanged.
- [ ] Manual: from a fresh signup, `/register/join` → "Search for your club" → search "FC" → tap result → preview → "Request to join" → lands on `/pending-approval` with the remind action visible.
- [ ] Manual: deep link `anstoss.app/join/{code}` still resolves via `/join/[...code]`.
- [ ] Manual: `/join-club?slug=sv-albatros` redirects to `/club/sv-albatros`.
EOF
)"
```

If a PR for this branch already exists, instead run:

```bash
gh pr edit feat/revamp-join --body "$(cat <<'EOF'
... same body as above ...
EOF
)"
```

- [ ] **Step 6: Confirm CI**

Run:
```bash
gh pr checks
```
Expected: lint + typecheck + tests green on all three workspaces.

---

## Self-review checklist

- [x] Spec §4.2 **invite deep link** — already canonical at `/join/[...code]`; surfaced here by the `/join-code` manual entry replacing into it and by `/join-club` → `/club/[slug]` redirect. No changes to the invite-redeem logic (Phase 3a validated it). Task 8 + Task 9.
- [x] Spec §4.2 **search** — `GET /clubs/search` (Task 3) + `/find-club` screen (Task 6) + `/club/[slug]` preview with "Request to join" (Task 7). Result rows show badge, name, city, member count exactly per spec.
- [x] Spec §4.2 **manual code** — `/join-code` screen resolves to the same `/join/[code]` preview as the invite deep link (Task 8).
- [x] Spec §4.2 **pending-approval empty state with estimated time + ping admin** — Task 11; estimated-time copy is "Most clubs reply within 1–2 days" and the remind button posts to the new endpoint from Task 5.
- [x] TDD: every task writes the spec first and runs it red before implementation.
- [x] Each task ends with a `git commit` step.
- [x] Backend endpoints land before the UI that consumes them (Tasks 3/4/5 before Tasks 6/7/11).
- [x] Zod schemas in `packages/shared` validated on both client (parse response types) and server (Zod parse on request).
- [x] Legacy `/join.tsx` deleted, `/join-club.tsx` becomes a thin redirect (Task 9).
- [x] Task 0 baseline + Task 12 final sweep present.
- [x] Every step fits in 2–5 minutes of work; no "TBD" or "similar to above" in any code block.
- [x] Commit cadence mirrors Phase 3a (one commit per task).
- [x] Types consistent across tasks: `ClubSearchResult` / `ClubSearchResponse` used end-to-end; `ClubPublic` in `/club/[slug]` matches `getClubBySlug` return shape; `pendingJoinRequest: { id, clubId } | null` threaded through AuthContext and consumed in pending-approval.
