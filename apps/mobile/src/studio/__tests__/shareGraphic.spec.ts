import {
  shareStudioGraphic,
  StudioExportError,
  type StudioShareDependencies,
} from '../shareGraphic'

const dependencies = (): StudioShareDependencies => ({
  isCurrent: jest.fn(() => true),
  capture: jest.fn(async () => 'file:///tmp/graphic.png'),
  available: jest.fn(async () => true),
  share: jest.fn(async () => 'opened' as const),
  release: jest.fn(),
})

it('reports a share-sheet handoff, never a published post', async () => {
  const deps = dependencies()
  expect(await shareStudioGraphic(deps)).toBe('share-sheet-opened')
  expect(deps.release).toHaveBeenCalledWith('file:///tmp/graphic.png')
})

it.each(['reject', 'empty'])('fails honestly when capture is %s', async (kind) => {
  const deps = dependencies()
  deps.capture = jest.fn(async () => {
    if (kind === 'reject') throw new Error('capture')
    return null
  })
  await expect(shareStudioGraphic(deps)).rejects.toEqual(new StudioExportError('capture-failed'))
  expect(deps.share).not.toHaveBeenCalled()
})

it.each(['false', 'reject'])(
  'rejects unavailable sharing (%s) and releases the image',
  async (kind) => {
    const deps = dependencies()
    deps.available = jest.fn(async () => {
      if (kind === 'reject') throw new Error('unavailable')
      return false
    })
    await expect(shareStudioGraphic(deps)).rejects.toEqual(
      new StudioExportError('sharing-unavailable'),
    )
    expect(deps.share).not.toHaveBeenCalled()
    expect(deps.release).toHaveBeenCalledTimes(1)
  },
)

it.each(['return', 'abort'])('does not turn cancellation (%s) into success', async (kind) => {
  const deps = dependencies()
  deps.share = async () => {
    if (kind === 'abort') throw { name: 'AbortError' }
    return 'cancelled'
  }
  expect(await shareStudioGraphic(deps)).toBe('cancelled')
  expect(deps.release).toHaveBeenCalledTimes(1)
})

it('reports native sharing failure', async () => {
  const deps = dependencies()
  deps.share = async () => {
    throw new Error('native failure')
  }
  await expect(shareStudioGraphic(deps)).rejects.toEqual(new StudioExportError('share-failed'))
  expect(deps.release).toHaveBeenCalledTimes(1)
})

it.each(['start', 'capture', 'available', 'share'])('discards stale scope at %s', async (stage) => {
  const deps = dependencies()
  let current = stage !== 'start'
  deps.isCurrent = () => current
  deps.capture = jest.fn(async () => {
    if (stage === 'capture') current = false
    return 'file:///tmp/graphic.png'
  })
  deps.available = async () => {
    if (stage === 'available') current = false
    return true
  }
  deps.share = jest.fn(async () => {
    if (stage === 'share') current = false
    return 'opened'
  })
  expect(await shareStudioGraphic(deps)).toBe('discarded')
  if (stage !== 'share') expect(deps.share).not.toHaveBeenCalled()
  if (stage === 'start') expect(deps.capture).not.toHaveBeenCalled()
  else expect(deps.release).toHaveBeenCalledTimes(1)
})

it('does not let cleanup failure turn a completed handoff into an error', async () => {
  const deps = dependencies()
  deps.release = async () => {
    throw new Error('cleanup failed')
  }
  expect(await shareStudioGraphic(deps)).toBe('share-sheet-opened')
})
