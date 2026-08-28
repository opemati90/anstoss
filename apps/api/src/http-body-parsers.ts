import { json, type Request, type RequestHandler, urlencoded } from 'express'

type RequestWithRawBody = Request & { rawBody?: Buffer }

const preserveRawBody: NonNullable<Parameters<typeof json>[0]>['verify'] = (
  req,
  _res,
  buffer,
) => {
  ;(req as RequestWithRawBody).rawBody = buffer
}

/**
 * Bank statements are base64 encoded for the current mobile upload contract,
 * so their JSON envelope can legitimately exceed Express' 100 KB default.
 * Keep the larger parser scoped to that one endpoint; all other JSON routes
 * retain the conservative default while Stripe can still access rawBody.
 */
export function httpBodyParsers(): RequestHandler[] {
  return [
    json({ limit: '15mb', verify: preserveRawBody }),
  ]
}

export function defaultHttpBodyParsers(): RequestHandler[] {
  return [
    json({ limit: '100kb', verify: preserveRawBody }),
    urlencoded({ extended: true, limit: '100kb', verify: preserveRawBody }),
  ]
}
