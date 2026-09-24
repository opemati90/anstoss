import { applyTyping, createRefetchThrottle, pruneTyping } from './inboxLive'

function fakeTimers() {
  let now = 0
  const queue: Array<{ at: number; fn: () => void; id: number }> = []
  let seq = 0
  return {
    timers: {
      now: () => now,
      setTimeout: (fn: () => void, ms: number) => {
        const id = ++seq
        queue.push({ at: now + ms, fn, id })
        return id
      },
      clearTimeout: (handle: unknown) => {
        const index = queue.findIndex((q) => q.id === handle)
        if (index >= 0) queue.splice(index, 1)
      },
    },
    advance(ms: number) {
      now += ms
      for (const entry of queue.slice().sort((a, b) => a.at - b.at)) {
        if (entry.at <= now) {
          queue.splice(queue.indexOf(entry), 1)
          entry.fn()
        }
      }
    },
  }
}

describe('createRefetchThrottle (H4 client)', () => {
  it('refetches at most once per window however many inbox:update events arrive', () => {
    const clock = fakeTimers()
    const run = jest.fn()
    const throttle = createRefetchThrottle(run, 2000, clock.timers)

    throttle.schedule() // leading
    for (let i = 0; i < 50; i += 1) {
      clock.advance(20)
      throttle.schedule()
    }
    expect(run).toHaveBeenCalledTimes(1)

    clock.advance(2000) // trailing
    expect(run).toHaveBeenCalledTimes(2)

    // A burst inside the next window still yields a single trailing call.
    throttle.schedule()
    throttle.schedule()
    expect(run).toHaveBeenCalledTimes(2)
    clock.advance(2000)
    expect(run).toHaveBeenCalledTimes(3)
  })

  it('drops the pending trailing refetch on cancel (unmount / club switch)', () => {
    const clock = fakeTimers()
    const run = jest.fn()
    const throttle = createRefetchThrottle(run, 2000, clock.timers)
    throttle.schedule()
    throttle.schedule()
    throttle.cancel()
    clock.advance(5000)
    expect(run).toHaveBeenCalledTimes(1)
  })
})

describe('inbox typing map', () => {
  it('records who types and expires the entry after the TTL', () => {
    let map = applyTyping({}, { type: 'DM', id: 'c-1', userName: 'Tim' }, 1000, 4000)
    expect(map['c-1']).toEqual({ userName: 'Tim', until: 5000 })
    expect(pruneTyping(map, 4999)).toBe(map)
    map = pruneTyping(map, 5000)
    expect(map).toEqual({})
  })

  it('ignores malformed events', () => {
    const map = {}
    expect(applyTyping(map, { type: 'DM' }, 0)).toBe(map)
    expect(applyTyping(map, null, 0)).toBe(map)
  })
})
