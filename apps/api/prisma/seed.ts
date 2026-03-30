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
        id: 'seed-admin-1',
        clerkId: 'seed_clerk_admin1',
        name: 'Sofia Wagner',
        email: 'sofia@demo.anstoss.app',
        registrationRole: RegistrationRole.CLUB_ADMIN,
        dateOfBirth: new Date('1988-04-12'),
      },
      {
        id: 'seed-coach-1',
        clerkId: 'seed_clerk_coach1',
        name: 'Max Müller',
        email: 'max@demo.anstoss.app',
        registrationRole: RegistrationRole.CLUB_ADMIN,
        dateOfBirth: new Date('1986-09-03'),
      },
      {
        id: 'seed-coach-2',
        clerkId: 'seed_clerk_coach2',
        name: 'Lena Schmidt',
        email: 'lena@demo.anstoss.app',
        registrationRole: RegistrationRole.COACH,
        dateOfBirth: new Date('1992-01-18'),
      },
      {
        id: 'seed-player-1',
        clerkId: 'seed_clerk_player1',
        name: 'Kai Fischer',
        email: 'kai@demo.anstoss.app',
        registrationRole: RegistrationRole.PLAYER,
        dateOfBirth: new Date('1999-06-15'),
      },
      {
        id: 'seed-player-2',
        clerkId: 'seed_clerk_player2',
        name: 'Tim Weber',
        email: 'tim@demo.anstoss.app',
        registrationRole: RegistrationRole.PLAYER,
        dateOfBirth: new Date('2001-02-11'),
      },
      {
        id: 'seed-player-3',
        clerkId: 'seed_clerk_player3',
        name: 'Jonas Braun',
        email: 'jonas@demo.anstoss.app',
        registrationRole: RegistrationRole.PLAYER,
        dateOfBirth: new Date('2012-08-22'),
      },
      {
        id: 'seed-player-4',
        clerkId: 'seed_clerk_player4',
        name: 'Leo Hoffmann',
        email: 'leo@demo.anstoss.app',
        registrationRole: RegistrationRole.PLAYER,
        dateOfBirth: new Date('2011-11-03'),
      },
      {
        id: 'seed-parent-1',
        clerkId: 'seed_clerk_parent1',
        name: 'Anna Bauer',
        email: 'anna@demo.anstoss.app',
        registrationRole: RegistrationRole.PARENT,
        dateOfBirth: new Date('1984-05-09'),
      },
      {
        id: 'seed-free-agent-1',
        clerkId: 'seed_clerk_freeagent1',
        name: 'Emir Kaya',
        email: 'emir@demo.anstoss.app',
        registrationRole: RegistrationRole.FREE_AGENT,
        dateOfBirth: new Date('1998-07-27'),
      },
      {
        id: 'seed-free-agent-2',
        clerkId: 'seed_clerk_freeagent2',
        name: 'Noah Becker',
        email: 'noah@demo.anstoss.app',
        registrationRole: RegistrationRole.FREE_AGENT,
        dateOfBirth: new Date('2000-12-04'),
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
          dateOfBirth: u.dateOfBirth,
        },
        update: {
          name: u.name,
          registrationRole: u.registrationRole,
          dateOfBirth: u.dateOfBirth,
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

  const secondClub = await prisma.club.upsert({
    where: { slug: 'tsv-hafenstadt' },
    create: {
      id: 'seed-club-2',
      name: 'TSV Hafenstadt',
      slug: 'tsv-hafenstadt',
      primaryColor: '#7A3E12',
      welcomeText: 'Willkommen bei TSV Hafenstadt!',
    },
    update: { name: 'TSV Hafenstadt' },
  })
  console.log(`  Club: ${secondClub.name}`)

  // Memberships
  const membershipData = [
    {
      userId: 'seed-admin-1',
      role: MembershipRole.ADMIN,
      operationalRoles: [ClubOperationalRole.BOARD_MEMBER],
    },
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
    {
      userId: 'seed-parent-1',
      role: MembershipRole.PARENT,
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

  const secondClubMemberships = [
    {
      userId: 'seed-coach-1',
      role: MembershipRole.OWNER,
      operationalRoles: [],
    },
    {
      userId: 'seed-admin-1',
      role: MembershipRole.ADMIN,
      operationalRoles: [ClubOperationalRole.SECRETARY],
    },
  ]

  for (const membership of secondClubMemberships) {
    await prisma.membership.upsert({
      where: {
        userId_clubId: {
          userId: membership.userId,
          clubId: secondClub.id,
        },
      },
      create: {
        userId: membership.userId,
        clubId: secondClub.id,
        role: membership.role,
        operationalRoles: membership.operationalRoles,
      },
      update: {
        role: membership.role,
        operationalRoles: membership.operationalRoles,
      },
    })
  }

  console.log(`  ${secondClubMemberships.length} second-club memberships`)

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

  const hafenSeniorGroup = await prisma.teamGroup.upsert({
    where: { id: 'seed-group-hafen-senior' },
    create: {
      id: 'seed-group-hafen-senior',
      clubId: secondClub.id,
      type: 'SENIOR',
      displayName: '1. Mannschaft',
      sortOrder: 0,
    },
    update: {},
  })

  const hafen1 = await prisma.team.upsert({
    where: { groupId_displayName: { groupId: hafenSeniorGroup.id, displayName: 'Hafenstadt Herren' } },
    create: {
      id: 'seed-team-hafen1',
      clubId: secondClub.id,
      groupId: hafenSeniorGroup.id,
      name: 'hafenstadt-herren',
      displayName: 'Hafenstadt Herren',
      ageGroup: 'Senior',
      leagueName: 'Kreisliga B',
    },
    update: {},
  })
  console.log(`  Teams: ${herren1.displayName}, ${u15.displayName}, ${hafen1.displayName}`)

  // Team access
  const accessData = [
    {
      clubId: club.id,
      teamId: herren1.id,
      userId: 'seed-coach-1',
      role: 'HEAD_COACH' as const,
      phase: 'FULL' as const,
      status: 'ACTIVE' as const,
    },
    {
      clubId: club.id,
      teamId: herren1.id,
      userId: 'seed-player-1',
      role: 'PLAYER' as const,
      phase: 'FULL' as const,
      status: 'ACTIVE' as const,
    },
    {
      clubId: club.id,
      teamId: herren1.id,
      userId: 'seed-player-2',
      role: 'PLAYER' as const,
      phase: 'FULL' as const,
      status: 'ACTIVE' as const,
    },
    {
      clubId: club.id,
      teamId: herren1.id,
      userId: 'seed-free-agent-1',
      role: 'PLAYER' as const,
      phase: 'TRIAL' as const,
      status: 'ACTIVE' as const,
    },
    {
      clubId: club.id,
      teamId: u15.id,
      userId: 'seed-coach-2',
      role: 'HEAD_COACH' as const,
      phase: 'FULL' as const,
      status: 'ACTIVE' as const,
    },
    {
      clubId: club.id,
      teamId: u15.id,
      userId: 'seed-player-3',
      role: 'PLAYER' as const,
      phase: 'FULL' as const,
      status: 'ACTIVE' as const,
    },
    {
      clubId: club.id,
      teamId: u15.id,
      userId: 'seed-player-4',
      role: 'PLAYER' as const,
      phase: 'FULL' as const,
      status: 'ACTIVE' as const,
    },
    {
      clubId: club.id,
      teamId: u15.id,
      userId: 'seed-parent-1',
      role: 'PARENT' as const,
      phase: 'FULL' as const,
      status: 'ACTIVE' as const,
    },
    {
      clubId: secondClub.id,
      teamId: hafen1.id,
      userId: 'seed-coach-1',
      role: 'HEAD_COACH' as const,
      phase: 'FULL' as const,
      status: 'ACTIVE' as const,
    },
    {
      clubId: secondClub.id,
      teamId: hafen1.id,
      userId: 'seed-admin-1',
      role: 'ASSISTANT_COACH' as const,
      phase: 'FULL' as const,
      status: 'ACTIVE' as const,
    },
  ]

  const teamMemberDefaults: Record<
    string,
    {
      position: string | null
      jerseyNumber: number | null
      operationalStatus: 'ACTIVE' | 'NEW_PLAYER' | 'INACTIVE'
    }
  > = {
    'seed-player-1': {
      position: 'CM',
      jerseyNumber: 8,
      operationalStatus: 'NEW_PLAYER',
    },
    'seed-player-2': {
      position: 'CB',
      jerseyNumber: 4,
      operationalStatus: 'INACTIVE',
    },
    'seed-free-agent-1': {
      position: 'RW',
      jerseyNumber: null,
      operationalStatus: 'ACTIVE',
    },
    'seed-player-3': {
      position: 'ST',
      jerseyNumber: 9,
      operationalStatus: 'ACTIVE',
    },
    'seed-player-4': {
      position: 'GK',
      jerseyNumber: 1,
      operationalStatus: 'ACTIVE',
    },
  }

  for (const a of accessData) {
    await prisma.teamAccess.upsert({
      where: { teamId_userId_role: { teamId: a.teamId, userId: a.userId, role: a.role } },
      create: {
        clubId: a.clubId,
        teamId: a.teamId,
        userId: a.userId,
        role: a.role,
        phase: a.phase,
        status: a.status,
      },
      update: {
        phase: a.phase,
        status: a.status,
      },
    })

    if (a.role === 'PLAYER') {
      const defaults = teamMemberDefaults[a.userId] || {
        position: null,
        jerseyNumber: null,
        operationalStatus: 'ACTIVE' as const,
      }
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
          position: defaults.position,
          jerseyNumber: defaults.jerseyNumber,
          operationalStatus: defaults.operationalStatus,
        },
        update: {
          position: defaults.position,
          jerseyNumber: defaults.jerseyNumber,
          operationalStatus: defaults.operationalStatus,
        },
      })
    }
  }
  console.log(`  ${accessData.length} team access records`)

  await prisma.guardianRelationship.upsert({
    where: { id: 'seed-guardian-1' },
    create: {
      id: 'seed-guardian-1',
      clubId: club.id,
      teamId: u15.id,
      parentUserId: 'seed-parent-1',
      playerUserId: 'seed-player-3',
      childName: 'Jonas Braun',
    },
    update: {
      teamId: u15.id,
      childName: 'Jonas Braun',
    },
  })

  console.log('  Guardian relationship: Anna Bauer -> Jonas Braun')

  const now = new Date()
  const nextFriday = new Date(now)
  nextFriday.setDate(now.getDate() + ((5 - now.getDay() + 7) % 7 || 7))
  nextFriday.setHours(18, 0, 0, 0)

  await prisma.injuryReport.upsert({
    where: { id: 'seed-injury-1' },
    create: {
      id: 'seed-injury-1',
      clubId: club.id,
      teamId: herren1.id,
      userId: 'seed-player-2',
      reportedById: 'seed-coach-1',
      title: 'Hamstring strain',
      status: 'OUT',
      expectedReturnLabel: '2 weeks',
    },
    update: {
      title: 'Hamstring strain',
      status: 'OUT',
      expectedReturnLabel: '2 weeks',
      clearedAt: null,
    },
  })

  await prisma.injuryReport.upsert({
    where: { id: 'seed-injury-2' },
    create: {
      id: 'seed-injury-2',
      clubId: club.id,
      teamId: u15.id,
      userId: 'seed-player-3',
      reportedById: 'seed-coach-2',
      title: 'Ankle knock',
      status: 'DOUBTFUL',
      expectedReturnLabel: 'Day to day',
    },
    update: {
      title: 'Ankle knock',
      status: 'DOUBTFUL',
      expectedReturnLabel: 'Day to day',
      clearedAt: null,
    },
  })

  await prisma.teamDutyAssignment.upsert({
    where: { id: 'seed-duty-1' },
    create: {
      id: 'seed-duty-1',
      clubId: club.id,
      teamId: herren1.id,
      assignedUserId: 'seed-player-1',
      createdById: 'seed-coach-1',
      kind: 'JERSEY_CLEANUP',
      status: 'PENDING',
      dueDate: nextFriday,
    },
    update: {
      assignedUserId: 'seed-player-1',
      kind: 'JERSEY_CLEANUP',
      status: 'PENDING',
      dueDate: nextFriday,
      completedAt: null,
    },
  })

  await prisma.teamDutyAssignment.upsert({
    where: { id: 'seed-duty-2' },
    create: {
      id: 'seed-duty-2',
      clubId: club.id,
      teamId: u15.id,
      assignedUserId: 'seed-player-4',
      createdById: 'seed-coach-2',
      kind: 'BIB_CLEANUP',
      status: 'COMPLETED',
      completedAt: new Date(),
    },
    update: {
      assignedUserId: 'seed-player-4',
      kind: 'BIB_CLEANUP',
      status: 'COMPLETED',
      completedAt: new Date(),
    },
  })

  console.log('  Operational demo data: trials, injuries, and kit duties')

  // Events
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

  await prisma.trialInvite.upsert({
    where: { id: 'seed-trial-invite-1' },
    create: {
      id: 'seed-trial-invite-1',
      clubId: club.id,
      freeAgentProfileId: 'seed-free-agent-profile-1',
      teamId: herren1.id,
      sentByUserId: 'seed-coach-1',
      message: 'Come to training on Tuesday and meet the squad.',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: 'PENDING',
    },
    update: {
      message: 'Come to training on Tuesday and meet the squad.',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: 'PENDING',
    },
  })

  await prisma.joinRequest.upsert({
    where: {
      clubId_userId: {
        clubId: club.id,
        userId: 'seed-free-agent-2',
      },
    },
    create: {
      clubId: club.id,
      userId: 'seed-free-agent-2',
      role: 'PLAYER',
      message: 'Looking for a structured squad and ready to join immediately.',
      status: 'PENDING',
    },
    update: {
      role: 'PLAYER',
      message: 'Looking for a structured squad and ready to join immediately.',
      status: 'PENDING',
    },
  })

  console.log('  Trial invite + join request seeded')

  console.log('Seed complete.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
