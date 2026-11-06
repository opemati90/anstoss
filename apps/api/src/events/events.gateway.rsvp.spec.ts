import { EventsGateway } from './events.gateway'

describe('EventsGateway RSVP invalidation', () => {
  it('requests an authoritative feed refresh instead of broadcasting raw historical counts', async () => {
    const emit = jest.fn()
    const to = jest.fn().mockReturnValue({ emit })
    const gateway = new EventsGateway({} as never, {} as never)
    gateway.server = { to } as never

    await gateway.emitRsvpUpdate('team-1', 'event-1')

    expect(to).toHaveBeenCalledWith('team:team-1')
    expect(emit).toHaveBeenCalledWith('event:upsert', { eventId: 'event-1', teamId: 'team-1' })
    expect(emit).toHaveBeenCalledTimes(1)
  })
})
