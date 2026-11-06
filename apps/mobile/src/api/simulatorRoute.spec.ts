import { isSimulatorFixtureRoute, withoutAuthorization } from './simulatorRoute'

const route = '/clubs/club-e2e-sv-albatros/events/event-match-away/rsvp'

describe('local simulator fixture isolation', () => {
  it('requires development mode, explicit opt-in, a fixture session and an exact path', () => {
    expect(isSimulatorFixtureRoute(true, '1', true, route)).toBe(true)
    expect(isSimulatorFixtureRoute(false, '1', true, route)).toBe(false)
    expect(isSimulatorFixtureRoute(true, undefined, true, route)).toBe(false)
    expect(isSimulatorFixtureRoute(true, '1', false, route)).toBe(false)
    expect(isSimulatorFixtureRoute(true, '1', true, `${route}/other`)).toBe(false)
    expect(isSimulatorFixtureRoute(true, '1', true, route.replace('event-match-away', 'other'))).toBe(false)
  })

  it('removes authorization regardless of header capitalization', () => {
    expect(withoutAuthorization({ Authorization: 'secret', authorization: 'secret', 'x-other': 'ok' })).toEqual({ 'x-other': 'ok' })
  })
})
