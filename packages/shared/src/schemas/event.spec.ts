import { createEventSchema, createEventSeriesSchema, updateEventSchema } from './event'

describe('createEventSchema', () => {
  const futureDate = new Date(Date.now() + 86400000).toISOString()

  it('accepts valid event', () => {
    const result = createEventSchema.safeParse({
      title: 'Training',
      type: 'TRAINING',
      date: futureDate,
      teamId: 'team-123',
    })
    expect(result.success).toBe(true)
  })

  it('rejects short title', () => {
    const result = createEventSchema.safeParse({
      title: 'T',
      type: 'TRAINING',
      date: futureDate,
      teamId: 'team-123',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid event type', () => {
    const result = createEventSchema.safeParse({
      title: 'Training',
      type: 'INVALID',
      date: futureDate,
      teamId: 'team-123',
    })
    expect(result.success).toBe(false)
  })

  it('accepts all valid event types', () => {
    for (const type of ['TRAINING', 'MATCH', 'OTHER']) {
      const result = createEventSchema.safeParse({
        title: 'Test Event',
        type,
        date: futureDate,
        teamId: 'team-123',
      })
      expect(result.success).toBe(true)
    }
  })

  it('rejects past date', () => {
    const pastDate = new Date('2020-01-01').toISOString()
    const result = createEventSchema.safeParse({
      title: 'Training',
      type: 'TRAINING',
      date: pastDate,
      teamId: 'team-123',
    })
    expect(result.success).toBe(false)
  })

  it('rejects missing teamId', () => {
    const result = createEventSchema.safeParse({
      title: 'Training',
      type: 'TRAINING',
      date: futureDate,
    })
    expect(result.success).toBe(false)
  })

  it('accepts optional location and notes', () => {
    const result = createEventSchema.safeParse({
      title: 'Training',
      type: 'TRAINING',
      date: futureDate,
      teamId: 'team-123',
      location: 'Sportplatz Am Wald',
      notes: 'Bring Schienbeinschoner',
    })
    expect(result.success).toBe(true)
  })
})

describe('createEventSeriesSchema', () => {
  const firstDate = new Date(Date.now() + 7 * 86400000)

  function payload(until: Date, intervalWeeks: 1 | 2 = 1) {
    return {
      title: 'Training',
      type: 'TRAINING',
      date: firstDate.toISOString(),
      teamId: 'team-123',
      repeat: {
        intervalWeeks,
        until: until.toISOString(),
      },
    }
  }

  it('accepts up to 53 weekly occurrences', () => {
    const until = new Date(firstDate)
    until.setDate(until.getDate() + 52 * 7)

    expect(createEventSeriesSchema.safeParse(payload(until)).success).toBe(true)
  })

  it('rejects a 54th weekly occurrence instead of silently truncating it', () => {
    const until = new Date(firstDate)
    until.setDate(until.getDate() + 53 * 7)

    expect(createEventSeriesSchema.safeParse(payload(until)).success).toBe(false)
  })

  it('rejects biweekly ranges longer than one year', () => {
    const until = new Date(firstDate)
    until.setDate(until.getDate() + 54 * 7)

    expect(createEventSeriesSchema.safeParse(payload(until, 2)).success).toBe(false)
  })
})

describe('updateEventSchema', () => {
  const futureDate = new Date(Date.now() + 86400000).toISOString()

  it('accepts empty object (no fields required)', () => {
    const result = updateEventSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('accepts partial update with title only', () => {
    const result = updateEventSchema.safeParse({ title: 'New Title' })
    expect(result.success).toBe(true)
  })

  it('rejects title shorter than 2 chars when provided', () => {
    const result = updateEventSchema.safeParse({ title: 'X' })
    expect(result.success).toBe(false)
  })

  it('rejects invalid event type when provided', () => {
    const result = updateEventSchema.safeParse({ type: 'INVALID' })
    expect(result.success).toBe(false)
  })

  it('accepts a past date so a coach can correct a past event (the service guards moves)', () => {
    const result = updateEventSchema.safeParse({ date: '2020-01-01T00:00:00Z' })
    expect(result.success).toBe(true)
  })

  it('rejects an invalid date', () => {
    expect(updateEventSchema.safeParse({ date: 'not a date' }).success).toBe(false)
  })

  it('lets an update clear location and notes with null (L6)', () => {
    const result = updateEventSchema.safeParse({ location: null, notes: null })
    expect(result.success).toBe(true)
  })

  it('rejects a meeting time after the new start (L8)', () => {
    const result = updateEventSchema.safeParse({
      date: '2030-10-04T13:00:00.000Z',
      meetingAt: '2030-10-04T14:00:00.000Z',
    })
    expect(result.success).toBe(false)
  })

  it('accepts future date when provided', () => {
    const result = updateEventSchema.safeParse({ date: futureDate })
    expect(result.success).toBe(true)
  })

  it('accepts multiple optional fields together', () => {
    const result = updateEventSchema.safeParse({
      title: 'Updated Training',
      type: 'MATCH',
      date: futureDate,
      location: 'New Field',
      notes: 'Updated notes',
    })
    expect(result.success).toBe(true)
  })
})

describe('event logistics and multi-weekday series', () => {
  const kickoff = new Date(Date.now() + 5 * 86400000)
  const meeting = new Date(kickoff.getTime() - 60 * 60000)

  it('accepts opponent, homeAway, meeting time and carpool flag', () => {
    const result = createEventSchema.safeParse({
      title: '@ SV Babelsberg 03',
      type: 'MATCH',
      date: kickoff.toISOString(),
      teamId: 'team-1',
      opponent: 'SV Babelsberg 03',
      homeAway: 'AWAY',
      meetingAt: meeting.toISOString(),
      meetingPoint: 'Parkplatz Vereinsheim',
      carpoolEnabled: true,
    })
    expect(result.success).toBe(true)
  })

  it('rejects a meeting time after kickoff', () => {
    const result = createEventSchema.safeParse({
      title: 'vs. SV Babelsberg 03',
      type: 'MATCH',
      date: kickoff.toISOString(),
      teamId: 'team-1',
      meetingAt: new Date(kickoff.getTime() + 60000).toISOString(),
    })
    expect(result.success).toBe(false)
  })

  it('accepts a Di + Do series across a season', () => {
    const until = new Date(kickoff)
    until.setDate(until.getDate() + 40 * 7)
    const result = createEventSeriesSchema.safeParse({
      title: 'Training',
      type: 'TRAINING',
      date: kickoff.toISOString(),
      teamId: 'team-1',
      repeat: { intervalWeeks: 1, until: until.toISOString(), weekdays: [2, 4] },
    })
    expect(result.success).toBe(true)
  })

  it('rejects weekday numbers outside 0-6', () => {
    const until = new Date(kickoff)
    until.setDate(until.getDate() + 14)
    const result = createEventSeriesSchema.safeParse({
      title: 'Training',
      type: 'TRAINING',
      date: kickoff.toISOString(),
      teamId: 'team-1',
      repeat: { intervalWeeks: 1, until: until.toISOString(), weekdays: [7] },
    })
    expect(result.success).toBe(false)
  })

  it('lets an update clear the meeting point with null', () => {
    expect(updateEventSchema.safeParse({ meetingPoint: null, homeAway: null }).success).toBe(true)
  })
})


describe('series season end and titles (review fixes)', () => {
  it('accepts "Bis Saisonende" from 1 July to 30 June (53 calendar weeks, L5)', () => {
    const year = new Date().getFullYear() + 1
    // Wednesday 1 July, 19:00 local: the week of 30 June the year after is the 53rd.
    const first = new Date(year, 6, 1, 19, 0)
    const until = new Date(year + 1, 5, 30, 23, 59)
    const result = createEventSeriesSchema.safeParse({
      type: 'TRAINING',
      date: first.toISOString(),
      teamId: 'team-1',
      repeat: { intervalWeeks: 1, until: until.toISOString(), weekdays: [first.getDay()] },
    })
    expect(result.success).toBe(true)
  })

  it('caps a series at four training days a week (M4)', () => {
    const first = new Date(Date.now() + 86400000)
    const until = new Date(first.getTime() + 30 * 86400000)
    const base = {
      type: 'TRAINING',
      date: first.toISOString(),
      teamId: 'team-1',
    }
    expect(
      createEventSeriesSchema.safeParse({
        ...base,
        repeat: { intervalWeeks: 1, until: until.toISOString(), weekdays: [1, 2, 3, 4] },
      }).success,
    ).toBe(true)
    expect(
      createEventSeriesSchema.safeParse({
        ...base,
        repeat: { intervalWeeks: 1, until: until.toISOString(), weekdays: [1, 2, 3, 4, 5] },
      }).success,
    ).toBe(false)
  })

  it('lets a Training and a match with an opponent go without a title (L7, M6)', () => {
    const date = new Date(Date.now() + 86400000).toISOString()
    expect(createEventSchema.safeParse({ type: 'TRAINING', date, teamId: 't' }).success).toBe(true)
    expect(
      createEventSchema.safeParse({ type: 'MATCH', date, teamId: 't', opponent: 'SV Babelsberg 03' })
        .success,
    ).toBe(true)
    expect(createEventSchema.safeParse({ type: 'MATCH', date, teamId: 't' }).success).toBe(false)
    expect(createEventSchema.safeParse({ type: 'OTHER', date, teamId: 't' }).success).toBe(false)
  })
})
