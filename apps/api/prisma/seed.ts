import { PrismaClient } from '@prisma/client'

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
      { id: 'seed-coach-1', clerkId: 'seed_clerk_coach1', name: 'Max Müller', email: 'max@demo.anstoss.app' },
      { id: 'seed-coach-2', clerkId: 'seed_clerk_coach2', name: 'Lena Schmidt', email: 'lena@demo.anstoss.app' },
      { id: 'seed-player-1', clerkId: 'seed_clerk_player1', name: 'Kai Fischer', email: 'kai@demo.anstoss.app' },
      { id: 'seed-player-2', clerkId: 'seed_clerk_player2', name: 'Tim Weber', email: 'tim@demo.anstoss.app' },
      { id: 'seed-player-3', clerkId: 'seed_clerk_player3', name: 'Jonas Braun', email: 'jonas@demo.anstoss.app' },
    ].map((u) =>
      prisma.user.upsert({
        where: { id: u.id },
        create: { id: u.id, clerkId: u.clerkId, name: u.name, email: u.email },
        update: { name: u.name },
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
    { userId: 'seed-coach-1', role: 'OWNER' as const },
    { userId: 'seed-coach-2', role: 'COACH' as const },
    { userId: 'seed-player-1', role: 'PLAYER' as const },
    { userId: 'seed-player-2', role: 'PLAYER' as const },
    { userId: 'seed-player-3', role: 'PLAYER' as const },
  ]
  for (const m of membershipData) {
    await prisma.membership.upsert({
      where: { userId_clubId: { userId: m.userId, clubId: club.id } },
      create: { userId: m.userId, clubId: club.id, role: m.role },
      update: { role: m.role },
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
      createdByUserId: 'seed-coach-1',
      type: 'TRAINING' as const,
      title: 'Training 1. Herren',
      startTime: nextTuesday,
      endTime: new Date(nextTuesday.getTime() + 90 * 60000),
      location: 'Sportplatz Am Waldrand',
    },
    {
      id: 'seed-event-match',
      clubId: club.id,
      teamId: herren1.id,
      createdByUserId: 'seed-coach-1',
      type: 'MATCH' as const,
      title: 'Kreisliga A — vs. SV Beispielheim',
      startTime: nextSunday,
      endTime: new Date(nextSunday.getTime() + 120 * 60000),
      location: 'Sportanlage Musterstadt',
    },
    {
      id: 'seed-event-youth-training',
      clubId: club.id,
      teamId: u15.id,
      createdByUserId: 'seed-coach-2',
      type: 'TRAINING' as const,
      title: 'Training C-Jugend',
      startTime: nextSaturday,
      endTime: new Date(nextSaturday.getTime() + 75 * 60000),
      location: 'Kunstrasen Musterstadt',
    },
  ]
  for (const e of events) {
    await prisma.event.upsert({
      where: { id: e.id },
      create: e,
      update: { title: e.title, startTime: e.startTime, endTime: e.endTime },
    })
  }
  console.log(`  ${events.length} events`)

  console.log('Seed complete.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
