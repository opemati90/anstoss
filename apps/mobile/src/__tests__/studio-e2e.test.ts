import { activateE2EScenario, clearE2ESession, handleE2EApiRequest } from '../e2e/session'
import { resetPlanMock } from '../e2e/planMocks'

const club = '/clubs/club-e2e-sv-albatros'
const path = `${club}/studio/brand-kit`
const read = () => handleE2EApiRequest(path, { method: 'GET' })
const trial = () => handleE2EApiRequest(`${club}/plan/trial`, { method: 'POST' })

beforeEach(() => resetPlanMock())
afterEach(async () => {
  await clearE2ESession()
  resetPlanMock()
})

it('requires a demo paid plan before brand-kit access', async () => {
  await activateE2EScenario('club-admin')
  expect(read()).toMatchObject({ handled: true, ok: false, status: 403 })
  expect(trial()).toMatchObject({ handled: true, status: 201 })
  expect(read()).toMatchObject({ handled: true, ok: true, body: { fontPairing: 'CONDENSED' } })
})

it('reads back confirmed changes and clears them when the persona is replaced', async () => {
  await activateE2EScenario('club-admin')
  trial()
  expect(
    handleE2EApiRequest(path, { method: 'PUT', body: { fontPairing: 'MODERN' } }),
  ).toMatchObject({ handled: true, ok: true, body: { fontPairing: 'MODERN' } })
  expect(read()).toMatchObject({ body: { fontPairing: 'MODERN' } })
  await activateE2EScenario('club-admin')
  expect(read()).toMatchObject({ body: { fontPairing: 'CONDENSED' } })
})

it('rejects another club and rejects a player even after a trial starts', async () => {
  await activateE2EScenario('club-admin')
  trial()
  expect(handleE2EApiRequest('/clubs/other/studio/brand-kit', { method: 'GET' })).toMatchObject({
    handled: true,
    status: 403,
  })
  await activateE2EScenario('player')
  expect(read()).toMatchObject({ handled: true, status: 403 })
})

it('rejects invalid settings and does not mutate the saved kit', async () => {
  await activateE2EScenario('club-admin')
  trial()
  for (const body of [{ fontPairing: 'INVALID' }, { credits: 999 }, { sponsors: ['foreign'] }]) {
    expect(handleE2EApiRequest(path, { method: 'PUT', body })).toMatchObject({
      handled: true,
      status: 400,
    })
  }
  expect(read()).toMatchObject({ body: { fontPairing: 'CONDENSED', sponsors: [] } })
})

it('never serves demo data outside the development runtime', async () => {
  await activateE2EScenario('club-admin')
  const runtime = global as typeof globalThis & { __DEV__?: boolean }
  const previous = runtime.__DEV__
  try {
    runtime.__DEV__ = false
    expect(read()).toEqual({ handled: false })
  } finally {
    runtime.__DEV__ = previous
  }
})
