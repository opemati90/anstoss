import 'reflect-metadata'
import { BadRequestException } from '@nestjs/common'
import { ChatController } from './chat.controller'
import { RATE_LIMIT_KEY } from '../rate-limit/rate-limit.guard'
import { MediaController } from '../media/media.controller'

describe('channel media request boundary', () => {
  const service = { postMedia: jest.fn().mockResolvedValue({ id: 'message' }) }
  const controller = new ChatController(service as never)
  const body = { channelId: 'channel', messageType: 'IMAGE', attachmentUrl: 'https://private-media.anstoss.invalid/chat/example' }
  beforeEach(() => jest.clearAllMocks())

  it('validates the body and keeps the route team authoritative', async () => {
    await controller.postMedia({ id: 'user' }, 'team', body)
    expect(service.postMedia).toHaveBeenCalledWith('user', { ...body, teamId: 'team' })
    await expect(controller.postMedia({ id: 'user' }, 'team', { ...body, teamId: 'foreign' })).rejects.toThrow(BadRequestException)
    expect(service.postMedia).toHaveBeenCalledTimes(1)
  })

  it.each([null, {}, { ...body, messageType: 'TEXT' }, { ...body, attachmentUrl: 'not-a-url' },
    { ...body, attachmentMeta: { fileName: 'bad\nname' } }])('rejects invalid body %j', async (input) => {
    await expect(controller.postMedia({ id: 'user' }, 'team', input)).rejects.toThrow(BadRequestException)
    expect(service.postMedia).not.toHaveBeenCalled()
  })

  it('uses write-specific limits for presign and channel message policies for send', () => {
    expect(Reflect.getMetadata(RATE_LIMIT_KEY, MediaController.prototype.presign)).toBe('write')
    expect(Reflect.getMetadata(RATE_LIMIT_KEY, ChatController.prototype.postMedia)).toBe('channel-message')
  })
})
