/*
 * Anstoss Platform Admin — V1
 *
 * Single-page vanilla JS. Hash-routed (#/overview, #/clubs, …) so deep
 * links work. Authenticates against /admin/* via the X-Admin-Key header
 * (paste once in Settings, stored in localStorage). When the backend's
 * PlatformAdminGuard sees a matching header, it bypasses Clerk JWT
 * verification. Other admin operators with a DB platformRole flag can
 * still log in via the mobile app's Clerk session and hit the same
 * endpoints; this page is the one place the X-Admin-Key path is used.
 */

// ─── Config / storage ────────────────────────────────────

const KEY_STORAGE = 'anstoss.admin.apiKey'
const BASE_STORAGE = 'anstoss.admin.apiBase'
const CLERK_KEY_STORAGE = 'anstoss.admin.clerkPublishableKey'

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
function getClerkKey() {
  return localStorage.getItem(CLERK_KEY_STORAGE) || ''
}
function setClerkKey(value) {
  if (value) localStorage.setItem(CLERK_KEY_STORAGE, value)
  else localStorage.removeItem(CLERK_KEY_STORAGE)
}

function apiUrl(path) {
  const base = getApiBase().replace(/\/$/, '')
  return base ? `${base}${path}` : path
}

// ─── HTTP ────────────────────────────────────────────────

async function adminFetch(path, options = {}) {
  const headers = {
    Accept: 'application/json',
    ...(options.headers || {}),
  }

  // Prefer Clerk session JWT when the user is signed in. Backend's
  // PlatformAdminGuard runs after ClerkAuthGuard; the latter populates
  // request.user from the Bearer token, then the former verifies the
  // DB platformRole flag. Fall back to X-Admin-Key for back-compat.
  const clerkToken = await getClerkTokenSafely()
  if (clerkToken) {
    headers['Authorization'] = `Bearer ${clerkToken}`
  } else {
    const key = getApiKey()
    if (key) headers['X-Admin-Key'] = key
  }

  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(apiUrl(path), { ...options, headers })

  if (res.status === 401 || res.status === 403) {
    throw new Error(
      'Auth failed. Sign in (top bar) or paste an ADMIN_API_KEY in Settings.',
    )
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Request failed (${res.status}): ${text || res.statusText}`)
  }
  return res.json()
}

async function getClerkTokenSafely() {
  try {
    if (typeof window === 'undefined') return null
    const Clerk = window.Clerk
    if (!Clerk || !Clerk.loaded || !Clerk.session) return null
    return await Clerk.session.getToken()
  } catch {
    return null
  }
}

// ─── Routing ─────────────────────────────────────────────

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

function currentSection() {
  const hash = window.location.hash.replace(/^#\/?/, '') || 'overview'
  return SECTIONS.includes(hash) ? hash : 'overview'
}

function navigate() {
  const target = currentSection()
  document.querySelectorAll('.page').forEach((page) => {
    page.hidden = page.dataset.page !== target
  })
  document.querySelectorAll('.nav-item').forEach((link) => {
    link.classList.toggle('active', link.dataset.section === target)
  })
  const loader = SECTION_LOADERS[target]
  if (loader) loader()
}

window.addEventListener('hashchange', navigate)

// ─── Helpers ─────────────────────────────────────────────

function fmtDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function fmtDateTime(value) {
  if (!value) return '—'
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

// ─── Section: Overview ───────────────────────────────────

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
    stats.forEach((el) => (el.textContent = '—'))
    warnings.textContent = err.message
  }
}

// ─── Section: Clubs ──────────────────────────────────────

let clubsSearchTimer = null

function bindClubs() {
  document.getElementById('clubs-refresh').addEventListener('click', loadClubs)
  document.getElementById('clubs-search').addEventListener('input', () => {
    clearTimeout(clubsSearchTimer)
    clubsSearchTimer = setTimeout(loadClubs, 250)
  })
}

async function loadClubs() {
  const tbody = document.querySelector('#clubs-table tbody')
  const search = document.getElementById('clubs-search').value.trim()
  tbody.innerHTML = '<tr><td colspan="7" class="placeholder">Loading…</td></tr>'
  try {
    const qs = new URLSearchParams()
    if (search) qs.set('search', search)
    const { rows, total } = await adminFetch(
      `/admin/clubs${qs.toString() ? `?${qs}` : ''}`,
    )
    document.getElementById('clubs-count').textContent = `${total} club${total === 1 ? '' : 's'}`
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="placeholder">No clubs match.</td></tr>'
      return
    }
    tbody.innerHTML = rows
      .map(
        (c) => `
          <tr>
            <td><strong>${esc(c.name)}</strong></td>
            <td><code>${esc(c.slug)}</code></td>
            <td>${esc(c.city) || '—'}</td>
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

// ─── Section: Users ──────────────────────────────────────

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
  tbody.innerHTML = '<tr><td colspan="6" class="placeholder">Loading…</td></tr>'
  try {
    const qs = new URLSearchParams()
    if (search) qs.set('search', search)
    const { rows, total } = await adminFetch(
      `/admin/users${qs.toString() ? `?${qs}` : ''}`,
    )
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
            <td>${esc(u.email) || '—'}</td>
            <td class="num">${u.clubCount}</td>
            <td>${u.platformRole === 'PLATFORM_ADMIN' ? '<span class="badge badge--plus">Admin</span>' : '<span class="badge">—</span>'}</td>
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

// ─── Section: Subscriptions ──────────────────────────────

function bindSubs() {
  document.getElementById('subs-refresh').addEventListener('click', loadSubscriptions)
  document.getElementById('subs-status').addEventListener('change', loadSubscriptions)
}

async function loadSubscriptions() {
  const tbody = document.querySelector('#subs-table tbody')
  const status = document.getElementById('subs-status').value
  tbody.innerHTML = '<tr><td colspan="6" class="placeholder">Loading…</td></tr>'
  try {
    const qs = new URLSearchParams()
    if (status) qs.set('status', status)
    const rows = await adminFetch(
      `/admin/subscriptions${qs.toString() ? `?${qs}` : ''}`,
    )
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="placeholder">No subscriptions.</td></tr>'
      return
    }
    tbody.innerHTML = rows
      .map(
        (s) => `
          <tr>
            <td><strong>${esc(s.club?.name || '—')}</strong><br/><code>${esc(s.club?.slug || '')}</code></td>
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

// ─── Section: Revenue ────────────────────────────────────

async function loadRevenue() {
  const cards = document.querySelectorAll('#revenue-stats .stat-card .stat-value')
  try {
    const data = await adminFetch('/admin/revenue')
    cards[0].textContent = String(data.activeCount)
    cards[1].textContent = fmtCents(data.mrrCents)
    cards[2].textContent = fmtCents(data.arrCents)
  } catch (err) {
    cards.forEach((el) => (el.textContent = '—'))
    console.error(err)
  }
}

// ─── Section: Health ─────────────────────────────────────

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
    cards.forEach((el) => (el.textContent = '—'))
    document.getElementById('health-checked-at').textContent = err.message
  }
}

// ─── Section: Audit ──────────────────────────────────────

function bindAudit() {
  document.getElementById('audit-refresh').addEventListener('click', loadAudit)
}

async function loadAudit() {
  const tbody = document.querySelector('#audit-table tbody')
  const type = document.getElementById('audit-type').value.trim()
  tbody.innerHTML = '<tr><td colspan="4" class="placeholder">Loading…</td></tr>'
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
            <td>${esc(a.actorLabel || a.actorId || '—')}</td>
            <td>${esc(a.summary || '')}</td>
          </tr>
        `,
      )
      .join('')
  } catch (err) {
    setError(tbody, err)
  }
}

// ─── Section: Support ────────────────────────────────────

function bindSupport() {
  const form = document.getElementById('support-form')
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const payload = {
      clubId: document.getElementById('support-club-id').value.trim(),
      action: document.getElementById('support-action').value,
      note: document.getElementById('support-note').value.trim() || undefined,
    }
    const output = document.getElementById('support-output')
    output.textContent = 'Running…'
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

// ─── Section: Sync (Fussball.de) ─────────────────────────

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
  wrap.innerHTML = '<p class="placeholder">Loading…</p>'
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
            <p>${esc(link.club?.name || '—')} · ${esc(link.team?.displayName || '—')}</p>
            <p><code>${esc(link.externalTeamId)}</code></p>
            <p>Fixtures ${link.counts.fixtures} · Sync runs ${link.counts.syncRuns} · Last synced ${fmtDateTime(link.lastSyncedAt)}</p>
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
  wrap.innerHTML = '<p class="placeholder">Loading…</p>'
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
            <p>${esc(run.teamLink.club?.name || '—')} · ${esc(run.teamLink.team?.displayName || '—')}</p>
            <p>Imported ${run.importedCount} · Updated ${run.updatedCount} · Skipped ${run.skippedCount}</p>
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

// ─── Section: Broadcast ──────────────────────────────────

function bindBroadcast() {
  const segmentSelect = document.getElementById('broadcast-segment')
  segmentSelect.addEventListener('change', () => {
    document.getElementById('broadcast-club-id-wrap').hidden =
      !segmentSelect.value.startsWith('CLUB:')
  })

  document.getElementById('broadcast-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const output = document.getElementById('broadcast-output')
    let segment = segmentSelect.value
    if (segment === 'CLUB:') {
      const clubId = document.getElementById('broadcast-club-id').value.trim()
      if (!clubId) {
        output.textContent = 'Club ID required for CLUB segment.'
        return
      }
      segment = `CLUB:${clubId}`
    }
    const payload = {
      title: document.getElementById('broadcast-title').value.trim(),
      body: document.getElementById('broadcast-body').value.trim(),
      segment,
    }
    output.textContent = 'Sending…'
    try {
      const result = await adminFetch('/admin/broadcasts', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      output.textContent = `Sent: ${result.successCount}/${result.recipientCount} delivered, ${result.failureCount} failed.`
      loadBroadcast()
    } catch (err) {
      output.textContent = err.message
    }
  })
}

async function loadBroadcast() {
  const wrap = document.getElementById('broadcast-history')
  wrap.innerHTML = '<p class="placeholder">Loading…</p>'
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
            <p class="mono">${esc(b.segment)} · ${b.successCount}/${b.recipientCount} delivered (${b.failureCount} failed)</p>
            <p class="mono">${fmtDateTime(b.sentAt || b.createdAt)} · by ${esc(b.createdBy?.email || b.createdById)}</p>
          </article>
        `,
      )
      .join('')
  } catch (err) {
    wrap.innerHTML = `<p class="placeholder">${esc(err.message)}</p>`
  }
}

// ─── Section: Feature flags ──────────────────────────────

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
    output.textContent = 'Saving…'
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
  wrap.innerHTML = '<p class="placeholder">Loading…</p>'
  try {
    const qs = new URLSearchParams()
    if (filter) qs.set('clubId', filter)
    const rows = await adminFetch(
      `/admin/feature-flags${qs.toString() ? `?${qs}` : ''}`,
    )
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
            <p><strong>${esc(f.club?.name || '—')}</strong> · <code>${esc(f.clubId)}</code></p>
            ${f.reason ? `<p>${esc(f.reason)}</p>` : ''}
            <p class="mono">${fmtDateTime(f.createdAt)}${f.expiresAt ? ` · expires ${fmtDate(f.expiresAt)}` : ''}</p>
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

// ─── Section: Moderation ─────────────────────────────────

function bindModeration() {
  document.getElementById('moderation-refresh').addEventListener('click', loadModerationReports)
  document.getElementById('moderation-blocks-refresh').addEventListener('click', loadModerationBlocks)
}

function loadModeration() {
  loadModerationReports()
  loadModerationBlocks()
}

async function loadModerationReports() {
  const wrap = document.getElementById('moderation-reports')
  wrap.innerHTML = '<p class="placeholder">Loading…</p>'
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
            <p class="mono">reported by ${esc(r.reporter?.email || r.reporterUserId)} · ${fmtDateTime(r.createdAt)}</p>
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
  wrap.innerHTML = '<p class="placeholder">Loading…</p>'
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
              <h3>${esc(b.blocker?.name || b.blockerUserId)} → ${esc(b.blocked?.name || b.blockedUserId)}</h3>
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

// ─── Section: Analytics ──────────────────────────────────

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
    cards.forEach((el) => (el.textContent = '—'))
    document.getElementById('analytics-signups-chart').innerHTML =
      `<p class="placeholder">${esc(err.message)}</p>`
  }
}

function renderSignups(signups) {
  const wrap = document.getElementById('analytics-signups-chart')
  document.getElementById('analytics-signups-summary').textContent =
    `${signups.last7} signed up in the last 7 days · ${signups.last30} in the last 30.`
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
    wrap.innerHTML =
      '<p class="placeholder">No signups in the 30-day window yet.</p>'
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

// ─── Section: Releases (platform settings) ───────────────

function bindReleases() {
  document.getElementById('settings-refresh').addEventListener('click', loadReleases)
}

async function loadReleases() {
  const wrap = document.getElementById('settings-list')
  wrap.innerHTML = '<p class="placeholder">Loading…</p>'
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
              <span class="setting-meta">${s.isOverridden ? `updated ${fmtDateTime(s.updatedAt)}` : `default — never set`}</span>
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

// ─── Clerk session auth ──────────────────────────────────

/**
 * Loads the Clerk JS SDK from the official CDN, mounts a sign-in / sign-out
 * top bar, and signals success so adminFetch can attach a Bearer token.
 * Sign-in is gated by Clerk's hosted modal (`Clerk.openSignIn`). If the
 * user is not a PLATFORM_ADMIN, the backend returns 403 — surfaced as
 * an inline error on the next API call.
 */
async function bootClerk() {
  const key = getClerkKey()
  const bar = document.getElementById('auth-bar')
  const state = document.getElementById('auth-state')
  const signInBtn = document.getElementById('auth-sign-in')
  const signOutBtn = document.getElementById('auth-sign-out')

  bar.hidden = false
  document.body.classList.add('auth-bar-visible')

  if (!key) {
    state.textContent =
      'Clerk publishable key not set — using legacy X-Admin-Key. Open Settings.'
    return
  }

  state.textContent = 'Loading Clerk…'

  // Inject the Clerk script if not already present.
  if (!window.Clerk) {
    await injectClerkScript(key)
  }

  if (!window.Clerk) {
    state.textContent =
      'Clerk failed to load. Check the publishable key and your network.'
    return
  }

  try {
    await window.Clerk.load()
  } catch (err) {
    state.textContent = `Clerk error: ${err.message || err}`
    return
  }

  function refreshAuthState() {
    if (window.Clerk.user) {
      state.textContent = `Signed in as ${window.Clerk.user.primaryEmailAddress?.emailAddress || window.Clerk.user.id}`
      signInBtn.hidden = true
      signOutBtn.hidden = false
    } else {
      state.textContent = 'Not signed in. Click "Sign in" to authenticate.'
      signInBtn.hidden = false
      signOutBtn.hidden = true
    }
  }
  refreshAuthState()

  signInBtn.addEventListener('click', () => {
    window.Clerk.openSignIn({ afterSignInUrl: window.location.href })
  })
  signOutBtn.addEventListener('click', async () => {
    await window.Clerk.signOut()
    refreshAuthState()
    navigate() // re-load current section
  })

  window.Clerk.addListener(refreshAuthState)
}

function injectClerkScript(publishableKey) {
  return new Promise((resolve) => {
    const script = document.createElement('script')
    script.async = true
    script.crossOrigin = 'anonymous'
    script.setAttribute('data-clerk-publishable-key', publishableKey)
    script.src = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5/dist/clerk.browser.js'
    script.onload = () => resolve()
    script.onerror = () => resolve()
    document.head.appendChild(script)
  })
}

// ─── Section: Settings ───────────────────────────────────

function renderSettings() {
  const status = document.getElementById('admin-key-status')
  const stored = getApiKey()
  status.textContent = stored
    ? `Key saved (${stored.slice(0, 4)}…${stored.slice(-4)}).`
    : 'No key saved.'
  document.getElementById('admin-key-input').value = ''
  document.getElementById('api-base-input').value = getApiBase()
  document.getElementById('clerk-key-input').value = getClerkKey()
}

function bindSettings() {
  document.getElementById('admin-key-save').addEventListener('click', () => {
    const value = document.getElementById('admin-key-input').value.trim()
    if (!value) return
    setApiKey(value)
    renderSettings()
    navigate()
  })
  document.getElementById('admin-key-clear').addEventListener('click', () => {
    setApiKey('')
    renderSettings()
  })
  document.getElementById('api-base-save').addEventListener('click', () => {
    const value = document.getElementById('api-base-input').value.trim()
    setApiBase(value)
    renderSettings()
  })
  document.getElementById('clerk-key-save').addEventListener('click', () => {
    const value = document.getElementById('clerk-key-input').value.trim()
    setClerkKey(value)
    window.location.reload()
  })
}

// ─── Boot ────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
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
  const key = getApiKey()
  const clerkKey = getClerkKey()
  document.getElementById('signed-in-as').textContent = clerkKey
    ? 'Clerk auth configured — sign in via the top bar.'
    : key
      ? `Authenticated via X-Admin-Key (${key.slice(0, 4)}…).`
      : 'Not authenticated — open Settings to paste your ADMIN_API_KEY or Clerk publishable key.'

  // Mount Clerk if configured (non-blocking).
  void bootClerk()

  navigate()
})
