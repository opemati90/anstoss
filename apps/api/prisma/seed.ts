import {
  ClubOperationalRole,
  FreeAgentVisibility,
  MembershipRole,
  PlayerPosition,
  PreferredFoot,
  PrismaClient,
  RegistrationRole,
} from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Seed a demo club for beta testing / local development.
 * Idempotent — safe to run multiple times.
 */
async function main() {
  console.log('Seeding demo data...')

  // Demo users (external IDs simulate Clerk JIT creation)
  const users = await Promise.all(
    [
      {
        id: 'seed-coach-1',
        clerkId: 'seed_clerk_coach1',
        name: 'Max Müller',
        email: 'max@demo.anstoss.app',
        registrationRole: RegistrationRole.CLUB_ADMIN,
      },
      {
        id: 'seed-coach-2',
        clerkId: 'seed_clerk_coach2',
        name: 'Lena Schmidt',
        email: 'lena@demo.anstoss.app',
        registrationRole: RegistrationRole.COACH,
      },
      {
        id: 'seed-player-1',
        clerkId: 'seed_clerk_player1',
        name: 'Kai Fischer',
        email: 'kai@demo.anstoss.app',
        registrationRole: RegistrationRole.PLAYER,
      },
      {
        id: 'seed-player-2',
        clerkId: 'seed_clerk_player2',
        name: 'Tim Weber',
        email: 'tim@demo.anstoss.app',
        registrationRole: RegistrationRole.PLAYER,
      },
      {
        id: 'seed-player-3',
        clerkId: 'seed_clerk_player3',
        name: 'Jonas Braun',
        email: 'jonas@demo.anstoss.app',
        registrationRole: RegistrationRole.PLAYER,
      },
      {
        id: 'seed-free-agent-1',
        clerkId: 'seed_clerk_freeagent1',
        name: 'Emir Kaya',
        email: 'emir@demo.anstoss.app',
        registrationRole: RegistrationRole.FREE_AGENT,
      },
      {
        id: 'seed-free-agent-2',
        clerkId: 'seed_clerk_freeagent2',
        name: 'Noah Becker',
        email: 'noah@demo.anstoss.app',
        registrationRole: RegistrationRole.FREE_AGENT,
      },
    ].map((u) =>
      prisma.user.upsert({
        where: { id: u.id },
        create: {
          id: u.id,
          clerkId: u.clerkId,
          name: u.name,
          email: u.email,
          registrationRole: u.registrationRole,
        },
        update: {
          name: u.name,
          registrationRole: u.registrationRole,
        },
      }),
    ),
  )
  console.log(`  ${users.length} users`)

  // Demo club
  const club = await prisma.club.upsert({
    where: { slug: 'fc-musterstadt' },
    create: {
      id: 'seed-club-1',
      name: 'FC Musterstadt 1920 e.V.',
      slug: 'fc-musterstadt',
      primaryColor: '#1B4D3E',
      welcomeText: 'Willkommen beim FC Musterstadt!',
    },
    update: { name: 'FC Musterstadt 1920 e.V.' },
  })
  console.log(`  Club: ${club.name}`)

  // Memberships
  const membershipData = [
    {
      userId: 'seed-coach-1',
      role: MembershipRole.OWNER,
      operationalRoles: [
        ClubOperationalRole.SECRETARY,
        ClubOperationalRole.TREASURER,
      ],
    },
    {
      userId: 'seed-coach-2',
      role: MembershipRole.COACH,
      operationalRoles: [ClubOperationalRole.TEAM_COORDINATOR],
    },
    {
      userId: 'seed-player-1',
      role: MembershipRole.PLAYER,
      operationalRoles: [ClubOperationalRole.CAPTAIN],
    },
    {
      userId: 'seed-player-2',
      role: MembershipRole.PLAYER,
      operationalRoles: [],
    },
    {
      userId: 'seed-player-3',
      role: MembershipRole.PLAYER,
      operationalRoles: [],
    },
  ]
  for (const m of membershipData) {
    await prisma.membership.upsert({
      where: { userId_clubId: { userId: m.userId, clubId: club.id } },
      create: {
        userId: m.userId,
        clubId: club.id,
        role: m.role,
        operationalRoles: m.operationalRoles,
      },
      update: {
        role: m.role,
        operationalRoles: m.operationalRoles,
      },
    })
  }
  console.log(`  ${membershipData.length} memberships`)

  // Team groups
  const seniorGroup = await prisma.teamGroup.upsert({
    where: { id: 'seed-group-senior' },
    create: {
      id: 'seed-group-senior',
      clubId: club.id,
      type: 'SENIOR',
      displayName: 'Herren',
      sortOrder: 0,
    },
    update: {},
  })

  const youthGroup = await prisma.teamGroup.upsert({
    where: { id: 'seed-group-youth' },
    create: {
      id: 'seed-group-youth',
      clubId: club.id,
      type: 'YOUTH',
      displayName: 'Jugend',
      sortOrder: 1,
    },
    update: {},
  })

  // Teams
  const herren1 = await prisma.team.upsert({
    where: { groupId_displayName: { groupId: seniorGroup.id, displayName: '1. Herren' } },
    create: {
      id: 'seed-team-herren1',
      clubId: club.id,
      groupId: seniorGroup.id,
      name: 'herren-1',
      displayName: '1. Herren',
      ageGroup: 'Senior',
      leagueName: 'Kreisliga A',
    },
    update: {},
  })

  const u15 = await prisma.team.upsert({
    where: { groupId_displayName: { groupId: youthGroup.id, displayName: 'C-Jugend (U15)' } },
    create: {
      id: 'seed-team-u15',
      clubId: club.id,
      groupId: youthGroup.id,
      name: 'c-jugend-u15',
      displayName: 'C-Jugend (U15)',
      ageGroup: 'U15',
    },
    update: {},
  })
  console.log(`  Teams: ${herren1.displayName}, ${u15.displayName}`)

  // Team access
  const accessData = [
    { teamId: herren1.id, userId: 'seed-coach-1', role: 'HEAD_COACH' as const },
    { teamId: herren1.id, userId: 'seed-player-1', role: 'PLAYER' as const },
    { teamId: herren1.id, userId: 'seed-player-2', role: 'PLAYER' as const },
    { teamId: u15.id, userId: 'seed-coach-2', role: 'HEAD_COACH' as const },
    { teamId: u15.id, userId: 'seed-player-3', role: 'PLAYER' as const },
  ]
  for (const a of accessData) {
    await prisma.teamAccess.upsert({
      where: { teamId_userId_role: { teamId: a.teamId, userId: a.userId, role: a.role } },
      create: { clubId: club.id, teamId: a.teamId, userId: a.userId, role: a.role, status: 'ACTIVE' },
      update: {},
    })

    if (a.role === 'PLAYER') {
      await prisma.teamMember.upsert({
        where: {
          teamId_userId: {
            teamId: a.teamId,
            userId: a.userId,
          },
        },
        create: {
          teamId: a.teamId,
          userId: a.userId,
        },
        update: {},
      })
    }
  }
  console.log(`  ${accessData.length} team access records`)

  // Events
  const now = new Date()
  const nextSaturday = new Date(now)
  nextSaturday.setDate(now.getDate() + (6 - now.getDay() + 7) % 7)
  nextSaturday.setHours(10, 0, 0, 0)

  const nextSunday = new Date(nextSaturday)
  nextSunday.setDate(nextSaturday.getDate() + 1)
  nextSunday.setHours(15, 0, 0, 0)

  const nextTuesday = new Date(now)
  nextTuesday.setDate(now.getDate() + (2 - now.getDay() + 7) % 7)
  nextTuesday.setHours(19, 0, 0, 0)
  if (nextTuesday <= now) nextTuesday.setDate(nextTuesday.getDate() + 7)

  const events = [
    {
      id: 'seed-event-training',
      clubId: club.id,
      teamId: herren1.id,
      createdById: 'seed-coach-1',
      type: 'TRAINING' as const,
      title: 'Training 1. Herren',
      date: nextTuesday,
      location: 'Sportplatz Am Waldrand',
      notes: 'Bring running shoes and a light jacket.',
    },
    {
      id: 'seed-event-match',
      clubId: club.id,
      teamId: herren1.id,
      createdById: 'seed-coach-1',
      type: 'MATCH' as const,
      title: 'Kreisliga A — vs. SV Beispielheim',
      date: nextSunday,
      location: 'Sportanlage Musterstadt',
      notes: 'Meeting point 60 minutes before kickoff.',
    },
    {
      id: 'seed-event-youth-training',
      clubId: club.id,
      teamId: u15.id,
      createdById: 'seed-coach-2',
      type: 'TRAINING' as const,
      title: 'Training C-Jugend',
      date: nextSaturday,
      location: 'Kunstrasen Musterstadt',
      notes: 'Warm-up starts on time.',
    },
  ]
  for (const e of events) {
    await prisma.event.upsert({
      where: { id: e.id },
      create: e,
      update: { title: e.title, date: e.date, location: e.location, notes: e.notes },
    })
  }
  console.log(`  ${events.length} events`)

  const freeAgents = [
    {
      userId: 'seed-free-agent-1',
      profileId: 'seed-free-agent-profile-1',
      position: PlayerPosition.MID,
      preferredFoot: PreferredFoot.RIGHT,
      city: 'Berlin',
      bio: 'Dynamic central midfielder looking for an ambitious senior side with structured training.',
      experience: [
        {
          id: 'seed-free-agent-exp-1',
          clubName: 'SC Nordstern',
          roleLabel: 'Central midfield',
          fromYear: 2021,
          toYear: 2024,
          sortOrder: 0,
        },
      ],
    },
    {
      userId: 'seed-free-agent-2',
      profileId: 'seed-free-agent-profile-2',
      position: PlayerPosition.DEF,
      preferredFoot: PreferredFoot.LEFT,
      city: 'Potsdam',
      bio: 'Left-footed defender available immediately and open to trial sessions during the week.',
      experience: [
        {
          id: 'seed-free-agent-exp-2',
          clubName: 'SV Lindenhof',
          roleLabel: 'Left centre-back',
          fromYear: 2022,
          toYear: 2025,
          sortOrder: 0,
        },
      ],
    },
  ]

  for (const agent of freeAgents) {
    await prisma.freeAgentProfile.upsert({
      where: { userId: agent.userId },
      create: {
        id: agent.profileId,
        userId: agent.userId,
        position: agent.position,
        preferredFoot: agent.preferredFoot,
        city: agent.city,
        bio: agent.bio,
        isOnTransferList: true,
        visibility: FreeAgentVisibility.PUBLIC,
      },
      update: {
        position: agent.position,
        preferredFoot: agent.preferredFoot,
        city: agent.city,
        bio: agent.bio,
        isOnTransferList: true,
        visibility: FreeAgentVisibility.PUBLIC,
      },
    })

    await prisma.freeAgentExperience.deleteMany({
      where: { profileId: agent.profileId },
    })

    await prisma.freeAgentExperience.createMany({
      data: agent.experience.map((entry) => ({
        ...entry,
        profileId: agent.profileId,
      })),
    })
  }

  console.log(`  ${freeAgents.length} public marketplace profiles`)

  console.log('Seed complete.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
