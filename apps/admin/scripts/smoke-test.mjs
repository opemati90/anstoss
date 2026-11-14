import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'

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

const errorFunction = js.slice(js.indexOf('async function responseErrorMessage'), js.indexOf('async function adminFetch'))
const formatError = runInNewContext(`${errorFunction}; responseErrorMessage`, { usesSameOriginApiProxy: () => true })
const rejectedLogin = new Response(JSON.stringify({ error: { code: 'HTTP_401', message: 'Invalid username or password' }, requestId: 'internal-id' }), { status: 401, headers: { 'content-type': 'application/json' } })
assert.equal(await formatError(rejectedLogin, '/admin/auth/login'), 'Invalid username or password')

assertExists('src/index.html')
assertExists('src/main.js')
assertExists('src/styles.css')
assertExists('src/anstoss-mark.png')
assertExists('Dockerfile')
assertExists('nginx.conf')
assertExists('railway.toml')
assertExists(entrypointPath)

assertIncludes(html, 'id="login-shell"', 'admin login shell')
assertIncludes(html, 'id="admin-login-form"', 'admin login shell')
assertIncludes(html, 'id="admin-login-username"', 'admin login shell')
assertIncludes(html, 'id="admin-login-password"', 'admin login shell')
assertIncludes(html, 'id="admin-username-display"', 'admin settings')
assertIncludes(html, 'id="admin-session-clear"', 'admin settings')
assertIncludes(html, 'id="admin-key-input"', 'admin settings')
assertIncludes(html, 'id="club-detail-dialog"', 'club detail dialog')
assertIncludes(html, 'tabindex="0" role="region" aria-label="Club details and plan access"', 'keyboard-scrollable club detail region')
assertIncludes(css, '.detail-dialog[open] { display: flex; flex-direction: column; }', 'bounded dialog layout')
assert.match(css, /\.detail-dialog__content\s*\{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/s, 'dialog content shrinks into the available scroll viewport')
assertNotIncludes(css, 'max-height: calc(100vh - 130px)', 'independently oversized modal scroll area')
assertIncludes(js, 'content.scrollTop = 0', 'reset club detail scroll when opened')
assertIncludes(js, 'Verein (PRO)', 'current app plan name')
assertIncludes(html, 'they do not update the app', 'legacy pricing definition boundary')
assertIncludes(html, 'class="brand-dot"', 'Anstoss lime-dot wordmark')
assertIncludes(html, 'href="./anstoss-mark.png"', 'Anstoss favicon')
assertNotIncludes(html, '>Production</span>', 'unverified environment label')
assertNotIncludes(html, 'class="eyebrow"', 'duplicate admin headings')
assertIncludes(css, '--accent: #D4F25C', 'Anstoss brand lime')
assertIncludes(css, '--primary: #0E3B2B', 'Anstoss pitch green')
assertIncludes(css, '--ink: #121A15', 'Anstoss ink')
assertNotIncludes(css, '#bd1e15', 'retired admin red accent')
for (const match of css.matchAll(/url\(\.\/(fonts\/[^)]+)\)/g)) assertExists(`src/${match[1]}`)
assertExists('src/fonts/LICENSE-Inter.txt')
assertExists('src/fonts/LICENSE-BarlowCondensed.txt')
assertIncludes(html, 'id="mobile-nav-toggle"', 'mobile admin navigation')
assertNotIncludes(html, 'id="mobile-search-toggle"', 'removed global admin search')
assertNotIncludes(html, 'class="nav-group"', 'simplified primary navigation')
assert.equal((html.match(/class="nav-item"/g) || []).length, 5, 'primary navigation should contain five destinations')
assertIncludes(html, 'href="#/broadcast"', 'contextual broadcast navigation')
assertIncludes(html, 'href="#/analytics"', 'contextual analytics navigation')
assertIncludes(html, 'Broadcast sending is disabled for launch', 'broadcast UI')
assertNotIncludes(html, 'clerk-key-input', 'admin settings')
assertNotIncludes(html, '@clerk', 'admin settings')

assertIncludes(js, 'SESSION_TOKEN_STORAGE', 'admin JS')
assertIncludes(js, "headers['X-Anstoss-Session']", 'admin JS')
assertIncludes(js, 'headers.Authorization', 'admin JS')
assertIncludes(js, "headers['X-Admin-Key']", 'admin JS')
assertIncludes(js, 'retryOnExpiredSession', 'admin JS')
assertIncludes(js, 'renderAuthGate', 'admin auth gate')
assertIncludes(js, "authFetch('/admin/auth/login'", 'admin username password login')
assertIncludes(js, 'const form = event.currentTarget', 'stable async form references')
assertIncludes(js, 'if (result.token) setSessionToken(result.token)', 'password rotation session refresh')
assertIncludes(js, 'if (submitButton?.disabled) return', 'password rotation duplicate-submit guard')
assertIncludes(js, 'submitButton.disabled = true', 'password rotation pending state')
assertIncludes(js, 'submitButton.disabled = false', 'password rotation pending cleanup')
assertIncludes(js, "link.setAttribute('aria-current', 'page')", 'admin navigation accessibility')
assertIncludes(js, 'bindMobileNavigation', 'mobile admin navigation')
assertIncludes(js, 'nav.inert = hidden', 'collapsed mobile navigation accessibility')
assertIncludes(js, 'openClubDetail', 'admin club details')
assertIncludes(js, "adminFetch(`/admin/clubs/${encodeURIComponent(clubId)}`)", 'admin club details')
assertIncludes(js, 'requestId !== clubDetailRequestId', 'admin club detail race guard')
assertNotIncludes(js, 'Stripe Connect', 'club-dues payment onboarding')
assertIncludes(html, 'id="club-disputes-table"', 'ownership dispute queue')
assertIncludes(js, "adminFetch('/admin/club-claims/disputes')", 'ownership dispute queue')
assertIncludes(js, "action: 'SUPPORT_NOTE'", 'admin JS')
assertIncludes(js, 'Broadcast sending is disabled for launch', 'admin JS')
assertNotIncludes(js, 'window.Clerk', 'admin JS')
assertNotIncludes(js, 'clerkPublishableKey', 'admin JS')

assertIncludes(css, '@media (max-width: 980px)', 'responsive admin CSS')
assertIncludes(css, 'flex-direction: row;', 'responsive admin navigation')
assertIncludes(css, '.mobile-nav-open .nav', 'mobile admin navigation')
assertIncludes(css, '.login-shell', 'admin login layout')
assertIncludes(css, 'color-scheme: light;', 'light admin visual system')
assertIncludes(css, 'animation: none !important;', 'motion-free admin visual system')
assertNotIncludes(css, 'gradient(', 'admin visual system')
assertNotIncludes(css, 'grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));', 'responsive admin navigation')
assert.match(css, /\.icon-button\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;/s, 'admin dialog close target should be 44px')
assert.match(css, /\.mobile-nav-toggle\s*\{[^}]*min-height:\s*44px;/s, 'mobile menu target should be 44px')
assert.match(css, /\.nav-item\s*\{[^}]*min-width:\s*0;\s*min-height:\s*44px;/s, 'mobile nav targets should be 44px')

assertNotIncludes(nginx, 'auth_basic "Anstoss Admin";', 'nginx')
assertNotIncludes(nginx, 'auth_basic_user_file /etc/nginx/admin.htpasswd;', 'nginx')
assertIncludes(nginx, 'location ^~ /admin/', 'nginx')
assertIncludes(nginx, 'location ^~ /auth/', 'nginx')
assertIncludes(nginx, 'proxy_set_header Authorization $http_x_anstoss_session;', 'nginx')
assertIncludes(nginx, 'proxy_set_header X-Admin-Key $http_x_admin_key;', 'nginx')
assertIncludes(nginx, 'proxy_set_header Authorization "";', 'nginx')
assertIncludes(nginx, 'auth_basic off;', 'nginx')
assertIncludes(nginx, 'Cache-Control "no-store"', 'nginx')
assertIncludes(nginx, 'X-Robots-Tag "noindex, nofollow, noarchive"', 'nginx')
assertIncludes(nginx, 'proxy_ssl_server_name on;', 'nginx')

assertIncludes(dockerfile, '10-admin-basic-auth.sh', 'Dockerfile')
assertIncludes(dockerfile, 'API_UPSTREAM=', 'Dockerfile')
assertIncludes(dockerfile, 'NGINX_ENVSUBST_FILTER', 'Dockerfile')

assertIncludes(railway, 'dockerfilePath = "Dockerfile"', 'railway')
assertNotIncludes(railway, 'dockerfilePath = "apps/admin/Dockerfile"', 'railway')
assertIncludes(railway, 'healthcheckPath = "/healthz"', 'railway')

assertIncludes(entrypoint, 'exit 0', 'entrypoint')

const entrypointMode = statSync(join(appRoot, entrypointPath)).mode
assert.ok((entrypointMode & 0o111) !== 0, 'Basic Auth entrypoint should be executable')

console.log('Admin static smoke test passed')
