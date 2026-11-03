import express, { type NextFunction, type Request, type Response } from 'express'
import { request as httpRequest } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mediaCutoverFreeze } from './media-cutover-freeze'

describe('media cutover freeze', () => {
  const previous = process.env.MEDIA_CUTOVER_FREEZE
  afterEach(() => { process.env.MEDIA_CUTOVER_FREEZE = previous })

  function request(method: string, path: string) {
    const next = jest.fn() as NextFunction
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn(), setHeader: jest.fn() }
    mediaCutoverFreeze({ method, path } as Request, response as unknown as Response, next)
    return { next, response }
  }

  it('does not block any request when the flag is off', () => {
    delete process.env.MEDIA_CUTOVER_FREEZE
    expect(request('DELETE', '/me').next).toHaveBeenCalled()
  })

  it.each([
    ['DELETE', '/me'], ['DELETE', '/me/bound/'], ['DELETE', '/ME'],
    ['POST', '/teams/t/media/presign'], ['POST', '/teams/t/messages/media'],
    ['POST', '/clubs/c/conversations/d/media/presign'],
    ['POST', '/clubs/c/conversations/d/messages'],
  ])('blocks %s %s when enabled', (method, path) => {
    process.env.MEDIA_CUTOVER_FREEZE = 'true'
    const result = request(method, path)
    expect(result.next).not.toHaveBeenCalled()
    expect(result.response.status).toHaveBeenCalledWith(503)
    expect(result.response.setHeader).toHaveBeenCalledWith('Retry-After', '60')
  })

  it.each([
    ['GET', '/me'], ['GET', '/teams/t/messages'], ['POST', '/teams/t/messages/poll'],
    ['GET', '/clubs/c/conversations/d/messages'], ['GET', '/health'],
  ])('allows unrelated %s %s', (method, path) => {
    process.env.MEDIA_CUTOVER_FREEZE = 'true'
    expect(request(method, path).next).toHaveBeenCalled()
  })

  it('rejects malformed encoded paths while enabled', () => {
    process.env.MEDIA_CUTOVER_FREEZE = 'true'
    expect(request('DELETE', '/me%').response.status).toHaveBeenCalledWith(400)
  })

  it('blocks the real Express route before its handler runs', async () => {
    process.env.MEDIA_CUTOVER_FREEZE = 'true'
    const app = express()
    const handler = jest.fn((_req: Request, res: Response) => res.sendStatus(204))
    app.use(mediaCutoverFreeze)
    app.delete('/me', handler)
    app.post('/teams/:teamId/media/presign', handler)
    const server = app.listen(0, '127.0.0.1')
    await new Promise<void>((resolve) => server.once('listening', resolve))
    const { port } = server.address() as AddressInfo
    try {
      for (const [method, path] of [['DELETE', '/ME/?x=1'], ['POST', '/teams/t/media/presign']]) {
        const status = await new Promise<number>((resolve, reject) => {
          const req = httpRequest({ hostname: '127.0.0.1', port, method, path }, (res) => {
            res.resume()
            res.on('end', () => resolve(res.statusCode ?? 0))
          })
          req.on('error', reject)
          req.end()
        })
        expect(status).toBe(503)
      }
      expect(handler).not.toHaveBeenCalled()
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    }
  })
})
