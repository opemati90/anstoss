import { createAdapter } from '@socket.io/redis-adapter'
import { Redis } from 'ioredis'
import { Namespace, Server } from 'socket.io'

const installations = new WeakMap<Server, Promise<void>>()

/** Nest passes a Namespace to named gateways. Install once on its owning server. */
export function installRedisAdapter(target: Namespace | Server, redisUrl: string): Promise<void> {
  const server = target instanceof Namespace ? target.server : target
  const existing = installations.get(server)
  if (existing) return existing

  const pubClient = new Redis(redisUrl, { maxRetriesPerRequest: 3, lazyConnect: true })
  const subClient = pubClient.duplicate()
  const installation = Promise.all([pubClient.connect(), subClient.connect()])
    .then(() => {
      server.adapter(createAdapter(pubClient, subClient))
    })
    .catch((error: unknown) => {
      pubClient.disconnect()
      subClient.disconnect()
      installations.delete(server)
      throw error
    })
  installations.set(server, installation)
  return installation
}
