/** Local connected-QA counterpart. Uses normal OTP and domain HTTP endpoints. */
import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { io } from 'socket.io-client'

const [statePath, action] = process.argv.slice(2)
const state = JSON.parse(readFileSync(statePath, 'utf8'))
assert.equal(state.apiUrl, 'http://127.0.0.1:3167', 'Only the local QA API is allowed')
assert.equal(state.emails.admin, 'admin@anstoss-simulator.invalid')
const journalPath = join(dirname(statePath), 'journeys.json')
const journal = existsSync(journalPath) ? JSON.parse(readFileSync(journalPath, 'utf8')) : { runId: state.runId, sessions: {} }
assert.equal(journal.runId, state.runId)
function saveJournal() {
  // Local ephemeral QA sessions only, private like state.json. Never print them.
  writeFileSync(journalPath, JSON.stringify(journal), { mode: 0o600 })
}

async function request(path, token, body, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(`${state.apiUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  assert.ok(response.ok, `${path}: HTTP ${response.status}`)
  const text = await response.text()
  return text ? JSON.parse(text) : null
}

async function login(role) {
  const email = state.emails[role]
  assert.ok(email?.endsWith('@anstoss-simulator.invalid'))
  const cached = journal.sessions[role]
  if (cached) {
    const me = await request('/me', cached)
    assert.equal(me.id, state.users[role])
    return cached
  }
  await request('/auth/otp/request', null, { email })
  const session = await request('/auth/otp/verify', null, { email, code: state.otpCode })
  assert.equal(session.user.id, state.users[role])
  journal.sessions[role] = session.token
  saveJournal()
  return session.token
}

if (action === 'withdraw-test-registration') {
  const token = await login('player')
  const me = await request('/me', token)
  const claim = me.pendingClubClaim
  assert.ok(claim, 'Expected the previous synthetic registration')
  const claims = await request('/club-claims/mine', token)
  const details = claims.find((item) => item.id === claim.id)
  assert.ok(details)
  assert.equal(details.directoryEntry.name, `Codex QA ${state.runId.slice(0, 8)}`)
  await request(`/club-claims/${claim.id}/withdraw`, token, {})
  await request('/me', token)
  console.log('PASS: withdrew only the previous synthetic QA club application through HTTP')
} else if (action === 'inspect-search') {
  const token = await login('admin')
  const response = await request('/clubs/search?q=Anstoss%20QA%20Lokal&limit=20', token)
  console.log(JSON.stringify(response))
} else if (action === 'request-player') {
  const token = await login('player')
  await request(`/clubs/${state.clubId}/join-requests`, token, { teamId: state.teamId, role: 'PLAYER' })
  console.log('PASS: synthetic player submitted a scoped join request through the real API')
} else if (action === 'approve-player') {
  const adminToken = await login('admin')
  const path = `/clubs/${state.clubId}/join-requests`
  const requests = await request(path, adminToken)
  const pending = requests.find((item) => item.user.id === state.users.player)
  assert.ok(pending, 'The native player must submit the request first')
  assert.equal(pending.teamId, state.teamId, 'Native request must target the selected squad')
  const result = await request(`${path}/${pending.id}/approve`, adminToken, {
    revision: pending.revision,
  })
  assert.equal(result.status, 'APPROVED')
  const remaining = await request(path, adminToken)
  assert.ok(!remaining.some((item) => item.id === pending.id))
  console.log('PASS: native player request found, approved through HTTP, removed from admin queue')
} else if (action === 'verify-player') {
  const token = await login('player')
  const me = await request('/me', token)
  assert.equal(me.pendingJoinRequest, null)
  assert.ok(me.memberships.some((item) => item.club.id === state.clubId))
  assert.ok(
    me.teamMembers.some((item) => item.team.id === state.teamId && item.status === 'ACTIVE'),
  )
  console.log('PASS: approved membership and active team access persisted in the real API')
} else if (action === 'create-coach-event') {
  const token = await login('coach')
  const operations = await request(`/clubs/${state.clubId}/teams/${state.teamId}/roster-ops`, token)
  const trial = operations.operations.trials.find((item) => item.userId === state.users.player)
  assert.ok(trial, 'Expected the approved player in trial squad')
  assert.equal(operations.team.id, state.teamId)
  await request(`/clubs/${state.clubId}/team-access/${trial.id}/decision`, token, { decision: 'ACCEPT' })
  assert.ok(!journal.eventId, 'QA event already created; inspect instead of duplicating')
  const date = new Date(Date.now() + 3 * 86400000).toISOString()
  const event = await request(`/clubs/${state.clubId}/events`, token, {
    teamId: state.teamId, type: 'TRAINING', title: 'Anstoss QA Training', date,
    location: 'QA Sportplatz Berlin',
  })
  journal.eventId = event.id
  journal.eventDate = date
  saveJournal()
  console.log('PASS: coach accepted QA player into the full squad and created training through HTTP')
} else if (action === 'prepare-chat') {
  const coach = await login('coach')
  const channels = await request(`/teams/${state.teamId}/channels`, coach)
  const channel = channels.find((item) => item.kind === 'TEAM')
  assert.ok(channel, 'Expected the actual team channel')
  journal.channelId = channel.id
  await request(`/clubs/${state.clubId}/channels/${channel.id}/messages`, coach, { content: 'Coach connected QA message' })
  const dm = await request(`/clubs/${state.clubId}/conversations`, coach, { participantId: state.users.player })
  journal.dmId = dm.id
  await request(`/clubs/${state.clubId}/conversations/${dm.id}/messages`, coach, { messageType: 'TEXT', content: 'Coach connected QA direct message' })
  saveJournal()
  console.log('PASS: coach sent real team and direct messages to the native player')
} else if (action === 'prepare-short-chat') {
  const admin = await login('admin')
  const dm = await request(`/clubs/${state.clubId}/conversations`, admin, { participantId: state.users.player })
  journal.shortDmId = dm.id
  saveJournal()
  const history = await request(`/clubs/${state.clubId}/conversations/${dm.id}/messages`, admin)
  if (!(history.messages ?? history).some((message) => message.content === 'Short conversation keyboard check')) {
    await request(`/clubs/${state.clubId}/conversations/${dm.id}/messages`, admin, {
      messageType: 'TEXT', content: 'Short conversation keyboard check',
    })
  }
  console.log('PASS: short real conversation ready for keyboard viewport regression')
} else if (action === 'prepare-keyboard-chat') {
  // Match the reported two-sided thread without touching real users or production.
  const admin = await login('admin')
  const player = await login('player')
  assert.ok(journal.shortDmId, 'Run prepare-short-chat first')
  const path = `/clubs/${state.clubId}/conversations/${journal.shortDmId}/messages`
  const history = await request(path, admin)
  const existing = new Set((history.messages ?? history).map((message) => message.content))
  for (const [token, content] of [
    [admin, 'Keyboard QA incoming second message'],
    [player, 'Keyboard QA outgoing first reply'],
    [admin, 'Keyboard QA incoming third message'],
    [player, 'Keyboard QA latest visible reply'],
  ]) {
    if (!existing.has(content)) await request(path, token, { messageType: 'TEXT', content })
  }
  console.log('PASS: five-message two-sided local keyboard fixture ready')
} else if (action === 'prepare-long-keyboard-chat') {
  const coach = await login('coach')
  const player = await login('player')
  assert.ok(journal.dmId && journal.channelId, 'Run prepare-chat first')
  const dmPath = `/clubs/${state.clubId}/conversations/${journal.dmId}`
  const history = await request(`${dmPath}/messages`, coach)
  if (!journal.longKeyboardPrepared) {
    const existing = new Set((history.messages ?? history).map((message) => message.content))
    for (let index = 1; index <= 40; index += 1) {
      const content = `Keyboard history ${String(index).padStart(2, '0')}`
      if (!existing.has(content)) {
        await request(`${dmPath}/messages`, index % 2 ? coach : player, { messageType: 'TEXT', content })
        await new Promise((resolve) => setTimeout(resolve, 300))
      }
    }
    for (const [token, content] of [[coach, 'Keyboard group coach message'], [player, 'Keyboard group player reply']]) {
      await request(`/clubs/${state.clubId}/channels/${journal.channelId}/messages`, token, { content })
    }
    journal.longKeyboardPrepared = true
    saveJournal()
  }
  await request(`${dmPath}/read`, player, {}, 'PUT')
  console.log('PASS: paginated DM and two-sender group prepared in isolated QA backend')
} else if (action === 'verify-keyboard-chat') {
  const coach = await login('coach')
  const history = await request(`/clubs/${state.clubId}/channels/${journal.channelId}/messages`, coach)
  assert.ok((history.messages ?? history).some((message) =>
    message.content === 'Keyboard native group send' && message.senderId === state.users.player))
  console.log('PASS: coach reads the keyboard-test message sent by the native QA player')
} else if (action === 'verify-chat') {
  const coach = await login('coach')
  const socket = io(`${state.apiUrl}/chat`, { auth: { token: coach }, transports: ['websocket'], reconnection: false })
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Socket connection timed out')), 10000)
      socket.once('connect', () => { clearTimeout(timer); resolve() })
      socket.once('connect_error', (error) => { clearTimeout(timer); reject(error) })
    })
    const history = await socket.timeout(10000).emitWithAck('history', { teamId: state.teamId, channelId: journal.channelId })
    assert.ok(history.data.messages.some((item) => item.content === 'Player connected QA reply' && item.senderId === state.users.player))
    const messages = await request(`/clubs/${state.clubId}/conversations/${journal.dmId}/messages`, coach)
    assert.ok((messages.messages ?? messages).some((item) => item.content === 'Player connected QA direct reply' && item.senderId === state.users.player))
    const player = await login('player')
    const forbidden = await fetch(`${state.apiUrl}/clubs/${state.clubId}/conversations/${journal.dmId}/lineup-options`, { headers: { Authorization: `Bearer ${player}` } })
    assert.equal(forbidden.status, 403)
    console.log('PASS: real coach socket history and DM API contain native player replies; player formation access denied')
  } finally { socket.disconnect() }
} else if (action === 'verify-player-rsvp') {
  assert.ok(journal.eventId)
  const token = await login('coach')
  const summary = await request(`/clubs/${state.clubId}/events/${journal.eventId}/rsvp-summary`, token)
  assert.deepEqual(summary, { yes: 1, maybe: 0, no: 0 })
  console.log('PASS: coach sees one YES response from native player')
} else if (action === 'reschedule-coach-event') {
  assert.ok(journal.eventId)
  const token = await login('coach')
  journal.eventDate = new Date(Date.now() + 4 * 86400000).toISOString()
  await request(`/clubs/${state.clubId}/events/${journal.eventId}`, token, { date: journal.eventDate }, 'PATCH')
  saveJournal()
  console.log('PASS: coach rescheduled the QA training through HTTP')
} else if (action === 'verify-player-reconfirmation') {
  assert.ok(journal.eventId)
  const token = await login('coach')
  const summary = await request(`/clubs/${state.clubId}/events/${journal.eventId}/rsvp-summary`, token)
  assert.deepEqual(summary, { yes: 0, maybe: 1, no: 0 })
  console.log('PASS: coach sees updated MAYBE response, with no duplicate YES count')
} else if (action === 'prepare-agent-trial') {
  const agent = await login('agent')
  const coach = await login('coach')
  const existing = await request('/me/free-agent-profile', agent)
  assert.equal(existing, null, 'Do not overwrite an existing QA profile')
  const profile = await request('/me/free-agent-profile', agent, {
    recruitmentRole: 'PLAYER', city: 'Berlin', postalCode: '12435', position: 'MID',
    bio: 'Fictional connected QA candidate', visibility: 'PRIVATE', isOnTransferList: false,
  })
  const hidden = await fetch(`${state.apiUrl}/free-agents/${profile.id}`, { headers: { Authorization: `Bearer ${coach}` } })
  assert.equal(hidden.status, 404)
  await request('/me/free-agent-profile', agent, { visibility: 'CLUB_ONLY', isOnTransferList: true }, 'PATCH')
  const visible = await request(`/free-agents/${profile.id}`, coach)
  assert.equal(visible.postalCode, null)
  const invitation = await request(`/clubs/${state.clubId}/trial-invites`, coach, {
    teamId: state.teamId, freeAgentProfileId: profile.id, sessionEventIds: [journal.eventId],
  })
  journal.trialId = invitation.id
  journal.agentProfileId = profile.id
  saveJournal()
  console.log('PASS: opt-in discovery hides the exact postcode; coach issued a real trial invitation')
} else if (action === 'verify-agent-accepted' || action === 'verify-agent-withdrawn') {
  const coach = await login('coach')
  const rows = await request(`/clubs/${state.clubId}/trial-invites`, coach)
  const invitation = rows.find((item) => item.id === journal.trialId)
  assert.equal(invitation?.status, action === 'verify-agent-accepted' ? 'ACCEPTED' : 'WITHDRAWN')
  console.log(`PASS: coach sees native candidate action ${invitation.status}`)
} else if (action === 'remove-player') {
  const admin = await login('admin')
  const player = await login('player')
  await request(`/clubs/${state.clubId}/members/${state.users.player}`, admin, undefined, 'DELETE')
  const me = await request('/me', player)
  assert.deepEqual(me.memberships, [])
  assert.equal(me.registrationRole, 'FREE_AGENT')
  const denied = await fetch(`${state.apiUrl}/clubs/${state.clubId}/events`, { headers: { Authorization: `Bearer ${player}` } })
  assert.equal(denied.status, 403)
  console.log('PASS: club removal revokes API access and routes the account to independent recruitment')
} else if (action === 'verify-player-deleted') {
  const response = await fetch(`${state.apiUrl}/me`, { headers: { Authorization: `Bearer ${journal.sessions.player}` } })
  assert.equal(response.status, 401, 'Deleted account must reject its old session')
  console.log('PASS: native account deletion invalidated the old session')
} else {
  throw new Error(`Unknown local QA action: ${action}`)
}
