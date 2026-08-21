import { ChatGateway } from './chat.gateway'

// Regression: ISSUE-009 — Redis errors made Socket.IO message limits fail open.
describe('ChatGateway rate-limit fallback', () => {
  it('still limits repeated messages when Redis is unavailable', async () => {
    const gateway = new ChatGateway(
      {} as never, {} as never, {} as never, {} as never,
      {} as never, {} as never, {} as never, {} as never,
    )
    ;(gateway as any).rateLimitRedis = {
      set: jest.fn().mockRejectedValue(new Error('redis down')),
    }

    await expect((gateway as any).isChatRateLimited('user-1')).resolves.toBe(false)
    await expect((gateway as any).isChatRateLimited('user-1')).resolves.toBe(true)
  })
})
