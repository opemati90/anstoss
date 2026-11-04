import { createServer, type Server } from 'node:http'

export function migrationMaintenanceEnabled(value: string | undefined): boolean {
  if (value === undefined || value === 'false') return false
  if (value === 'true') return true
  throw new Error('Invalid migration maintenance flag')
}

/**
 * A standalone maintenance process: Nest, gateways, and in-process workers
 * must not start while database migrations are being applied.
 */
export function createMigrationMaintenanceServer(): Server {
  const server = createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Connection', 'close')
    res.setHeader('Content-Type', 'application/json')
    if ((req.method === 'GET' || req.method === 'HEAD') && req.url === '/health') {
      res.writeHead(200)
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ status: 'maintenance' }))
      return
    }
    res.setHeader('Retry-After', '60')
    res.writeHead(503)
    res.end(JSON.stringify({ code: 'MIGRATION_MAINTENANCE', message: 'Temporarily unavailable. Please try again shortly.' }))
  })
  server.on('upgrade', (_req, socket) => {
    socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nRetry-After: 60\r\nContent-Length: 0\r\n\r\n')
  })
  return server
}
