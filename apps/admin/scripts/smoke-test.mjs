import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

function read(relativePath) {
  return readFileSync(join(appRoot, relativePath), 'utf8')
}

function assertIncludes(source, needle, label) {
  assert.ok(source.includes(needle), `${label} should include ${JSON.stringify(needle)}`)
}

function assertNotIncludes(source, needle, label) {
  assert.ok(!source.includes(needle), `${label} should not include ${JSON.stringify(needle)}`)
}

function assertExists(relativePath) {
  assert.ok(existsSync(join(appRoot, relativePath)), `${relativePath} exists`)
}

const html = read('src/index.html')
const js = read('src/main.js')
const css = read('src/styles.css')
const nginx = read('nginx.conf')
const dockerfile = read('Dockerfile')
const railway = read('railway.toml')
const entrypointPath = 'docker-entrypoint.d/10-admin-basic-auth.sh'
const entrypoint = read(entrypointPath)

assertExists('src/index.html')
assertExists('src/main.js')
assertExists('src/styles.css')
assertExists('src/favicon.svg')
assertExists('Dockerfile')
assertExists('nginx.conf')
assertExists('railway.toml')
assertExists(entrypointPath)

assertIncludes(html, 'id="admin-email-input"', 'admin settings')
assertIncludes(html, 'id="admin-code-input"', 'admin settings')
assertIncludes(html, 'id="admin-session-clear"', 'admin settings')
assertIncludes(html, 'id="admin-key-input"', 'admin settings')
assertIncludes(html, 'id="club-detail-dialog"', 'club detail dialog')
assertIncludes(html, 'Broadcast sending is disabled for launch', 'broadcast UI')
assertNotIncludes(html, 'clerk-key-input', 'admin settings')
assertNotIncludes(html, '@clerk', 'admin settings')

assertIncludes(js, 'SESSION_TOKEN_STORAGE', 'admin JS')
assertIncludes(js, "headers['X-Anstoss-Session']", 'admin JS')
assertIncludes(js, 'headers.Authorization', 'admin JS')
assertIncludes(js, "headers['X-Admin-Key']", 'admin JS')
assertIncludes(js, 'retryOnExpiredSession', 'admin JS')
assertIncludes(js, "window.location.hash = '#/settings'", 'admin unauthenticated entry')
assertIncludes(js, "link.setAttribute('aria-current', 'page')", 'admin navigation accessibility')
assertIncludes(js, "event.key === 'Enter'", 'admin navigation search')
assertIncludes(js, "authFetch('/auth/otp/request'", 'admin JS')
assertIncludes(js, "authFetch('/auth/otp/verify'", 'admin JS')
assertIncludes(js, 'openClubDetail', 'admin club details')
assertIncludes(js, "adminFetch(`/admin/clubs/${encodeURIComponent(clubId)}`)", 'admin club details')
assertIncludes(js, 'requestId !== clubDetailRequestId', 'admin club detail race guard')
assertIncludes(js, 'Onboarding complete', 'admin Stripe Connect status')
assertNotIncludes(js, '>Ready</span>', 'admin Stripe Connect status')
assertIncludes(js, "action: 'SUPPORT_NOTE'", 'admin JS')
assertIncludes(js, 'Broadcast sending is disabled for launch', 'admin JS')
assertNotIncludes(js, 'window.Clerk', 'admin JS')
assertNotIncludes(js, 'clerkPublishableKey', 'admin JS')

assertIncludes(css, '@media (max-width: 980px)', 'responsive admin CSS')
assertIncludes(css, 'flex-direction: row;', 'responsive admin navigation')
assertIncludes(css, '.nav-group { display: none; }', 'responsive admin navigation')
assertNotIncludes(css, 'grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));', 'responsive admin navigation')
assertIncludes(css, 'min-height: 44px;', 'admin club detail touch target')

assertIncludes(nginx, 'auth_basic "Anstoss Admin";', 'nginx')
assertIncludes(nginx, 'auth_basic_user_file /etc/nginx/admin.htpasswd;', 'nginx')
assertIncludes(nginx, 'location ^~ /admin/', 'nginx')
assertIncludes(nginx, 'location ^~ /auth/', 'nginx')
assertIncludes(nginx, 'proxy_set_header Authorization $http_x_anstoss_session;', 'nginx')
assertIncludes(nginx, 'proxy_set_header X-Admin-Key $http_x_admin_key;', 'nginx')
assertIncludes(nginx, 'proxy_set_header Authorization "";', 'nginx')
assertIncludes(nginx, 'auth_basic off;', 'nginx')
assertIncludes(nginx, 'Cache-Control "no-store"', 'nginx')
assertIncludes(nginx, 'X-Robots-Tag "noindex, nofollow, noarchive"', 'nginx')
assertIncludes(nginx, 'proxy_ssl_server_name on;', 'nginx')

assertIncludes(dockerfile, 'apache2-utils', 'Dockerfile')
assertIncludes(dockerfile, '10-admin-basic-auth.sh', 'Dockerfile')
assertIncludes(dockerfile, 'API_UPSTREAM=', 'Dockerfile')
assertIncludes(dockerfile, 'NGINX_ENVSUBST_FILTER', 'Dockerfile')

assertIncludes(railway, 'dockerfilePath = "apps/admin/Dockerfile"', 'railway')
assertIncludes(railway, 'healthcheckPath = "/healthz"', 'railway')

assertIncludes(entrypoint, 'ADMIN_BASIC_AUTH_USERNAME', 'entrypoint')
assertIncludes(entrypoint, 'ADMIN_BASIC_AUTH_PASSWORD', 'entrypoint')
assertIncludes(entrypoint, '-lt 16', 'entrypoint')
assertIncludes(entrypoint, 'htpasswd -ciB', 'entrypoint')
assertIncludes(entrypoint, 'chown root:nginx', 'entrypoint')
assertIncludes(entrypoint, 'chmod 640', 'entrypoint')
assertNotIncludes(entrypoint, '-b', 'entrypoint')

const entrypointMode = statSync(join(appRoot, entrypointPath)).mode
assert.ok((entrypointMode & 0o111) !== 0, 'Basic Auth entrypoint should be executable')

console.log('Admin static smoke test passed')
