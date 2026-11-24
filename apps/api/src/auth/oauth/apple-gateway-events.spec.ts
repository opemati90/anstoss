import { Test } from '@nestjs/testing'
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter'
import { ChatGateway } from '../../chat/chat.gateway'
import { EventsGateway } from '../../events/events.gateway'
import { LiveGateway } from '../../live/live.gateway'

describe('Apple revocation gateway event registration', () => {
  it.each([ChatGateway, EventsGateway, LiveGateway])(
    '%p propagates adapter failures through the real Nest event listener',
    async (Gateway) => {
      // Use the actual decorated gateway prototype with Nest's event subscriber
      // loader, without starting a network server or any unrelated gateway work.
      const gateway = Object.assign(Object.create(Gateway.prototype), {
        prisma: {},
        server: {
          in: jest
            .fn()
            .mockReturnValue({
              fetchSockets: jest.fn().mockRejectedValue(new Error('adapter unavailable')),
            }),
        },
      })
      const module = await Test.createTestingModule({
        imports: [EventEmitterModule.forRoot()],
        providers: [{ provide: Gateway, useValue: gateway }],
      }).compile()
      try {
        await module.init()
        await expect(
          module.get(EventEmitter2).emitAsync('auth.apple.revoked', { identityId: 'identity' }),
        ).rejects.toThrow('adapter unavailable')
      } finally {
        await module.close()
      }
    },
  )
})
