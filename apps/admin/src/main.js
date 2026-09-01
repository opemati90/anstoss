/*
 * Anstoss Platform Admin - V1
 *
 * Single-page vanilla JS. Hash-routed (#/overview, #/clubs, ...) so deep
 * links work. Authenticates against /admin/* with an in-app username/password
 * session when available, falling back to X-Admin-Key for break-glass ops.
 */

// - Config / storage -

const KEY_STORAGE = 'anstoss.admin.apiKey'
const BASE_STORAGE = 'anstoss.admin.apiBase'
const SESSION_TOKEN_STORAGE = 'anstoss.admin.sessionToken'
const SESSION_USER_STORAGE = 'anstoss.admin.sessionUser'
const ADMIN_USERNAME_STORAGE = 'anstoss.admin.username'

function getApiKey() {
  return sessionStorage.getItem(KEY_STORAGE) || ''
}
function setApiKey(value) {
  if (value) sessionStorage.setItem(KEY_STORAGE, value)
  else sessionStorage.removeItem(KEY_STORAGE)
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
function getAdminUsername() {
  return localStorage.getItem(ADMIN_USERNAME_STORAGE) || ''
}
function hasAdminCredentials() {
  return Boolean(getSessionToken() || getApiKey())
}
function setAdminUsername(value) {
  if (value) localStorage.setItem(ADMIN_USERNAME_STORAGE, value)
  else localStorage.removeItem(ADMIN_USERNAME_STORAGE)
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
    return 'Admin proxy is not available in this environment. Configure the admin service proxy before using the console.'
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
    renderAuthGate('Session expired. Sign in again.')
    updateAuthSummary()
    if (getApiKey()) {
      return adminFetch(path, options, false)
    }
  }

  if (res.status === 401 || res.status === 403) {
    throw new Error(
      'Auth failed. Sign in on the admin login page or use a valid ADMIN_API_KEY.',
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

function renderAuthGate(message = '') {
  const loginShell = document.getElementById('login-shell')
  const appShell = document.getElementById('app-shell')
  const usernameInput = document.getElementById('admin-login-username')
  const passwordInput = document.getElementById('admin-login-password')
  const status = document.getElementById('admin-login-status')
  const authenticated = hasAdminCredentials()

  loginShell.hidden = authenticated
  appShell.hidden = !authenticated

  if (!authenticated) {
    usernameInput.value = getAdminUsername()
    passwordInput.value = ''
    status.textContent = message || 'Sign in to open the admin workspace.'
  }
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
  subscriptions: 'Billing',
  revenue: 'Revenue',
  health: 'Operations',
  audit: 'Audit log',
  support: 'Support notes',
  broadcast: 'Broadcast push',
  flags: 'Feature flags',
  moderation: 'Moderation',
  analytics: 'Analytics',
  sql: 'SQL runner',
  releases: 'Releases',
  settings: 'Settings',
}

const PRIMARY_SECTION = {
  revenue: 'subscriptions',
  audit: 'health',
  support: 'health',
  broadcast: 'health',
  flags: 'health',
  moderation: 'health',
  analytics: 'health',
  releases: 'health',
  sql: 'health',
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
    const isActive = link.dataset.section === (PRIMARY_SECTION[target] || target)
    link.classList.toggle('active', isActive)
    if (link.dataset.section === target) {
      link.setAttribute('aria-current', 'page')
    } else {
      link.removeAttribute('aria-current')
    }
    if (isActive) {
      activeLink = link
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

function bindMobileNavigation() {
  const toggle = document.getElementById('mobile-nav-toggle')
  const nav = document.getElementById('admin-nav')
  const footer = document.querySelector('.sidebar-foot')
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
  footer?.addEventListener('click', (event) => {
    if (event.target.closest('a')) close()
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
  document.querySelector('#club-claims-table tbody').addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-claim-decision]')
    if (!trigger) return
    void reviewClubClaim(trigger.dataset.claimId, trigger.dataset.claimDecision)
  })
  document.getElementById('dispute-open').addEventListener('click', () => void openClubDispute())
  document.querySelector('#club-disputes-table tbody').addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-dispute-resolve]')
    if (trigger) void resolveClubDispute(trigger.dataset.disputeResolve)
  })
  document.querySelector('#invite-campaigns-table tbody').addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-campaign-revoke]')
    if (trigger) void revokeInviteCampaign(trigger.dataset.campaignRevoke)
  })
  const dialog = document.getElementById('club-detail-dialog')
  document.getElementById('club-detail-close').addEventListener('click', closeClubDetail)
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeClubDetail()
  })
  dialog.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-grant-entitlement]')
    if (trigger) void grantClubEntitlement(trigger.dataset.grantEntitlement)
    const revokeTrigger = event.target.closest('[data-revoke-entitlement]')
    if (revokeTrigger) {
      void revokeClubEntitlement(
        revokeTrigger.dataset.revokeEntitlement,
        revokeTrigger.dataset.clubId,
      )
    }
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
    const [club, entitlements] = await Promise.all([
      adminFetch(`/admin/clubs/${encodeURIComponent(clubId)}`),
      adminFetch(`/admin/clubs/${encodeURIComponent(clubId)}/entitlements`),
    ])
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
    const grants = entitlements.grants?.length
      ? entitlements.grants
          .map(
            (grant) => `
              <li>
                <span>
                  <strong>${esc(grant.tier)}</strong>
                  ${badge(grant.status)}
                  <small>${esc(grant.source)} · ${grant.expiresAt ? `ends ${fmtDate(grant.expiresAt)}` : 'no expiry'}</small>
                </span>
                ${
                  (grant.status === 'ACTIVE' || grant.status === 'SUSPENDED') &&
                  (grant.source === 'COMPLIMENTARY' || grant.source === 'TRIAL')
                    ? `<button class="button-secondary" type="button" data-revoke-entitlement="${esc(grant.id)}" data-club-id="${esc(club.id)}">Revoke</button>`
                    : ''
                }
              </li>
            `,
          )
          .join('')
      : '<li><span>No active, scheduled, or historical grants in the current window.</span></li>'
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
        <p class="eyebrow">Owners & admins</p>
        <ul class="detail-owners">${owners}</ul>
      </section>
      <section class="detail-section">
        <p class="eyebrow">Plan override</p>
        <p class="muted-line">Effective tier: <strong>${esc(entitlements.tier)}</strong> · ${entitlements.usage.teams}/${entitlements.limits.teams} teams · ${entitlements.usage.players}/${entitlements.limits.players} player seats</p>
        <ul class="detail-owners">${grants}</ul>
        <div class="toolbar">
          <select class="text-input" id="grant-tier"><option value="PRO">Pro</option><option value="SCALE">Scale</option></select>
          <select class="text-input" id="grant-interval" aria-label="Plan definition term"><option value="TWELVE_MONTHS">12-month definition</option><option value="SIX_MONTHS">6-month definition</option></select>
          <input class="text-input" id="grant-expiry" type="date" aria-label="Grant expiry date" />
          <button class="pill" type="button" data-grant-entitlement="${esc(club.id)}">Grant complimentary access</button>
        </div>
        <p class="muted-line" id="grant-result">Every complimentary grant needs a review date and expiry.</p>
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
    } else
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
  await loadClubClaims()
  await loadClubDisputes()
  await Promise.all([loadInviteCampaigns(), loadJoinRequests(), loadContributionHealth()])
}

async function loadInviteCampaigns() {
  const tbody = document.querySelector('#invite-campaigns-table tbody')
  try {
    const campaigns = await adminFetch('/admin/invite-campaigns?suspiciousOnly=true')
    tbody.innerHTML = campaigns.length
      ? campaigns
          .map(
            (campaign) =>
              `<tr><td><strong>${esc(campaign.club?.name)}</strong><br><span class="muted-line">${esc(campaign.team?.displayName)}</span></td><td>${esc(campaign.createdBy?.name || campaign.createdBy?.email || 'Unknown')}</td><td>${campaign.useCount} / ${campaign.maxUses}</td><td>${fmtDate(campaign.expiresAt)}</td><td><button class="pill" type="button" data-campaign-revoke="${esc(campaign.id)}">Revoke</button></td></tr>`,
          )
          .join('')
      : '<tr><td colspan="5" class="placeholder">No suspicious active campaigns.</td></tr>'
  } catch (error) {
    setError(tbody, error)
  }
}

async function revokeInviteCampaign(campaignId) {
  const reason = window.prompt('Why is this campaign being revoked?')?.trim()
  if (!reason) return
  await adminFetch(`/admin/invite-campaigns/${encodeURIComponent(campaignId)}/revoke`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
  await loadInviteCampaigns()
}

async function loadJoinRequests() {
  const tbody = document.querySelector('#join-requests-table tbody')
  try {
    const requests = await adminFetch('/admin/join-requests?status=PENDING')
    tbody.innerHTML = requests.length
      ? requests
          .map(
            (request) =>
              `<tr><td>${esc(request.club?.name)}</td><td><strong>${esc(request.user?.name)}</strong><br><span class="muted-line">${esc(request.user?.email)}</span></td><td>${esc(request.role)}</td><td>${fmtDate(request.createdAt)}</td></tr>`,
          )
          .join('')
      : '<tr><td colspan="4" class="placeholder">No pending join requests.</td></tr>'
  } catch (error) {
    setError(tbody, error)
  }
}

async function loadContributionHealth() {
  const output = document.getElementById('contribution-health')
  try {
    const health = await adminFetch('/admin/contributions/health')
    const records = health.records.reduce((sum, row) => sum + row._count._all, 0)
    const failed = health.failedReminders.reduce((sum, row) => sum + row._count._all, 0)
    const imports = health.recentImports.reduce((sum, row) => sum + row._count._all, 0)
    output.textContent = `${records} issued records · ${failed} failed reminders · ${imports} bank imports in the last 30 days.`
  } catch (error) {
    output.textContent = error.message || String(error)
  }
}

async function loadClubClaims() {
  const tbody = document.querySelector('#club-claims-table tbody')
  tbody.innerHTML = '<tr><td colspan="5" class="placeholder">Loading...</td></tr>'
  try {
    const claims = await adminFetch('/admin/club-claims')
    if (!claims.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="placeholder">No administrator claims.</td></tr>'
      return
    }
    tbody.innerHTML = claims
      .map(
        (claim) => `
      <tr>
        <td><strong>${esc(claim.directoryEntry?.name || 'Unknown club')}</strong><br><span class="muted-line">${claim.platformEscalated ? 'Staff claim · escalated after 7 days' : 'First club claim'}</span></td>
        <td>${esc(claim.claimant?.name || 'Unknown')}<br><span class="muted-line">${esc(claim.claimant?.email || '')}</span></td>
        <td>${claim.externalTeamUrl ? `<strong>Official team page</strong><br><a href="${esc(claim.externalTeamUrl)}" target="_blank" rel="noopener noreferrer">${esc(claim.externalTeamUrl)}</a>${claim.evidence?.length ? '<br>' : ''}` : ''}${claim.evidence?.length ? claim.evidence.map((item) => `<strong>${esc(item.type.replaceAll('_', ' '))}</strong>${item.value ? `<br><span class="muted-line">${esc(item.value)}</span>` : ''}`).join('<br>') : claim.externalTeamUrl ? '' : 'No authority evidence'}</td>
        <td>${badge(claim.status)}</td>
        <td>${
          claim.status === 'SUBMITTED' || claim.status === 'NEEDS_INFO'
            ? `
          <div class="toolbar">
            <button class="pill" type="button" data-claim-id="${esc(claim.id)}" data-claim-decision="APPROVE">Approve</button>
            <button class="pill" type="button" data-claim-id="${esc(claim.id)}" data-claim-decision="NEEDS_INFO">Request info</button>
            <button class="pill" type="button" data-claim-id="${esc(claim.id)}" data-claim-decision="REJECT">Reject</button>
          </div>`
            : '-'
        }</td>
      </tr>`,
      )
      .join('')
  } catch (err) {
    setError(tbody, err)
  }
}

async function reviewClubClaim(claimId, decision) {
  const note =
    window.prompt(
      `${decision === 'APPROVE' ? 'Approval attestation — describe the authority source you verified' : decision === 'NEEDS_INFO' ? 'Information request' : 'Rejection'} note ${decision === 'NEEDS_INFO' || decision === 'APPROVE' ? '(required)' : '(optional)'}`,
    ) || undefined
  if ((decision === 'NEEDS_INFO' || decision === 'APPROVE') && !note) return
  await adminFetch(`/admin/club-claims/${encodeURIComponent(claimId)}/decision`, {
    method: 'POST',
    body: JSON.stringify({ decision, ...(note ? { note } : {}) }),
  })
  await loadClubClaims()
  if (decision === 'APPROVE') await loadClubs()
}

async function loadClubDisputes() {
  const tbody = document.querySelector('#club-disputes-table tbody')
  tbody.innerHTML = '<tr><td colspan="5" class="placeholder">Loading...</td></tr>'
  try {
    const disputes = await adminFetch('/admin/club-claims/disputes')
    if (!disputes.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="placeholder">No ownership disputes.</td></tr>'
      return
    }
    tbody.innerHTML = disputes
      .map((dispute) => {
        const candidates = (dispute.club?.memberships || [])
          .map(
            (membership) =>
              `${membership.user?.name || membership.user?.email || membership.userId} (${membership.role}: ${membership.userId})`,
          )
          .join(' · ')
        const candidateOptions = (dispute.club?.memberships || [])
          .map(
            (membership) =>
              `<option value="${esc(membership.userId)}">${esc(membership.user?.name || membership.user?.email || membership.userId)} · ${esc(membership.role)}</option>`,
          )
          .join('')
        return `<tr>
          <td><strong>${esc(dispute.club?.name || dispute.clubId)}</strong></td>
          <td>${esc(dispute.reason)}${candidates ? `<small>Owner candidates: ${esc(candidates)}</small>` : ''}</td>
          <td>${badge(dispute.status)}</td>
          <td>${fmtDate(dispute.createdAt)}</td>
          <td>${
            dispute.status === 'OPEN' || dispute.status === 'FROZEN'
              ? `<select data-dispute-owner="${esc(dispute.id)}" aria-label="New owner"><option value="">Keep current owner</option>${candidateOptions}</select><button class="pill" type="button" data-dispute-resolve="${esc(dispute.id)}">Resolve / reassign</button>`
              : '-'
          }</td>
        </tr>`
      })
      .join('')
  } catch (err) {
    setError(tbody, err)
  }
}

async function openClubDispute() {
  const clubId = window.prompt('Club ID')?.trim()
  if (!clubId) return
  const reason = window.prompt('Reason for the dispute')?.trim()
  if (!reason) return
  try {
    await adminFetch('/admin/club-claims/disputes', {
      method: 'POST',
      body: JSON.stringify({ clubId, reason, freezeOwnership: true }),
    })
    await loadClubDisputes()
  } catch (error) {
    window.alert(
      `Could not open dispute: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

async function resolveClubDispute(disputeId) {
  const resolution = window.prompt('Resolution note')?.trim()
  if (!resolution) return
  const newOwnerUserId = document
    .querySelector(`[data-dispute-owner="${CSS.escape(disputeId)}"]`)
    ?.value?.trim()
  try {
    await adminFetch(`/admin/club-claims/disputes/${encodeURIComponent(disputeId)}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ resolution, ...(newOwnerUserId ? { newOwnerUserId } : {}) }),
    })
    await loadClubDisputes()
  } catch (error) {
    window.alert(
      `Could not resolve dispute: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

async function grantClubEntitlement(clubId) {
  const tier = document.getElementById('grant-tier').value
  const interval = document.getElementById('grant-interval').value
  const expiry = document.getElementById('grant-expiry').value
  const output = document.getElementById('grant-result')
  if (!expiry) {
    output.textContent = 'Choose an expiry date before granting access.'
    return
  }
  try {
    await adminFetch(`/admin/clubs/${encodeURIComponent(clubId)}/entitlements`, {
      method: 'POST',
      body: JSON.stringify({
        tier,
        interval,
        source: 'COMPLIMENTARY',
        reason: 'Complimentary grant from platform admin',
        ...(expiry ? { expiresAt: new Date(`${expiry}T23:59:59Z`).toISOString() } : {}),
      }),
    })
    output.textContent = `${tier} access granted. Refreshing club entitlements…`
    await openClubDetail(clubId)
  } catch (err) {
    output.textContent = err.message || String(err)
  }
}

async function revokeClubEntitlement(grantId, clubId) {
  if (!grantId || !clubId) return
  if (
    !window.confirm(
      'Revoke this entitlement grant? The club will fall back to its next active plan.',
    )
  ) {
    return
  }
  try {
    await adminFetch(`/admin/entitlements/${encodeURIComponent(grantId)}`, {
      method: 'DELETE',
    })
    await openClubDetail(clubId)
  } catch (error) {
    window.alert(
      `Could not revoke entitlement: ${error instanceof Error ? error.message : String(error)}`,
    )
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
  document.getElementById('plan-form').addEventListener('submit', publishPlan)
}

async function loadSubscriptions() {
  const tbody = document.querySelector('#subs-table tbody')
  const status = document.getElementById('subs-status').value
  tbody.innerHTML = '<tr><td colspan="6" class="placeholder">Loading...</td></tr>'
  void loadPlans()
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

async function loadPlans() {
  const tbody = document.querySelector('#plans-table tbody')
  try {
    const rows = await adminFetch('/admin/plans')
    tbody.innerHTML = rows.length
      ? rows
          .map(
            (plan) => `
        <tr>
          <td><strong>${esc(plan.tier)}</strong></td>
          <td>${plan.interval === 'SIX_MONTHS' ? '6 months' : '12 months'}</td>
          <td>${fmtCents(plan.priceCents)}</td>
          <td>${plan.teamLimit} teams · ${plan.playerLimit} players</td>
          <td>v${plan.version}</td>
          <td>${plan.publishedAt ? badge('active') : badge('archived')}</td>
        </tr>`,
          )
          .join('')
      : '<tr><td colspan="6" class="placeholder">No plan versions.</td></tr>'
  } catch (err) {
    setError(tbody, err)
  }
}

async function publishPlan(event) {
  event.preventDefault()
  const feedback = document.getElementById('plan-feedback')
  const priceEuros = Number(document.getElementById('plan-price').value)
  const features = document
    .getElementById('plan-features')
    .value.split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  feedback.textContent = 'Publishing...'
  try {
    await adminFetch('/admin/plans', {
      method: 'POST',
      body: JSON.stringify({
        tier: document.getElementById('plan-tier').value,
        interval: document.getElementById('plan-interval').value,
        priceCents: Math.round(priceEuros * 100),
        currency: 'eur',
        teamLimit: Number(document.getElementById('plan-teams').value),
        playerLimit: Number(document.getElementById('plan-players').value),
        stripePriceId: document.getElementById('plan-stripe-price').value.trim() || null,
        features,
      }),
    })
    feedback.textContent = 'Plan version published.'
    await loadPlans()
  } catch (err) {
    feedback.textContent = err.message
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
              <span class="badge">${r.kind === 'direct' ? 'Direct message' : 'Channel'} · ${esc(r.message?.sender?.name || 'Unknown sender')}</span>
            </header>
            <p>${esc((r.evidenceContent ?? r.message?.content ?? '').slice(0, 280) || '(message unavailable)')}</p>
            <p class="mono">reported by ${esc(r.reporter?.email || r.reporterUserId)}  /  ${fmtDateTime(r.createdAt)}</p>
            <p>
              <button class="pill" data-report-resolve="${esc(r.id)}" data-action="dismiss">Dismiss</button>
              <button class="pill pill--dark" data-report-resolve="${esc(r.id)}" data-action="remove">Remove message</button>
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
            : action === 'remove'
              ? 'Why should this message be removed?'
              : 'Why should this message be removed?',
        )
        if (note === null) return
        try {
          await adminFetch(`/admin/moderation/reports/${id}/resolve`, {
            method: 'POST',
            body: JSON.stringify({
              resolution: note || (action === 'dismiss' ? 'dismissed' : 'removed'),
              action: action === 'remove' ? 'remove' : 'dismiss',
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
  document.getElementById('admin-username-display').value = getAdminUsername()
  sessionStatus.textContent = sessionToken
    ? `Signed in as ${sessionUser?.email || sessionUser?.name || 'platform admin'} for this browser session.`
    : 'No operator session.'

  const status = document.getElementById('admin-key-status')
  const stored = getApiKey()
  status.textContent = stored
    ? `Key saved (${stored.slice(0, 4)}...${stored.slice(-4)}).`
    : 'No key saved.'
  document.getElementById('admin-key-input').value = ''
  document.getElementById('api-base-input').value = getApiBase()
}

function bindLoginForm() {
  const form = document.getElementById('admin-login-form')
  const submitButton = document.getElementById('admin-login-submit')
  const usernameInput = document.getElementById('admin-login-username')
  const passwordInput = document.getElementById('admin-login-password')

  form.addEventListener('submit', async (evt) => {
    evt.preventDefault()
    const username = usernameInput.value.trim()
    const password = passwordInput.value
    const status = document.getElementById('admin-login-status')

    if (!username || !password) {
      status.textContent = 'Enter your username and password.'
      return
    }

    setAdminUsername(username)
    status.textContent = 'Signing in...'
    submitButton.disabled = true
    try {
      const result = await authFetch('/admin/auth/login', { username, password })
      if (!result?.token) {
        throw new Error('Sign-in failed: no session token received.')
      }
      setSessionToken(result.token)
      setSessionUser(result.user)
      renderAuthGate()
      renderSettings()
      updateAuthSummary()
      navigate()
    } catch (err) {
      setSessionToken('')
      setSessionUser(null)
      status.textContent = err.message
      renderAuthGate(err.message)
    } finally {
      submitButton.disabled = false
    }
  })
}

function bindSettings() {
  document.getElementById('admin-session-clear').addEventListener('click', () => {
    setSessionToken('')
    setSessionUser(null)
    setApiKey('')
    renderAuthGate('Signed out.')
    renderSettings()
    updateAuthSummary()
  })

  document.getElementById('admin-key-save').addEventListener('click', () => {
    const value = document.getElementById('admin-key-input').value.trim()
    if (!value) return
    setApiKey(value)
    renderSettings()
    updateAuthSummary()
    renderAuthGate()
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
    : 'Not authenticated. Use the admin login page or a break-glass ADMIN_API_KEY.'
}

// - Boot -

document.addEventListener('DOMContentLoaded', () => {
  bindLoginForm()
  bindMobileNavigation()
  bindClubs()
  bindUsers()
  bindSubs()
  bindAudit()
  bindSupport()
  bindBroadcast()
  bindFlags()
  bindModeration()
  bindReleases()
  bindSettings()

  // Surface auth status in the Overview lede.
  updateAuthSummary()

  if (!hasAdminCredentials()) {
    renderAuthGate()
    return
  }

  renderAuthGate()
  navigate()
})
