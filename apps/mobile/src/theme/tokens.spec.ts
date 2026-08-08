import { elevation } from './tokens'

describe('surface depth contract', () => {
  it.each(['card', 'hero', 'cardInner', 'heroInner', 'pill'] as const)(
    'keeps %s content surfaces flat',
    (surface) => {
      expect(elevation[surface].elevation).toBe(0)
      expect(elevation[surface].shadowOpacity).toBe(0)
      expect(elevation[surface].shadowRadius).toBe(0)
    },
  )

  it('reserves elevation for controls that physically float above content', () => {
    expect(elevation.fab.elevation).toBeGreaterThan(0)
    expect(elevation.fab.shadowOpacity).toBeGreaterThan(0)
  })
})
