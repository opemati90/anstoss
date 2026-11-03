import type { NextFunction, Request, Response } from 'express'

/** Temporarily stops account erasure and chat media writes during the private-media cutover. */
export function mediaCutoverFreeze(req: Request, res: Response, next: NextFunction): void {
  if (process.env.MEDIA_CUTOVER_FREEZE !== 'true') return next()

  let path: string
  try {
    path = decodeURIComponent(req.path).replace(/\/+$/, '').toLowerCase()
  } catch {
    res.status(400).json({ message: 'Invalid request path' })
    return
  }
  const isDeletion = req.method === 'DELETE' && (path === '/me' || path === '/me/bound')
  const isMediaWrite = req.method === 'POST' && (
    /^\/teams\/[^/]+\/(?:media\/presign|messages\/media)$/.test(path) ||
    /^\/clubs\/[^/]+\/conversations\/[^/]+\/(?:media\/presign|messages)$/.test(path)
  )
  if (!isDeletion && !isMediaWrite) return next()
  res.setHeader('Retry-After', '60')
  res.status(503).json({ code: 'MEDIA_MAINTENANCE', message: 'Temporarily unavailable. Please try again shortly.' })
}
