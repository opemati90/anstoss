import { MarketplaceController } from './marketplace.controller'

describe('free-agent media ownership', () => {
  const service = { addMedia: jest.fn() }
  const r2 = {
    enabled: true,
    objectKeyFromUrl: jest.fn((url: string) => url.startsWith('https://assets.invalid/')
      ? url.slice('https://assets.invalid/'.length) : null),
    assertStoredObject: jest.fn(),
  }
  let controller: MarketplaceController
  const input = {
    type: 'VIDEO',
    url: 'https://assets.invalid/users/sender/free-agent/video/clip.mp4',
    thumbnailUrl: 'https://assets.invalid/users/sender/free-agent/photo/cover.jpg',
  }

  beforeEach(() => {
    jest.clearAllMocks()
    r2.enabled = true
    r2.assertStoredObject.mockResolvedValue(undefined)
    service.addMedia.mockResolvedValue({ id: 'media' })
    controller = new MarketplaceController(service as never, r2 as never, {} as never)
  })

  it('checks the owned video and image thumbnail before storing', async () => {
    await expect(controller.addFreeAgentMedia({ id: 'sender' }, input)).resolves.toEqual({ id: 'media' })
    expect(r2.assertStoredObject).toHaveBeenNthCalledWith(1, 'users/sender/free-agent/video/clip.mp4', expect.objectContaining({ maxBytes: 100 * 1024 * 1024 }))
    expect(r2.assertStoredObject).toHaveBeenNthCalledWith(2, 'users/sender/free-agent/photo/cover.jpg', expect.objectContaining({ maxBytes: 10 * 1024 * 1024 }))
    expect(service.addMedia).toHaveBeenCalledWith('sender', input)
  })

  it.each([
    'https://assets.invalid/users/victim/free-agent/photo/cover.jpg',
    'https://assets.invalid/users/victim/avatar/portrait.png',
    'https://outside.invalid/cover.jpg',
    'https://assets.invalid/users/sender/free-agent/video/not-an-image.mp4',
  ])('rejects a foreign, external or non-photo thumbnail %s', async (thumbnailUrl) => {
    await expect(controller.addFreeAgentMedia({ id: 'sender' }, { ...input, thumbnailUrl })).rejects.toThrow('does not belong')
    expect(service.addMedia).not.toHaveBeenCalled()
  })

  it('fails closed when storage is unavailable', async () => {
    r2.enabled = false
    await expect(controller.addFreeAgentMedia({ id: 'sender' }, input)).rejects.toThrow('unavailable')
    expect(service.addMedia).not.toHaveBeenCalled()
  })

  it('does not accept a thumbnail whose stored MIME is invalid', async () => {
    r2.assertStoredObject.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('bad type'))
    await expect(controller.addFreeAgentMedia({ id: 'sender' }, input)).rejects.toThrow('invalid or incomplete')
    expect(service.addMedia).not.toHaveBeenCalled()
  })
})
