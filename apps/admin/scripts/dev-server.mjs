import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.env.PORT || 4300)
const API_UPSTREAM = (process.env.ADMIN_API_UPSTREAM || process.env.API_UPSTREAM || 'https://api.anstoss.io').replace(
  /\/$/,
  '',
)
const SRC_DIR = fileURLToPath(new URL('../src/', import.meta.url))

const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
])

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Cache-Control': 'no-store',
    ...headers,
  })
  if (res.req.method !== 'HEAD') res.end(body)
  else res.end()
}

function safeFilePath(urlPath) {
  const decoded = decodeURIComponent(urlPath)
  const requested = decoded === '/' ? '/index.html' : decoded
  const normal = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, '')
  const filePath = join(SRC_DIR, normal)
  return relative(SRC_DIR, filePath).startsWith('..') ? null : filePath
}

async function serveStatic(req, res, url) {
  const filePath = safeFilePath(url.pathname)
  if (!filePath) {
    send(res, 400, 'Bad request\n', { 'Content-Type': 'text/plain; charset=utf-8' })
    return
  }

  try {
    const fileStat = await stat(filePath)
    if (!fileStat.isFile()) throw new Error('not a file')
    const body = await readFile(filePath)
    send(res, 200, body, {
      'Content-Length': body.length,
      'Content-Type': MIME_TYPES.get(extname(filePath)) || 'application/octet-stream',
    })
  } catch {
    if (!extname(url.pathname)) {
      const body = await readFile(join(SRC_DIR, 'index.html'))
      send(res, 200, body, {
        'Content-Length': body.length,
        'Content-Type': 'text/html; charset=utf-8',
      })
      return
    }
    send(res, 404, 'File not found\n', { 'Content-Type': 'text/plain; charset=utf-8' })
  }
}

async function readRequestBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks)
}

function proxyHeaders(req, body) {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (!value) continue
    const name = key.toLowerCase()
    if (['connection', 'content-length', 'host', 'transfer-encoding'].includes(name)) continue
    headers.set(key, Array.isArray(value) ? value.join(', ') : value)
  }

  const session = req.headers['x-anstoss-session']
  if (session) headers.set('Authorization', Array.isArray(session) ? session[0] : session)
  if (req.url?.startsWith('/auth')) headers.delete('Authorization')
  if (body.length) headers.set('Content-Length', String(body.length))
  return headers
}

async function proxyApi(req, res) {
  const body = req.method === 'GET' || req.method === 'HEAD' ? Buffer.alloc(0) : await readRequestBody(req)
  const upstream = await fetch(`${API_UPSTREAM}${req.url}`, {
    method: req.method,
    headers: proxyHeaders(req, body),
    body: body.length ? body : undefined,
  })
  const responseBody = Buffer.from(await upstream.arrayBuffer())
  const headers = {}
  upstream.headers.forEach((value, key) => {
    if (['connection', 'content-encoding', 'content-length', 'transfer-encoding'].includes(key.toLowerCase())) return
    headers[key] = value
  })
  send(res, upstream.status, responseBody, {
    ...headers,
    'Content-Length': responseBody.length,
  })
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || `127.0.0.1:${PORT}`}`)
    if (url.pathname === '/healthz') {
      send(res, 200, 'ok\n', { 'Content-Type': 'text/plain; charset=utf-8' })
      return
    }
    if (url.pathname === '/admin' || url.pathname.startsWith('/admin/') || url.pathname === '/auth' || url.pathname.startsWith('/auth/')) {
      await proxyApi(req, res)
      return
    }
    await serveStatic(req, res, url)
  } catch (error) {
    console.error(error)
    send(res, 502, 'Admin dev server failed\n', { 'Content-Type': 'text/plain; charset=utf-8' })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Anstoss admin dev server listening on http://127.0.0.1:${PORT}`)
  console.log(`Proxying /admin and /auth to ${API_UPSTREAM}`)
})
