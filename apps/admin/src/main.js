/*
 * Anstoss Platform Admin - V1
 *
 * Single-page vanilla JS. Hash-routed (#/overview, #/clubs, ...) so deep
 * links work. Authenticates against /admin/* with a per-operator email OTP
 * session when available, falling back to X-Admin-Key for break-glass ops.
 */

// - Config / storage -

const KEY_STORAGE = 'anstoss.admin.apiKey'
const BASE_STORAGE = 'anstoss.admin.apiBase'
const SESSION_TOKEN_STORAGE = 'anstoss.admin.sessionToken'
const SESSION_USER_STORAGE = 'anstoss.admin.sessionUser'
const ADMIN_EMAIL_STORAGE = 'anstoss.admin.email'

function getApiKey() {
  return localStorage.getItem(KEY_STORAGE) || ''
}
function setApiKey(value) {
  if (value) localStorage.setItem(KEY_STORAGE, value)
  else localStorage.removeItem(KEY_STORAGE)
}
function getApiBase() {
  return localStorage.getItem(BASE_STORAGE) || ''
}
function setApiBase(value) {
  if (value) localStorage.setItem(BASE_STORAGE, value)
  else localStorage.removeItem(BASE_STORAGE)
}
function getSessionToken() {
  return sessionStorage.getItem(SESSION_TOKEN_STORAGE) || ''
}
function setSessionToken(value) {
  if (value) sessionStorage.setItem(SESSION_TOKEN_STORAGE, value)
  else sessionStorage.removeItem(SESSION_TOKEN_STORAGE)
}
function getSessionUser() {
  try {
    const raw = sessionStorage.getItem(SESSION_USER_STORAGE)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}
function setSessionUser(user) {
  if (user) sessionStorage.setItem(SESSION_USER_STORAGE, JSON.stringify(user))
  else sessionStorage.removeItem(SESSION_USER_STORAGE)
}
function getAdminEmail() {
  return localStorage.getItem(ADMIN_EMAIL_STORAGE) || ''
}
function hasAdminCredentials() {
  return Boolean(getSessionToken() || getApiKey())
}
function setAdminEmail(value) {
  if (value) localStorage.setItem(ADMIN_EMAIL_STORAGE, value)
  else localStorage.removeItem(ADMIN_EMAIL_STORAGE)
}
function apiUrl(path) {
  const base = getApiBase().replace(/\/$/, '')
  return base ? `${base}${path}` : path
}
function usesSameOriginApiProxy() {
  return !getApiBase().trim()
}

// - HTTP -

async function responseErrorMessage(res, path) {
  const contentType = res.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    const body = await res.json().catch(() => null)
    const message = body?.message || body?.error || body?.detail
    if (Array.isArray(message)) return message.join(', ')
    if (typeof message === 'string' && message.trim()) return message.trim()
    if (body) return JSON.stringify(body).slice(0, 500)
  }

  const text = await res.text().catch(() => '')
  const compact = text.replace(/\s+/g, ' ').trim()
  const looksLikeHtml = contentType.includes('text/html') || /^<!doctype|^<html/i.test(compact)

  if (looksLikeHtml && usesSameOriginApiProxy() && path.startsWith('/admin')) {
    return 'Admin proxy is not available in this environment. Production must serve this console through the protected nginx admin service.'
  }

  if (looksLikeHtml) return res.statusText || 'HTML error response'
  return compact ? compact.slice(0, 500) : res.statusText
}

async function adminFetch(path, options = {}, retryOnExpiredSession = true) {
  const headers = {
    Accept: 'application/json',
    ...(options.headers || {}),
  }

  const sessionToken = getSessionToken()
  if (sessionToken) {
    if (usesSameOriginApiProxy()) {
      headers['X-Anstoss-Session'] = `Bearer ${sessionToken}`
    } else {
      headers.Authorization = `Bearer ${sessionToken}`
    }
  } else {
    const key = getApiKey()
    if (key) headers['X-Admin-Key'] = key
  }

  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(apiUrl(path), { ...options, headers })

  if (res.status === 401 && sessionToken && retryOnExpiredSession) {
    setSessionToken('')
    setSessionUser(null)
    updateAuthSummary()
    if (getApiKey()) {
      return adminFetch(path, options, false)
    }
  }

  if (res.status === 401 || res.status === 403) {
    throw new Error(
      'Auth failed. Sign in as a platform admin in Settings or use a valid ADMIN_API_KEY.',
    )
  }
  if (!res.ok) {
    throw new Error(`Request failed (${res.status}): ${await responseErrorMessage(res, path)}`)
  }
  return res.json()
}

async function authFetch(path, body) {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    throw new Error(`Auth failed (${res.status}): ${await responseErrorMessage(res, path)}`)
  }

  return res.json()
}

// - Routing -

const SECTIONS = [
  'overview',
  'clubs',
  'users',
  'subscriptions',
  'revenue',
  'health',
  'audit',
  'support',
  'sync',
  'broadcast',
  'flags',
  'moderation',
  'analytics',
  'sql',
  'releases',
  'settings',
]

const SECTION_LOADERS = {
  overview: loadOverview,
  clubs: loadClubs,
  users: loadUsers,
  subscriptions: loadSubscriptions,
  revenue: loadRevenue,
  health: loadHealth,
  audit: loadAudit,
  support: loadSupport,
  sync: loadSync,
  broadcast: loadBroadcast,
  flags: loadFlags,
  moderation: loadModeration,
  analytics: loadAnalytics,
  releases: loadReleases,
  settings: renderSettings,
}

const SECTION_LABELS = {
  overview: 'Overview',
  clubs: 'Clubs',
  users: 'Users',
  subscriptions: 'Subscriptions',
  revenue: 'Revenue',
  health: 'System health',
  audit: 'Audit log',
  support: 'Support notes',
  sync: 'FUSSBALL.DE sync',
  broadcast: 'Broadcast push',
  flags: 'Feature flags',
  moderation: 'Moderation',
  analytics: 'Analytics',
  sql: 'SQL runner',
  releases: 'Releases',
  settings: 'Settings',
}

function currentSection() {
  const hash = window.location.hash.replace(/^#\/?/, '') || 'overview'
  return SECTIONS.includes(hash) ? hash : 'overview'
}

function navigate() {
  const target = currentSection()
  const routeLabel = SECTION_LABELS[target] || 'Overview'
  const currentRoute = document.getElementById('current-route')
  if (currentRoute) currentRoute.textContent = routeLabel
  document.title = `${routeLabel} | Anstoss Platform Admin`
  document.querySelectorAll('.page').forEach((page) => {
    page.hidden = page.dataset.page !== target
  })
  let activeLink = null
  document.querySelectorAll('.nav-item').forEach((link) => {
    const isActive = link.dataset.section === target
    link.classList.toggle('active', isActive)
    if (isActive) {
      link.setAttribute('aria-current', 'page')
      activeLink = link
    } else {
      link.removeAttribute('aria-current')
    }
  })
  if (activeLink && window.matchMedia('(max-width: 980px)').matches) {
    const nav = activeLink.closest('.nav')
    const left = activeLink.offsetLeft - nav.clientWidth / 2 + activeLink.clientWidth / 2
    nav.scrollTo({ left: Math.max(0, left) })
  }
  window.scrollTo({ top: 0, behavior: 'instant' })
  const loader = SECTION_LOADERS[target]
  if (loader) loader()
}

window.addEventListener('hashchange', navigate)

// - Helpers -

function bindGlobalSearch() {
  const input = document.getElementById('search')
  const toggle = document.getElementById('mobile-search-toggle')
  if (!input) return

  const mobileQuery = window.matchMedia('(max-width: 680px)')
  const syncAvailability = (open = document.body.classList.contains('mobile-search-open')) => {
    const hidden = mobileQuery.matches && !open
    input.tabIndex = hidden ? -1 : 0
    if (hidden) input.setAttribute('aria-hidden', 'true')
    else input.removeAttribute('aria-hidden')
  }

  const openSearch = () => {
    document.body.classList.add('mobile-search-open')
    syncAvailability(true)
    if (toggle) {
      toggle.setAttribute('aria-expanded', 'true')
      toggle.setAttribute('aria-label', 'Close workspace search')
    }
    requestAnimationFrame(() => input.focus())
  }

  const closeSearch = ({ restoreFocus = false } = {}) => {
    document.body.classList.remove('mobile-search-open')
    syncAvailability(false)
    if (toggle) {
      toggle.setAttribute('aria-expanded', 'false')
      toggle.setAttribute('aria-label', 'Open workspace search')
      if (restoreFocus) toggle.focus()
    }
  }

  toggle?.addEventListener('click', () => {
    if (document.body.classList.contains('mobile-search-open')) {
      input.value = ''
      input.dispatchEvent(new Event('input'))
      input.blur()
      closeSearch()
      return
    }
    openSearch()
  })

  input.addEventListener('input', () => {
    const query = input.value.trim().toLowerCase()
    document.querySelectorAll('.nav-group').forEach((group) => {
      group.hidden = Boolean(query)
    })
    document.querySelectorAll('.nav-item').forEach((link) => {
      const text = link.textContent.trim().toLowerCase()
      link.hidden = Boolean(query) && !text.includes(query)
    })
  })

  document.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase()
    if ((event.metaKey || event.ctrlKey) && key === 'k') {
      event.preventDefault()
      openSearch()
      requestAnimationFrame(() => input.select())
    }
    if (event.key === 'Escape' && document.activeElement === input) {
      input.value = ''
      input.dispatchEvent(new Event('input'))
      input.blur()
      closeSearch({ restoreFocus: true })
    }
    if (event.key === 'Enter' && document.activeElement === input) {
      const matches = Array.from(
        document.querySelectorAll('.nav-item:not([hidden]):not(.nav-item--disabled)'),
      )
      if (matches.length === 1) {
        event.preventDefault()
        matches[0].click()
      }
    }
  })

  mobileQuery.addEventListener('change', () => syncAvailability())
  syncAvailability()
}

function bindMobileNavigation() {
  const toggle = document.getElementById('mobile-nav-toggle')
  const nav = document.getElementById('admin-nav')
  if (!toggle || !nav) return

  const mobileQuery = window.matchMedia('(max-width: 680px)')
  const syncAvailability = (open = document.body.classList.contains('mobile-nav-open')) => {
    const hidden = mobileQuery.matches && !open
    nav.inert = hidden
    if (hidden) nav.setAttribute('aria-hidden', 'true')
    else nav.removeAttribute('aria-hidden')
  }

  const close = () => {
    document.body.classList.remove('mobile-nav-open')
    toggle.setAttribute('aria-expanded', 'false')
    toggle.textContent = 'Menu'
    syncAvailability(false)
  }

  toggle.addEventListener('click', () => {
    const open = document.body.classList.toggle('mobile-nav-open')
    toggle.setAttribute('aria-expanded', String(open))
    toggle.textContent = open ? 'Close' : 'Menu'
    syncAvailability(open)
  })
  nav.addEventListener('click', (event) => {
    if (event.target.closest('.nav-item')) close()
  })
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.body.classList.contains('mobile-nav-open')) {
      close()
      toggle.focus()
    }
  })
  mobileQuery.addEventListener('change', () => syncAvailability())
  syncAvailability(false)
}

function fmtDate(value) {
  if (!value) return '-'
  const d = new Date(value)
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function fmtDateTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}

function fmtCents(cents) {
  const value = (cents || 0) / 100
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value)
}

function esc(value) {
  if (value == null) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function badge(status) {
  const safe = esc(status || 'unknown')
  return `<span class="badge badge--${safe}">${safe}</span>`
}

function setError(el, error) {
  el.innerHTML = `<tr><td colspan="99" class="placeholder">${esc(error.message || error)}</td></tr>`
}

// - Section: Overview -

async function loadOverview() {
  const stats = document.querySelectorAll('#overview-stats .stat-card .stat-value')
  const warnings = document.getElementById('overview-warnings')
  try {
    const [health, revenue] = await Promise.all([
      adminFetch('/admin/health'),
      adminFetch('/admin/revenue'),
    ])
    stats[0].textContent = String(health.clubCount)
    stats[1].textContent = String(health.userCount)
    stats[2].textContent = String(health.activeSubscriptions)
    stats[3].textContent = fmtCents(revenue.mrrCents)
    warnings.textContent =
      health.deletedUsers > 0
        ? `${health.deletedUsers} soft-deleted users awaiting GDPR sweep.`
        : 'Nothing pinned. System looks calm.'
  } catch (err) {
    stats.forEach((el) => (el.textContent = '-'))
    warnings.textContent = err.message
  }
}

// - Section: Clubs -

let clubsSearchTimer = null
let clubDetailRequestId = 0

function closeClubDetail() {
  clubDetailRequestId += 1
  document.getElementById('club-detail-dialog').close()
}

function bindClubs() {
  document.getElementById('clubs-refresh').addEventListener('click', loadClubs)
  document.getElementById('clubs-search').addEventListener('input', () => {
    clearTimeout(clubsSearchTimer)
    clubsSearchTimer = setTimeout(loadClubs, 250)
  })
  document.querySelector('#clubs-table tbody').addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-club-detail]')
    if (trigger) void openClubDetail(trigger.dataset.clubDetail)
  })
  const dialog = document.getElementById('club-detail-dialog')
  document.getElementById('club-detail-close').addEventListener('click', closeClubDetail)
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeClubDetail()
  })
}

async function openClubDetail(clubId) {
  const requestId = ++clubDetailRequestId
  const dialog = document.getElementById('club-detail-dialog')
  const title = document.getElementById('club-detail-title')
  const content = document.getElementById('club-detail-content')
  title.textContent = 'Loading...'
  content.innerHTML = '<p class="placeholder">Loading club details...</p>'
  if (!dialog.open) dialog.showModal()

  try {
    const club = await adminFetch(`/admin/clubs/${encodeURIComponent(clubId)}`)
    if (requestId !== clubDetailRequestId || !dialog.open) return
    if (!club) throw new Error('Club not found.')
    title.textContent = club.name
    const owners = club.owners?.length
      ? club.owners
          .map(
            (owner) => `
              <li>
                <strong>${esc(owner.user?.name || 'Unnamed admin')}</strong>
                <span>${esc(owner.role)} · ${esc(owner.user?.email || 'No email')}</span>
              </li>
            `,
          )
          .join('')
      : '<li><span>No owner or admin accounts returned.</span></li>'
    const subscription = club.subscription
      ? `${badge(club.subscription.status)} <strong>${esc(club.subscription.plan)}</strong>`
      : '<span class="badge">Free</span>'
    const connectState = club.stripeAccount
      ? club.stripeAccount.onboardingComplete
        ? '<span class="badge badge--active">Onboarding complete</span>'
        : '<span class="badge badge--incomplete">Setup incomplete</span>'
      : '<span class="badge">Not connected</span>'

    content.innerHTML = `
      <div class="detail-meta">
        <div><span>Slug</span><code>${esc(club.slug)}</code></div>
        <div><span>City</span><strong>${esc(club.city) || '-'}</strong></div>
        <div><span>Created</span><strong>${fmtDate(club.createdAt)}</strong></div>
      </div>
      <div class="detail-stats">
        <div><strong>${club.counts.memberships}</strong><span>Members</span></div>
        <div><strong>${club.counts.teamGroups}</strong><span>Teams</span></div>
        <div><strong>${club.counts.events}</strong><span>Events</span></div>
      </div>
      <section class="detail-section">
        <p class="eyebrow">Subscription</p>
        <div class="detail-state">${subscription}</div>
        ${
          club.subscription?.currentPeriodEnd
            ? `<p class="muted-line">Period ends ${fmtDate(club.subscription.currentPeriodEnd)}${club.subscription.cancelAtPeriodEnd ? ' · cancellation scheduled' : ''}</p>`
            : ''
        }
      </section>
      <section class="detail-section">
        <p class="eyebrow">Stripe Connect</p>
        <div class="detail-state">${connectState}</div>
      </section>
      <section class="detail-section">
        <p class="eyebrow">Owners & admins</p>
        <ul class="detail-owners">${owners}</ul>
      </section>
    `
  } catch (err) {
    if (requestId !== clubDetailRequestId || !dialog.open) return
    title.textContent = 'Club details unavailable'
    content.innerHTML = `<p class="placeholder">${esc(err.message || err)}</p>`
  }
}

async function loadClubs() {
  const tbody = document.querySelector('#clubs-table tbody')
  const search = document.getElementById('clubs-search').value.trim()
  tbody.innerHTML = '<tr><td colspan="7" class="placeholder">Loading...</td></tr>'
  try {
    const qs = new URLSearchParams()
    if (search) qs.set('search', search)
    const { rows, total } = await adminFetch(`/admin/clubs${qs.toString() ? `?${qs}` : ''}`)
    document.getElementById('clubs-count').textContent = `${total} club${total === 1 ? '' : 's'}`
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="placeholder">No clubs match.</td></tr>'
      return
    }
    tbody.innerHTML = rows
      .map(
        (c) => `
          <tr>
            <td><button class="table-link" type="button" data-club-detail="${esc(c.id)}">${esc(c.name)}</button></td>
            <td><code>${esc(c.slug)}</code></td>
            <td>${esc(c.city) || '-'}</td>
            <td class="num">${c.counts.memberships}</td>
            <td class="num">${c.counts.teams}</td>
            <td>${c.hasSubscription ? '<span class="badge badge--plus">Plus</span>' : '<span class="badge">Free</span>'}</td>
            <td>${fmtDate(c.createdAt)}</td>
          </tr>
        `,
      )
      .join('')
  } catch (err) {
    setError(tbody, err)
  }
}

// - Section: Users -

let usersSearchTimer = null

function bindUsers() {
  document.getElementById('users-refresh').addEventListener('click', loadUsers)
  document.getElementById('users-search').addEventListener('input', () => {
    clearTimeout(usersSearchTimer)
    usersSearchTimer = setTimeout(loadUsers, 250)
  })
}

async function loadUsers() {
  const tbody = document.querySelector('#users-table tbody')
  const search = document.getElementById('users-search').value.trim()
  tbody.innerHTML = '<tr><td colspan="6" class="placeholder">Loading...</td></tr>'
  try {
    const qs = new URLSearchParams()
    if (search) qs.set('search', search)
    const { rows, total } = await adminFetch(`/admin/users${qs.toString() ? `?${qs}` : ''}`)
    document.getElementById('users-count').textContent = `${total} user${total === 1 ? '' : 's'}`
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="placeholder">No users match.</td></tr>'
      return
    }
    tbody.innerHTML = rows
      .map(
        (u) => `
          <tr>
            <td><strong>${esc(u.name)}</strong></td>
            <td>${esc(u.email) || '-'}</td>
            <td class="num">${u.clubCount}</td>
            <td>${u.platformRole === 'PLATFORM_ADMIN' ? '<span class="badge badge--plus">Admin</span>' : '<span class="badge">-</span>'}</td>
            <td>${fmtDate(u.createdAt)}</td>
            <td>${u.deleted ? '<span class="badge badge--deleted">deleted</span>' : '<span class="badge badge--active">active</span>'}</td>
          </tr>
        `,
      )
      .join('')
  } catch (err) {
    setError(tbody, err)
  }
}

// - Section: Subscriptions -

function bindSubs() {
  document.getElementById('subs-refresh').addEventListener('click', loadSubscriptions)
  document.getElementById('subs-status').addEventListener('change', loadSubscriptions)
}

async function loadSubscriptions() {
  const tbody = document.querySelector('#subs-table tbody')
  const status = document.getElementById('subs-status').value
  tbody.innerHTML = '<tr><td colspan="6" class="placeholder">Loading...</td></tr>'
  try {
    const qs = new URLSearchParams()
    if (status) qs.set('status', status)
    const rows = await adminFetch(`/admin/subscriptions${qs.toString() ? `?${qs}` : ''}`)
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="placeholder">No subscriptions.</td></tr>'
      return
    }
    tbody.innerHTML = rows
      .map(
        (s) => `
          <tr>
            <td><strong>${esc(s.club?.name || '-')}</strong><br/><code>${esc(s.club?.slug || '')}</code></td>
            <td>${badge(s.status)}</td>
            <td>${esc(s.plan)}</td>
            <td>${fmtDate(s.currentPeriodEnd)}</td>
            <td>${s.cancelAtPeriodEnd ? 'Yes' : 'No'}</td>
            <td><code>${esc(s.stripeSubscriptionId)}</code></td>
          </tr>
        `,
      )
      .join('')
  } catch (err) {
    setError(tbody, err)
  }
}

// - Section: Revenue -

async function loadRevenue() {
  const cards = document.querySelectorAll('#revenue-stats .stat-card .stat-value')
  try {
    const data = await adminFetch('/admin/revenue')
    cards[0].textContent = String(data.activeCount)
    cards[1].textContent = fmtCents(data.mrrCents)
    cards[2].textContent = fmtCents(data.arrCents)
  } catch (err) {
    cards.forEach((el) => (el.textContent = '-'))
    console.error(err)
  }
}

// - Section: Health -

async function loadHealth() {
  const cards = document.querySelectorAll('#health-stats .stat-card .stat-value')
  try {
    const data = await adminFetch('/admin/health')
    cards[0].textContent = String(data.userCount)
    cards[1].textContent = String(data.deletedUsers)
    cards[2].textContent = String(data.clubCount)
    cards[3].textContent = String(data.activeSubscriptions)
    document.getElementById('health-checked-at').textContent =
      `Checked ${fmtDateTime(data.checkedAt)}`
  } catch (err) {
    cards.forEach((el) => (el.textContent = '-'))
    document.getElementById('health-checked-at').textContent = err.message
  }
}

// - Section: Audit -

function bindAudit() {
  document.getElementById('audit-refresh').addEventListener('click', loadAudit)
}

async function loadAudit() {
  const tbody = document.querySelector('#audit-table tbody')
  const type = document.getElementById('audit-type').value.trim()
  tbody.innerHTML = '<tr><td colspan="4" class="placeholder">Loading...</td></tr>'
  try {
    const qs = new URLSearchParams()
    qs.set('limit', '100')
    if (type) qs.set('type', type)
    const data = await adminFetch(`/admin/audit-log?${qs}`)
    const rows = Array.isArray(data) ? data : data.items || data.rows || []
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="placeholder">No audit events.</td></tr>'
      return
    }
    tbody.innerHTML = rows
      .map(
        (a) => `
          <tr>
            <td>${fmtDateTime(a.createdAt)}</td>
            <td><code>${esc(a.type)}</code></td>
            <td>${esc(a.actorLabel || a.actorId || '-')}</td>
            <td>${esc(a.summary || '')}</td>
          </tr>
        `,
      )
      .join('')
  } catch (err) {
    setError(tbody, err)
  }
}

// - Section: Support -

function bindSupport() {
  const form = document.getElementById('support-form')
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const payload = {
      clubId: document.getElementById('support-club-id').value.trim(),
      action: 'SUPPORT_NOTE',
      note: document.getElementById('support-note').value.trim() || undefined,
    }
    const output = document.getElementById('support-output')
    output.textContent = 'Saving...'
    try {
      const result = await adminFetch('/admin/support-actions', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      output.textContent = JSON.stringify(result, null, 2)
      loadSupportRecent()
    } catch (err) {
      output.textContent = err.message
    }
  })
}

async function loadSupport() {
  loadSupportRecent()
}

async function loadSupportRecent() {
  const wrap = document.getElementById('support-recent')
  try {
    const rows = await adminFetch('/admin/support-actions')
    if (rows.length === 0) {
      wrap.innerHTML = '<p class="placeholder">No support actions yet.</p>'
      return
    }
    wrap.innerHTML = rows
      .slice(0, 20)
      .map(
        (r) => `
          <article class="list-card">
            <header>
              <h3>${esc(r.action)}</h3>
              <span class="badge">${esc(r.actorEmail || r.actorId)}</span>
            </header>
            <p><code>${esc(r.clubId)}</code></p>
            <p>${esc(r.note || 'No note recorded.')}</p>
            <p class="mono">${fmtDateTime(r.createdAt)}</p>
          </article>
        `,
      )
      .join('')
  } catch (err) {
    wrap.innerHTML = `<p class="placeholder">${esc(err.message)}</p>`
  }
}

// - Section: Sync (Fussball.de) -

function bindSync() {
  document.getElementById('sync-links-refresh').addEventListener('click', loadSyncLinks)
  document.getElementById('sync-runs-refresh').addEventListener('click', loadSyncRuns)
}

function loadSync() {
  loadSyncLinks()
  loadSyncRuns()
}

async function loadSyncLinks() {
  const wrap = document.getElementById('sync-links')
  wrap.innerHTML = '<p class="placeholder">Loading...</p>'
  try {
    const rows = await adminFetch('/admin/fussball/team-links')
    if (rows.length === 0) {
      wrap.innerHTML = '<p class="placeholder">No team links registered.</p>'
      return
    }
    wrap.innerHTML = rows
      .map(
        (link) => `
          <article class="list-card">
            <header>
              <h3>${esc(link.label)}</h3>
              ${badge(link.status)}
            </header>
            <p>${esc(link.club?.name || '-')}  /  ${esc(link.team?.displayName || '-')}</p>
            <p><code>${esc(link.externalTeamId)}</code></p>
            <p>Fixtures ${link.counts.fixtures}  /  Sync runs ${link.counts.syncRuns}  /  Last synced ${fmtDateTime(link.lastSyncedAt)}</p>
          </article>
        `,
      )
      .join('')
  } catch (err) {
    wrap.innerHTML = `<p class="placeholder">${esc(err.message)}</p>`
  }
}

async function loadSyncRuns() {
  const wrap = document.getElementById('sync-runs')
  wrap.innerHTML = '<p class="placeholder">Loading...</p>'
  try {
    const rows = await adminFetch('/admin/fussball/sync-runs')
    if (rows.length === 0) {
      wrap.innerHTML = '<p class="placeholder">No sync runs yet.</p>'
      return
    }
    wrap.innerHTML = rows
      .map(
        (run) => `
          <article class="list-card">
            <header>
              <h3>${esc(run.teamLink.label)}</h3>
              ${badge(run.status)}
            </header>
            <p>${esc(run.teamLink.club?.name || '-')}  /  ${esc(run.teamLink.team?.displayName || '-')}</p>
            <p>Imported ${run.importedCount}  /  Updated ${run.updatedCount}  /  Skipped ${run.skippedCount}</p>
            <p class="mono">${fmtDateTime(run.startedAt)}</p>
            ${run.errorSummary ? `<p>${esc(run.errorSummary)}</p>` : ''}
          </article>
        `,
      )
      .join('')
  } catch (err) {
    wrap.innerHTML = `<p class="placeholder">${esc(err.message)}</p>`
  }
}

// - Section: Broadcast -

function bindBroadcast() {
  const segmentSelect = document.getElementById('broadcast-segment')
  segmentSelect.addEventListener('change', () => {
    document.getElementById('broadcast-club-id-wrap').hidden =
      !segmentSelect.value.startsWith('CLUB:')
  })

  document.getElementById('broadcast-form').addEventListener('submit', (e) => {
    e.preventDefault()
    const output = document.getElementById('broadcast-output')
    output.textContent = 'Broadcast sending is disabled for launch.'
  })
}

async function loadBroadcast() {
  const wrap = document.getElementById('broadcast-history')
  wrap.innerHTML = '<p class="placeholder">Loading...</p>'
  try {
    const rows = await adminFetch('/admin/broadcasts')
    if (rows.length === 0) {
      wrap.innerHTML = '<p class="placeholder">No broadcasts sent yet.</p>'
      return
    }
    wrap.innerHTML = rows
      .map(
        (b) => `
          <article class="list-card">
            <header>
              <h3>${esc(b.title)}</h3>
              ${badge(b.status.toLowerCase())}
            </header>
            <p>${esc(b.body)}</p>
            <p class="mono">${esc(b.segment)}  /  ${b.successCount}/${b.recipientCount} delivered (${b.failureCount} failed)</p>
            <p class="mono">${fmtDateTime(b.sentAt || b.createdAt)}  /  by ${esc(b.createdBy?.email || b.createdById)}</p>
          </article>
        `,
      )
      .join('')
  } catch (err) {
    wrap.innerHTML = `<p class="placeholder">${esc(err.message)}</p>`
  }
}

// - Section: Feature flags -

function bindFlags() {
  document.getElementById('flag-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const output = document.getElementById('flag-output')
    const payload = {
      clubId: document.getElementById('flag-club-id').value.trim(),
      featureSlug: document.getElementById('flag-slug').value,
      enabled: document.getElementById('flag-enabled').value === 'true',
      reason: document.getElementById('flag-reason').value.trim() || null,
    }
    if (!payload.clubId) {
      output.textContent = 'Club ID required.'
      return
    }
    output.textContent = 'Saving...'
    try {
      const result = await adminFetch('/admin/feature-flags', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      output.textContent = JSON.stringify(result, null, 2)
      loadFlags()
    } catch (err) {
      output.textContent = err.message
    }
  })

  document.getElementById('flag-refresh').addEventListener('click', loadFlags)
  document.getElementById('flag-filter-club').addEventListener('input', () => {
    clearTimeout(flagsFilterTimer)
    flagsFilterTimer = setTimeout(loadFlags, 250)
  })
}

let flagsFilterTimer = null

async function loadFlags() {
  const wrap = document.getElementById('flag-list')
  const filter = document.getElementById('flag-filter-club').value.trim()
  wrap.innerHTML = '<p class="placeholder">Loading...</p>'
  try {
    const qs = new URLSearchParams()
    if (filter) qs.set('clubId', filter)
    const rows = await adminFetch(`/admin/feature-flags${qs.toString() ? `?${qs}` : ''}`)
    if (rows.length === 0) {
      wrap.innerHTML = '<p class="placeholder">No overrides set.</p>'
      return
    }
    wrap.innerHTML = rows
      .map(
        (f) => `
          <article class="list-card">
            <header>
              <h3>${esc(f.featureSlug)}</h3>
              <span class="badge badge--${f.enabled ? 'active' : 'deleted'}">${f.enabled ? 'GRANTED' : 'REVOKED'}</span>
            </header>
            <p><strong>${esc(f.club?.name || '-')}</strong>  /  <code>${esc(f.clubId)}</code></p>
            ${f.reason ? `<p>${esc(f.reason)}</p>` : ''}
            <p class="mono">${fmtDateTime(f.createdAt)}${f.expiresAt ? `  /  expires ${fmtDate(f.expiresAt)}` : ''}</p>
            <p><button class="pill" data-flag-remove="${esc(f.id)}">Remove</button></p>
          </article>
        `,
      )
      .join('')
    wrap.querySelectorAll('[data-flag-remove]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.flagRemove
        if (!confirm('Remove this override?')) return
        try {
          await adminFetch(`/admin/feature-flags/${id}`, { method: 'DELETE' })
          loadFlags()
        } catch (err) {
          alert(err.message)
        }
      })
    })
  } catch (err) {
    wrap.innerHTML = `<p class="placeholder">${esc(err.message)}</p>`
  }
}

// - Section: Moderation -

function bindModeration() {
  document.getElementById('moderation-refresh').addEventListener('click', loadModerationReports)
  document
    .getElementById('moderation-blocks-refresh')
    .addEventListener('click', loadModerationBlocks)
}

function loadModeration() {
  loadModerationReports()
  loadModerationBlocks()
}

async function loadModerationReports() {
  const wrap = document.getElementById('moderation-reports')
  wrap.innerHTML = '<p class="placeholder">Loading...</p>'
  try {
    const rows = await adminFetch('/admin/moderation/reports?resolved=false&limit=100')
    if (rows.length === 0) {
      wrap.innerHTML = '<p class="placeholder">Inbox zero. No open reports.</p>'
      return
    }
    wrap.innerHTML = rows
      .map(
        (r) => `
          <article class="list-card">
            <header>
              <h3>${esc(r.reason)}</h3>
              <span class="badge">${esc(r.message?.sender?.name || 'Unknown sender')}</span>
            </header>
            <p>${esc(r.message?.content?.slice(0, 280) || '(message deleted)')}</p>
            <p class="mono">reported by ${esc(r.reporter?.email || r.reporterUserId)}  /  ${fmtDateTime(r.createdAt)}</p>
            <p>
              <button class="pill" data-report-resolve="${esc(r.id)}" data-action="dismiss">Dismiss</button>
              <button class="pill pill--dark" data-report-resolve="${esc(r.id)}" data-action="action">Mark actioned</button>
            </p>
          </article>
        `,
      )
      .join('')
    wrap.querySelectorAll('[data-report-resolve]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.reportResolve
        const action = btn.dataset.action
        const note = prompt(
          action === 'dismiss'
            ? 'Dismissal note (optional):'
            : 'What action did you take? (suspend / warn / etc.)',
        )
        if (note === null) return
        try {
          await adminFetch(`/admin/moderation/reports/${id}/resolve`, {
            method: 'POST',
            body: JSON.stringify({
              resolution: note || (action === 'dismiss' ? 'dismissed' : 'actioned'),
            }),
          })
          loadModerationReports()
        } catch (err) {
          alert(err.message)
        }
      })
    })
  } catch (err) {
    wrap.innerHTML = `<p class="placeholder">${esc(err.message)}</p>`
  }
}

async function loadModerationBlocks() {
  const wrap = document.getElementById('moderation-blocks')
  wrap.innerHTML = '<p class="placeholder">Loading...</p>'
  try {
    const rows = await adminFetch('/admin/moderation/blocks?limit=50')
    if (rows.length === 0) {
      wrap.innerHTML = '<p class="placeholder">No user blocks recorded.</p>'
      return
    }
    wrap.innerHTML = rows
      .map(
        (b) => `
          <article class="list-card">
            <header>
              <h3>${esc(b.blocker?.name || b.blockerUserId)} ${esc(b.blocked?.name || b.blockedUserId)}</h3>
            </header>
            <p class="mono">${esc(b.blocker?.email || '')} blocked ${esc(b.blocked?.email || '')}</p>
            <p class="mono">${fmtDateTime(b.createdAt)}</p>
          </article>
        `,
      )
      .join('')
  } catch (err) {
    wrap.innerHTML = `<p class="placeholder">${esc(err.message)}</p>`
  }
}

// - Section: Analytics -

async function loadAnalytics() {
  const cards = document.querySelectorAll('#analytics-stats .stat-card .stat-value')
  const engagement = document.querySelectorAll('#analytics-engagement .stat-card .stat-value')
  try {
    const data = await adminFetch('/admin/analytics')
    cards[0].textContent = String(data.totals.users)
    cards[1].textContent = String(data.activeUsers.dau)
    cards[2].textContent = String(data.activeUsers.wau)
    cards[3].textContent = String(data.activeUsers.mau)
    engagement[0].textContent = String(data.engagementLast30.events)
    engagement[1].textContent = String(data.engagementLast30.rsvps)
    renderSignups(data.signups)
    renderFunnel(data.activationLast30)
  } catch (err) {
    cards.forEach((el) => (el.textContent = '-'))
    document.getElementById('analytics-signups-chart').innerHTML =
      `<p class="placeholder">${esc(err.message)}</p>`
  }
}

function renderSignups(signups) {
  const wrap = document.getElementById('analytics-signups-chart')
  document.getElementById('analytics-signups-summary').textContent =
    `${signups.last7} signed up in the last 7 days  /  ${signups.last30} in the last 30.`
  const rows = signups.byDay || []
  if (rows.length === 0) {
    wrap.innerHTML = '<p class="placeholder">No signups in the window.</p>'
    return
  }
  const max = Math.max(...rows.map((r) => r.count))
  wrap.innerHTML = rows
    .map((r) => {
      const pct = max === 0 ? 0 : Math.round((r.count / max) * 100)
      return `
        <div class="bars-row">
          <span class="day">${esc(r.day)}</span>
          <span class="bar"><span class="bar-fill" style="width:${pct}%"></span></span>
          <span class="count">${r.count}</span>
        </div>
      `
    })
    .join('')
}

function renderFunnel(funnel) {
  const wrap = document.getElementById('analytics-funnel')
  if (!funnel || funnel.signups === 0) {
    wrap.innerHTML = '<p class="placeholder">No signups in the 30-day window yet.</p>'
    return
  }
  const steps = [
    { label: 'Signed up', value: funnel.signups },
    { label: 'Sent an RSVP', value: funnel.sentAnRsvp },
    { label: 'Created an event', value: funnel.createdAnEvent },
  ]
  const cohort = funnel.signups
  wrap.innerHTML = steps
    .map((step) => {
      const pct = cohort === 0 ? 0 : Math.round((step.value / cohort) * 100)
      return `
        <div class="funnel-step">
          <header><span>${esc(step.label)}</span><span class="mono">${pct}%</span></header>
          <div class="funnel-meter"><span class="funnel-meter-fill" style="width:${pct}%"></span></div>
          <p class="funnel-value">${step.value} / ${cohort}</p>
        </div>
      `
    })
    .join('')
}

// - Section: Releases (platform settings) -

function bindReleases() {
  document.getElementById('settings-refresh').addEventListener('click', loadReleases)
}

async function loadReleases() {
  const wrap = document.getElementById('settings-list')
  wrap.innerHTML = '<p class="placeholder">Loading...</p>'
  try {
    const rows = await adminFetch('/admin/settings')
    if (rows.length === 0) {
      wrap.innerHTML = '<p class="placeholder">No settings defined.</p>'
      return
    }
    wrap.innerHTML = rows
      .map(
        (s) => `
          <article class="setting-card">
            <header>
              <span class="setting-key">${esc(s.key)}</span>
              <span class="setting-meta">${s.isOverridden ? `updated ${fmtDateTime(s.updatedAt)}` : `default: never set`}</span>
            </header>
            ${s.description ? `<p class="muted-line">${esc(s.description)}</p>` : ''}
            <div class="setting-row">
              <input class="text-input" data-setting-input="${esc(s.key)}" value="${esc(s.value)}" />
              <button class="pill pill--dark" data-setting-save="${esc(s.key)}">Save</button>
            </div>
            <p class="muted-line">Default: <code>${esc(s.defaultValue)}</code></p>
          </article>
        `,
      )
      .join('')
    wrap.querySelectorAll('[data-setting-save]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const key = btn.dataset.settingSave
        const input = wrap.querySelector(`[data-setting-input="${CSS.escape(key)}"]`)
        const value = input.value
        try {
          await adminFetch('/admin/settings', {
            method: 'POST',
            body: JSON.stringify({ key, value }),
          })
          loadReleases()
        } catch (err) {
          alert(err.message)
        }
      })
    })
  } catch (err) {
    wrap.innerHTML = `<p class="placeholder">${esc(err.message)}</p>`
  }
}

// - Section: Settings -

function renderSettings() {
  const sessionStatus = document.getElementById('admin-session-status')
  const sessionToken = getSessionToken()
  const sessionUser = getSessionUser()
  sessionStatus.textContent = sessionToken
    ? `Signed in as ${sessionUser?.email || sessionUser?.name || 'platform admin'} for this browser session.`
    : 'No operator session.'
  document.getElementById('admin-email-input').value = getAdminEmail()
  document.getElementById('admin-code-input').value = ''

  const status = document.getElementById('admin-key-status')
  const stored = getApiKey()
  status.textContent = stored
    ? `Key saved (${stored.slice(0, 4)}...${stored.slice(-4)}).`
    : 'No key saved.'
  document.getElementById('admin-key-input').value = ''
  document.getElementById('api-base-input').value = getApiBase()
}

function bindSettings() {
  document.getElementById('admin-otp-request').addEventListener('click', async () => {
    const email = document.getElementById('admin-email-input').value.trim()
    const status = document.getElementById('admin-session-status')
    if (!email) {
      status.textContent = 'Enter your operator email first.'
      return
    }
    setAdminEmail(email)
    status.textContent = 'Sending code...'
    try {
      await authFetch('/auth/otp/request', { email })
      status.textContent = 'Code sent if that email can sign in.'
      document.getElementById('admin-code-input').focus()
    } catch (err) {
      status.textContent = err.message
    }
  })

  document.getElementById('admin-otp-verify').addEventListener('click', async () => {
    const email = document.getElementById('admin-email-input').value.trim()
    const code = document.getElementById('admin-code-input').value.trim()
    const status = document.getElementById('admin-session-status')
    if (!email || !/^\d{6}$/.test(code)) {
      status.textContent = 'Enter your email and 6-digit code.'
      return
    }
    setAdminEmail(email)
    status.textContent = 'Verifying...'
    try {
      const result = await authFetch('/auth/otp/verify', { email, code })
      setSessionToken(result.token)
      setSessionUser(result.user)
      try {
        await adminFetch('/admin/health')
      } catch (err) {
        setSessionToken('')
        setSessionUser(null)
        status.textContent = 'Signed in, but this account is not a platform admin.'
        updateAuthSummary()
        return
      }
      renderSettings()
      updateAuthSummary()
      navigate()
    } catch (err) {
      status.textContent = err.message
    }
  })

  document.getElementById('admin-session-clear').addEventListener('click', () => {
    setSessionToken('')
    setSessionUser(null)
    renderSettings()
    updateAuthSummary()
  })

  document.getElementById('admin-key-save').addEventListener('click', () => {
    const value = document.getElementById('admin-key-input').value.trim()
    if (!value) return
    setApiKey(value)
    renderSettings()
    updateAuthSummary()
    navigate()
  })
  document.getElementById('admin-key-clear').addEventListener('click', () => {
    setApiKey('')
    renderSettings()
    updateAuthSummary()
  })
  document.getElementById('api-base-save').addEventListener('click', () => {
    const value = document.getElementById('api-base-input').value.trim()
    setApiBase(value)
    renderSettings()
  })
}

function updateAuthSummary() {
  const el = document.getElementById('signed-in-as')
  if (!el) return

  const sessionToken = getSessionToken()
  const sessionUser = getSessionUser()
  if (sessionToken) {
    el.textContent = `Signed in as ${sessionUser?.email || sessionUser?.name || 'platform admin'} via operator session.`
    return
  }

  const key = getApiKey()
  el.textContent = key
    ? `Authenticated via X-Admin-Key (${key.slice(0, 4)}...).`
    : 'Not authenticated. Open Settings to sign in or paste your ADMIN_API_KEY.'
}

// - Boot -

document.addEventListener('DOMContentLoaded', () => {
  bindGlobalSearch()
  bindMobileNavigation()
  bindClubs()
  bindUsers()
  bindSubs()
  bindAudit()
  bindSupport()
  bindSync()
  bindBroadcast()
  bindFlags()
  bindModeration()
  bindReleases()
  bindSettings()

  // Surface auth status in the Overview lede.
  updateAuthSummary()

  if (!hasAdminCredentials() && currentSection() !== 'settings') {
    window.location.hash = '#/settings'
    return
  }

  navigate()
})
