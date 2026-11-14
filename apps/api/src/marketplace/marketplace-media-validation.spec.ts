import { MarketplaceController } from './marketplace.controller'

function setup(enabled = true) {
  const service = {
    assertMayAddMedia: jest.fn().mockResolvedValue(undefined),
    addMedia: jest.fn().mockResolvedValue({ id: 'media' }),
  }
  const r2 = {
    enabled,
    objectKeyFromUrl: (url: string) => url.startsWith('https://assets.test/') ? url.slice(20) : null,
    assertStoredObject: jest.fn().mockResolvedValue(undefined),
  }
  const controller = new MarketplaceController(service as never, r2 as never, {} as never)
  const input = {
    type: 'VIDEO', url: 'https://assets.test/users/u-1/free-agent/video/a.mp4',
    thumbnailUrl: 'https://assets.test/users/u-1/free-agent/photo/thumbnail.jpg',
  }
  return { service, r2, controller, input }
}

describe('recruitment media ownership and validation', () => {
  it('checks both clip and thumbnail objects before attaching them', async () => {
    const { controller, r2, service, input } = setup()
    await controller.addFreeAgentMedia({ id: 'u-1' }, input)
    expect(r2.assertStoredObject).toHaveBeenCalledTimes(2)
    expect(service.addMedia).toHaveBeenCalledWith('u-1', input)
  })

  it('rejects another person’s thumbnail without attaching or probing it', async () => {
    const { controller, r2, service, input } = setup()
    await expect(controller.addFreeAgentMedia({ id: 'u-1' }, {
      ...input, thumbnailUrl: 'https://assets.test/users/other/free-agent/photo/private.jpg',
    })).rejects.toThrow('Thumbnail does not belong')
    expect(r2.assertStoredObject).not.toHaveBeenCalled()
    expect(service.addMedia).not.toHaveBeenCalled()
  })

  it('refuses to accept arbitrary URLs when storage validation is unavailable', async () => {
    const { controller, service, input } = setup(false)
    await expect(controller.addFreeAgentMedia({ id: 'u-1' }, input)).rejects.toThrow('unavailable')
    expect(service.addMedia).not.toHaveBeenCalled()
  })

  it('does not attach incomplete thumbnails', async () => {
    const { controller, r2, service, input } = setup()
    r2.assertStoredObject.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('missing'))
    await expect(controller.addFreeAgentMedia({ id: 'u-1' }, input)).rejects.toThrow('invalid or incomplete')
    expect(service.addMedia).not.toHaveBeenCalled()
  })
})
