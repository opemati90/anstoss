import {
  MembershipRole,
  Prisma,
  PrismaClient,
  RegistrationRole,
  TeamRole,
} from '@prisma/client'

/**
 * Production-safe, narrowly scoped fictional data for App Store / Play review.
 * Dry-run by default; --apply creates the complete fixture in one transaction.
 * --refresh-events moves only its two fictional events before a store review.
 * It refuses ambiguous or partial fixtures and never modifies real-club rows.
 * No minors, health details, real club, bank account, or platform-admin role.
 */
let prisma: PrismaClient | undefined
const clubId = 'store-review-2026-club'
const clubSlug = 'fc-musterstadt-review'
const groupId = 'store-review-2026-senior-group'
const teamId = 'store-review-2026-senior-team'
const seedLock = 'anstoss-store-review-seed-2026'
const trainingId = 'store-review-2026-training'
const matchId = 'store-review-2026-match'
const teamChannelId = 'store-review-2026-team-chat'
const announcementsChannelId = 'store-review-2026-announcements'
const welcomeMessageId = 'store-review-2026-welcome'

const reviewers = [
  {
    id: 'store-review-2026-sofia',
    name: 'Sofia Wagner',
    email: 'sofia@demo.anstoss.app',
    registrationRole: RegistrationRole.CLUB_ADMIN,
    membershipRole: MembershipRole.OWNER,
    teamRole: TeamRole.HEAD_COACH,
    birth: '1988-04-12',
  },
  {
    id: 'store-review-2026-max',
    name: 'Max Müller',
    email: 'max@demo.anstoss.app',
    registrationRole: RegistrationRole.COACH,
    membershipRole: MembershipRole.COACH,
    teamRole: TeamRole.ASSISTANT_COACH,
    birth: '1986-09-03',
  },
  {
    id: 'store-review-2026-tim',
    name: 'Tim Weber',
    email: 'tim@demo.anstoss.app',
    registrationRole: RegistrationRole.PLAYER,
    membershipRole: MembershipRole.PLAYER,
    teamRole: TeamRole.PLAYER,
    birth: '2001-02-11',
  },
  {
    id: 'store-review-2026-leo',
    name: 'Leo Hoffmann',
    email: 'leo@demo.anstoss.app',
    registrationRole: RegistrationRole.PLAYER,
    membershipRole: MembershipRole.PLAYER,
    teamRole: TeamRole.PLAYER,
    birth: '2000-11-03',
  },
  {
    id: 'store-review-2026-emir',
    name: 'Emir Kaya',
    email: 'emir@demo.anstoss.app',
    registrationRole: RegistrationRole.PLAYER,
    membershipRole: MembershipRole.PLAYER,
    teamRole: TeamRole.PLAYER,
    birth: '1998-07-27',
  },
] as const

export async function inspectStoreReviewFixture(tx: Prisma.TransactionClient, allowArchivedEvents = false) {
  const [clubs, users, teams, groups, memberships, teamAccess, teamMembers, events, channels, welcome, rsvps] =
    await Promise.all([
      tx.club.findMany({
        where: { OR: [{ id: clubId }, { slug: clubSlug }] },
        select: { id: true, slug: true },
      }),
      tx.user.findMany({
        where: {
          OR: [
            { id: { in: reviewers.map((user) => user.id) } },
            { email: { in: reviewers.map((user) => user.email) } },
          ],
        },
        select: { id: true, email: true, deletedAt: true, platformRole: true, registrationRole: true },
      }),
      tx.team.findMany({ where: { id: teamId }, select: { id: true, clubId: true, groupId: true } }),
      tx.teamGroup.findMany({ where: { id: groupId }, select: { id: true, clubId: true } }),
      tx.membership.findMany({
        where: { userId: { in: reviewers.map((user) => user.id) } },
        select: { clubId: true, userId: true, role: true },
      }),
      tx.teamAccess.findMany({
        where: { userId: { in: reviewers.map((user) => user.id) } },
        select: { clubId: true, teamId: true, userId: true, role: true, status: true, phase: true },
      }),
      tx.teamMember.findMany({
        where: { userId: { in: reviewers.map((user) => user.id) } },
        select: { teamId: true, userId: true },
      }),
      tx.event.findMany({
        where: { id: { in: [trainingId, matchId] } },
        select: { id: true, clubId: true, teamId: true, type: true, archivedAt: true, cancelledAt: true },
      }),
      tx.channel.findMany({
        where: { id: { in: [teamChannelId, announcementsChannelId] } },
        select: { id: true, clubId: true, teamId: true, kind: true, visibility: true },
      }),
      tx.message.findMany({
        where: { id: welcomeMessageId },
        select: { id: true, clubId: true, teamId: true, channelId: true, senderId: true, deletedAt: true },
      }),
      tx.rsvp.findMany({
        where: { eventId: trainingId, userId: { in: reviewers.slice(2).map((user) => user.id) } },
        select: { userId: true, status: true },
      }),
    ])

  const complete =
    clubs.length === 1 &&
    clubs[0].id === clubId &&
    clubs[0].slug === clubSlug &&
    users.length === reviewers.length &&
    reviewers.every((expected) =>
      users.some(
        (actual) =>
          actual.id === expected.id &&
          actual.email === expected.email &&
          actual.deletedAt === null &&
          actual.platformRole === 'NONE' &&
          actual.registrationRole === expected.registrationRole,
      ),
    ) &&
    groups.length === 1 && groups[0].clubId === clubId &&
    teams.length === 1 && teams[0].clubId === clubId && teams[0].groupId === groupId &&
    memberships.length === reviewers.length &&
    reviewers.every((expected) => memberships.some((row) =>
      row.userId === expected.id && row.clubId === clubId && row.role === expected.membershipRole,
    )) &&
    teamAccess.length === reviewers.length &&
    reviewers.every((expected) => teamAccess.some((row) =>
      row.userId === expected.id && row.clubId === clubId && row.teamId === teamId &&
      row.role === expected.teamRole && row.status === 'ACTIVE' && row.phase === 'FULL',
    )) &&
    teamMembers.length === 3 &&
    reviewers.slice(2).every((expected) => teamMembers.some((row) =>
      row.userId === expected.id && row.teamId === teamId,
    )) &&
    events.length === 2 &&
    events.some((row) => row.id === trainingId && row.clubId === clubId && row.teamId === teamId &&
      row.type === 'TRAINING' && (allowArchivedEvents || !row.archivedAt) && !row.cancelledAt) &&
    events.some((row) => row.id === matchId && row.clubId === clubId && row.teamId === teamId &&
      row.type === 'MATCH' && (allowArchivedEvents || !row.archivedAt) && !row.cancelledAt) &&
    channels.length === 2 &&
    channels.some((row) => row.id === teamChannelId && row.clubId === clubId && row.teamId === teamId &&
      row.kind === 'TEAM' && row.visibility === 'MEMBERS') &&
    channels.some((row) => row.id === announcementsChannelId && row.clubId === clubId && row.teamId === teamId &&
      row.kind === 'ANNOUNCEMENTS' && row.visibility === 'MEMBERS') &&
    welcome.length === 1 && welcome[0].clubId === clubId && welcome[0].teamId === teamId &&
    welcome[0].channelId === announcementsChannelId && welcome[0].senderId === reviewers[0].id &&
    !welcome[0].deletedAt &&
    rsvps.length === 3 &&
    rsvps.some((row) => row.userId === reviewers[2].id && row.status === 'YES') &&
    rsvps.some((row) => row.userId === reviewers[3].id && row.status === 'MAYBE') &&
    rsvps.some((row) => row.userId === reviewers[4].id && row.status === 'NO')

  if (complete) return 'already-seeded' as const
  if (clubs.length || users.length || groups.length || teams.length || memberships.length ||
    teamAccess.length || teamMembers.length || events.length || channels.length || welcome.length || rsvps.length) {
    throw new Error('Review fixture collision or partial state; no data changed')
  }
  return 'ready' as const
}

async function main() {
  prisma = new PrismaClient()
  const apply = process.argv.includes('--apply')
  const refreshEvents = process.argv.includes('--refresh-events')
  if (process.argv.some((arg) => !['--apply', '--dry-run', '--refresh-events'].includes(arg) && arg !== process.argv[0] && arg !== process.argv[1])) {
    throw new Error('Use --dry-run, --apply, or --refresh-events')
  }
  if (Number(apply) + Number(refreshEvents) + Number(process.argv.includes('--dry-run')) > 1) {
    throw new Error('Choose only one mode')
  }
  if ((apply || refreshEvents) && process.env.REVIEW_SEED_CONFIRM !== clubSlug) {
    throw new Error(`REVIEW_SEED_CONFIRM=${clubSlug} is required to write`)
  }

  const result = await prisma.$transaction(async (tx) => {
    // Another operator cannot slip a second fixture past the preflight.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${seedLock}))`
    const state = await inspectStoreReviewFixture(tx, refreshEvents)
    if (refreshEvents) {
      if (state !== 'already-seeded') {
        throw new Error('Only a complete, unmodified review fixture can have its dates refreshed')
      }
      const now = Date.now()
      await tx.event.update({
        where: { id: trainingId },
        data: { date: new Date(now + 4 * 24 * 60 * 60 * 1000), archivedAt: null },
      })
      await tx.event.update({
        where: { id: matchId },
        data: { date: new Date(now + 8 * 24 * 60 * 60 * 1000), archivedAt: null },
      })
      return 'events-refreshed' as const
    }
    if (state !== 'ready' || !apply) return state

    for (const user of reviewers) {
      await tx.user.create({
        data: {
          id: user.id,
          name: user.name,
          email: user.email,
          registrationRole: user.registrationRole,
          dateOfBirth: new Date(`${user.birth}T12:00:00.000Z`),
          preferredLanguage: 'de',
        },
      })
    }
    await tx.club.create({
      data: {
        id: clubId,
        slug: clubSlug,
        name: 'FC Musterstadt — Store Review',
        primaryColor: '#1B4D3E',
        welcomeText: 'Fiktiver Verein für die App-Store-Prüfung.',
      },
    })
    await tx.teamGroup.create({
      data: { id: groupId, clubId, type: 'SENIOR', displayName: 'Herren' },
    })
    await tx.team.create({
      data: {
        id: teamId,
        clubId,
        groupId,
        name: 'review-senior',
        displayName: '1. Herren',
        ageGroup: 'Senior',
      },
    })
    for (const user of reviewers) {
      await tx.membership.create({
        data: { clubId, userId: user.id, role: user.membershipRole },
      })
      await tx.teamAccess.create({
        data: {
          clubId,
          teamId,
          userId: user.id,
          role: user.teamRole,
          phase: 'FULL',
          status: 'ACTIVE',
        },
      })
      if (user.teamRole === TeamRole.PLAYER) {
        await tx.teamMember.create({ data: { teamId, userId: user.id } })
      }
    }

    const now = Date.now()
    await tx.event.create({
      data: {
        id: trainingId,
        clubId,
        teamId,
        createdById: reviewers[0].id,
        title: 'Teamtraining',
        type: 'TRAINING',
        date: new Date(now + 4 * 24 * 60 * 60 * 1000),
        location: 'Sportplatz Musterstadt',
      },
    })
    await tx.event.create({
      data: {
        id: matchId,
        clubId,
        teamId,
        createdById: reviewers[0].id,
        title: 'FC Musterstadt – SV Beispielheim',
        type: 'MATCH',
        date: new Date(now + 8 * 24 * 60 * 60 * 1000),
        location: 'Sportanlage Musterstadt',
        opponent: 'SV Beispielheim',
        homeAway: 'HOME',
      },
    })
    await tx.rsvp.createMany({
      data: [
        { eventId: trainingId, userId: reviewers[2].id, status: 'YES' },
        { eventId: trainingId, userId: reviewers[3].id, status: 'MAYBE' },
        { eventId: trainingId, userId: reviewers[4].id, status: 'NO', reason: 'work' },
      ],
    })

    await tx.channel.createMany({
      data: [
        {
          id: teamChannelId,
          clubId,
          teamId,
          slug: 'team',
          kind: 'TEAM',
          name: 'Team',
          visibility: 'MEMBERS',
        },
        {
          id: announcementsChannelId,
          clubId,
          teamId,
          slug: 'announcements',
          kind: 'ANNOUNCEMENTS',
          name: 'Announcements',
          visibility: 'MEMBERS',
        },
      ],
    })
    await tx.message.create({
      data: {
        id: 'store-review-2026-welcome',
        clubId,
        teamId,
        channelId: announcementsChannelId,
        senderId: reviewers[0].id,
        content: 'Willkommen beim fiktiven FC Musterstadt! Das nächste Training steht im Kalender.',
        isAnnouncement: true,
      },
    })
    return 'created' as const
  })

  console.log(JSON.stringify({ status: result, clubSlug, reviewerAccounts: reviewers.length }))
}

if (require.main === module) main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Review seed failed')
    process.exitCode = 1
  })
  .finally(() => prisma?.$disconnect())
