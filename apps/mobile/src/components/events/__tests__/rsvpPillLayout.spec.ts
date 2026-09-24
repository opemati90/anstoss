import { decidePillLayout } from '../RsvpControl'

// home revamp: layout is chosen from MEASURED label widths (DM Sans, callout
// 16pt semibold at font scale 1), not a characters-times-0.5em estimate.
// Track = phone width - 16pt screen gutters - 16pt card padding on each side.
const track = (phoneWidth: number) => phoneWidth - 64

const LABELS = {
  // [Zusage, Vielleicht, Absage] widths in pt, as measured on device.
  de: [58, 75, 54],
  tr: [80, 40, 97], // Geliyorum · Belki · Gelemiyorum
  pt: [30, 48, 58], // Vou · Talvez · Não vou
  fr: [60, 68, 52], // Présent · Peut-être · Absent
}

describe('decidePillLayout', () => {
  it('keeps German "Vielleicht" on one row (icon above label) at 375pt instead of stacking pills', () => {
    // The old estimate (10 chars * 16 * 0.5) sent this to 'column'.
    expect(decidePillLayout({ trackWidth: track(375), labelWidths: LABELS.de })).toBe('tall')
    expect(decidePillLayout({ trackWidth: track(393), labelWidths: LABELS.de })).toBe('tall')
    expect(decidePillLayout({ trackWidth: track(320), labelWidths: LABELS.de })).toBe('tall')
  })

  it('fits Turkish "Gelemiyorum" in the tall layout on 375/393pt and stacks only at 320pt', () => {
    expect(decidePillLayout({ trackWidth: track(393), labelWidths: LABELS.tr })).toBe('tall')
    expect(decidePillLayout({ trackWidth: track(375), labelWidths: LABELS.tr })).toBe('tall')
    expect(decidePillLayout({ trackWidth: track(320), labelWidths: LABELS.tr })).toBe('column')
  })

  it('keeps short Portuguese labels inline where they fit', () => {
    expect(decidePillLayout({ trackWidth: track(393), labelWidths: LABELS.pt })).toBe('inline')
    expect(decidePillLayout({ trackWidth: track(375), labelWidths: LABELS.pt })).toBe('tall')
    expect(decidePillLayout({ trackWidth: track(320), labelWidths: LABELS.pt })).toBe('tall')
  })

  it('handles French at every width without a column', () => {
    expect(decidePillLayout({ trackWidth: track(393), labelWidths: LABELS.fr })).toBe('tall')
    expect(decidePillLayout({ trackWidth: track(375), labelWidths: LABELS.fr })).toBe('tall')
    expect(decidePillLayout({ trackWidth: track(320), labelWidths: LABELS.fr })).toBe('tall')
  })

  it('uses the scaled measurement: at 2x text German stacks on a small phone', () => {
    const doubled = LABELS.de.map((w) => w * 1.8)
    expect(decidePillLayout({ trackWidth: track(320), labelWidths: doubled })).toBe('column')
  })

  it('reports inline while unmeasured (the control is hidden until measured)', () => {
    expect(decidePillLayout({ trackWidth: 0, labelWidths: LABELS.de })).toBe('inline')
    expect(decidePillLayout({ trackWidth: 311, labelWidths: null })).toBe('inline')
  })
})
