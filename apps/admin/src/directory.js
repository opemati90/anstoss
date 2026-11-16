/* Shared, server-filtered admin directories. No account data is stored locally. */
function createAdminDirectory(root, kind, fetchAdmin) {
  const escape = (value) =>
    String(value ?? '').replace(
      /[&<>"']/g,
      (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
    )
  const people = kind === 'users' || kind === 'players'
  const title = { users: 'accounts', players: 'players', teams: 'teams', clubs: 'clubs' }[kind]
  const roles = {
    all: 'All roles',
    player: 'Players',
    coach: 'Coaches',
    club_admin: 'Club admins',
    free_agent: 'Free agents',
    platform_admin: 'Platform staff',
  }
  const roleNames = {
    PLAYER: 'Player',
    COACH: 'Coach',
    HEAD_COACH: 'Head coach',
    ASSISTANT_COACH: 'Assistant coach',
    OWNER: 'Club owner',
    ADMIN: 'Club admin',
    PARENT: 'Parent',
    FREE_AGENT: 'Free agent',
    CLUB_ADMIN: 'Club admin',
  }
  const defaults = {
    search: '',
    state: 'all',
    role: 'all',
    clubId: '',
    clubName: '',
    teamId: '',
    teamName: '',
    limit: 25,
    offset: 0,
  }
  let state = { ...defaults }
  let request = 0
  let timer
  const lookupVersions = { club: 0, team: 0 }
  const lookupTimers = {}
  const options = (values) =>
    Object.entries(values)
      .map(([value, label]) => `<option value="${escape(value)}">${escape(label)}</option>`)
      .join('')
  const lookup = (scope) =>
    `<fieldset class="directory-lookup" data-lookup="${scope}"><legend>${scope === 'club' ? 'Club' : 'Team'}</legend><div class="directory-selection" data-selection="${scope}"></div><label class="directory-lookup-label"><span>Find ${scope === 'club' ? 'a club' : 'a team'}</span><input class="text-input" type="search" data-find="${scope}" maxlength="120" autocomplete="off" placeholder="Type a name…" /></label><div class="directory-matches" data-matches="${scope}" aria-live="polite"></div></fieldset>`
  root.innerHTML = `<p data-scope class="muted-line"></p><form class="directory-filters" aria-label="Filter ${title}">
    <label class="directory-search"><span>Search ${title}</span><input class="text-input" name="search" type="search" maxlength="120" placeholder="${people ? 'Name or email' : kind === 'clubs' ? 'Name, slug or city' : 'Name or league'}" /></label>
    <label><span>${people ? 'Account state' : kind === 'clubs' ? 'Teams' : 'Membership'}</span><select class="text-input" name="state">${options(people ? { all: 'All states', active: 'Active', deleted: 'Deleted' } : { all: 'All', populated: kind === 'clubs' ? 'With teams' : 'With active members', empty: kind === 'clubs' ? 'No teams' : 'No active members' })}</select></label>
    ${kind === 'users' ? `<label><span>Role</span><select class="text-input" name="role">${options(roles)}</select></label>` : ''}
    ${kind !== 'clubs' ? lookup('club') : ''}${people ? lookup('team') : ''}
    <div class="directory-actions"><button class="pill" type="submit">Refresh results</button><button class="pill" type="button" data-reset>Clear filters</button></div>
  </form>
  <div class="directory-results-head"><p data-count role="status" aria-live="polite"></p><label>Rows per page <select class="text-input" data-size>${options({ 25: '25', 50: '50', 100: '100' })}</select></label></div>
  <p class="directory-scroll-hint">Scroll the table sideways to see all columns.</p>
  <div class="table-wrap" tabindex="0" role="region" aria-label="${title} results"><table class="data-table"><caption class="directory-caption">${title[0].toUpperCase() + title.slice(1)} matching your filters</caption><thead></thead><tbody></tbody></table></div>
  <div class="directory-pagination" aria-label="Pagination"><button class="pill" type="button" data-prev>Previous</button><span data-page></span><button class="pill" type="button" data-next>Next</button></div>`
  const form = root.querySelector('form')
  const tbody = root.querySelector('tbody')
  const count = root.querySelector('[data-count]')
  const prev = root.querySelector('[data-prev]')
  const next = root.querySelector('[data-next]')
  const columns = people
    ? ['Name & email', 'Roles', 'Clubs', 'Teams', 'Created', 'State']
    : kind === 'clubs'
      ? ['Club', 'City', 'Members', 'Teams', 'Created', 'Explore']
      : ['Team', 'Club', 'Active members', 'Created', 'Explore']
  root.querySelector('thead').innerHTML =
    `<tr>${columns.map((label) => `<th scope="col">${label}</th>`).join('')}</tr>`
  const link = (target, params, label) =>
    `<a class="table-link" href="#/${target}?${escape(new URLSearchParams(params).toString())}">${escape(label)}</a>`
  const date = (value) => new Intl.DateTimeFormat('de-DE').format(new Date(value))
  const clubs = (user) =>
    user.memberships
      .map(({ club }) => link('clubs', { clubId: club.id, clubName: club.name }, club.name))
      .join('<br>') || 'No club'
  const teams = (user) =>
    user.teamAccess
      .map(({ team }) =>
        link('players', { teamId: team.id, teamName: team.displayName }, team.displayName),
      )
      .join('<br>') || 'No active team'
  const more = (total, shown) =>
    total > shown ? `<span class="muted-line">${total - shown} more (across platform)</span>` : ''
  function row(item) {
    if (kind === 'clubs')
      return `<tr><td><button class="table-link" type="button" data-club-detail="${escape(item.id)}">${escape(item.name)}</button><span class="muted-line">${escape(item.slug)}</span></td><td>${escape(item.city) || '—'}</td><td>${item._count.memberships}</td><td>${item._count.teams}</td><td>${date(item.createdAt)}</td><td class="directory-row-actions">${link('teams', { clubId: item.id, clubName: item.name }, 'Teams')}${link('players', { clubId: item.id, clubName: item.name }, 'Players')}</td></tr>`
    if (kind === 'teams')
      return `<tr><td><strong>${escape(item.displayName)}</strong><span class="muted-line">${escape([item.ageGroup, item.leagueName].filter(Boolean).join(' · '))}</span></td><td>${link('clubs', { clubId: item.club.id, clubName: item.club.name }, item.club.name)}</td><td>${item._count.access}</td><td>${date(item.createdAt)}</td><td>${link('players', { clubId: item.club.id, clubName: item.club.name, teamId: item.id, teamName: item.displayName }, 'Players')}</td></tr>`
    const activeRoles = [
      ...item.memberships.map((m) => m.role),
      ...item.teamAccess.map((a) => a.role),
    ]
    const labels =
      item.platformRole === 'PLATFORM_ADMIN'
        ? ['Platform admin']
        : [
            ...new Set(
              (activeRoles.length ? activeRoles : [item.registrationRole]).map(
                (role) => roleNames[role] || role,
              ),
            ),
          ]
    if (item.registrationRole === 'FREE_AGENT') {
      if (!labels.includes('Free agent')) labels.push('Free agent')
      const recruitmentRole = roleNames[item.freeAgentProfile?.recruitmentRole]
      if (recruitmentRole && !labels.includes(recruitmentRole)) labels.push(recruitmentRole)
    }
    return `<tr><td><strong>${escape(item.name || 'Unnamed account')}</strong><span class="muted-line">${escape(item.email || 'No email')}</span></td><td>${labels.map(escape).join('<br>')}</td><td>${clubs(item)}${more(item._count.memberships, item.memberships.length)}</td><td>${teams(item)}${more(item._count.teamAccess, item.teamAccess.length)}</td><td>${date(item.createdAt)}</td><td><span class="badge ${item.deletedAt ? 'badge--deleted' : 'badge--active'}">${item.deletedAt ? 'Deleted' : 'Active'}</span></td></tr>`
  }
  function sync() {
    root.querySelector('[data-scope]').textContent =
      kind === 'clubs' && state.clubId
        ? `Selected club: ${state.clubName || state.clubId}. Clear filters to see all clubs.`
        : ''
    form.elements.search.value = state.search
    form.elements.state.value = state.state
    if (form.elements.role) form.elements.role.value = state.role
    root.querySelector('[data-size]').value = state.limit
    for (const scope of ['club', 'team']) {
      const selection = root.querySelector(`[data-selection="${scope}"]`)
      if (!selection) continue
      selection.innerHTML = state[`${scope}Id`]
        ? `<span>${escape(state[`${scope}Name`] || `Selected ${scope}`)}</span><button class="table-link" type="button" data-clear="${scope}">Clear ${scope}</button>`
        : `<span class="muted-line">All ${scope}s</span>`
    }
    form.querySelector('[data-reset]').disabled = Object.keys(defaults).every(
      (key) => state[key] === defaults[key],
    )
  }
  function writeRoute() {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(state))
      if (value !== defaults[key] && value !== '') query.set(key, value)
    history.replaceState(null, '', `#/${kind}${query.size ? `?${query}` : ''}`)
  }
  async function load() {
    const id = ++request
    root.querySelector('.table-wrap').setAttribute('aria-busy', 'true')
    prev.disabled = next.disabled = true
    count.textContent = `Loading ${title}…`
    tbody.innerHTML = `<tr><td colspan="${columns.length}" class="placeholder">Loading matching ${title}…</td></tr>`
    root.querySelector('[data-page]').textContent = ''
    try {
      const query = new URLSearchParams({
        kind,
        search: state.search,
        state: state.state,
        role: state.role,
        limit: state.limit,
        offset: state.offset,
      })
      for (const key of ['clubId', 'teamId']) if (state[key]) query.set(key, state[key])
      const result = await fetchAdmin(`/admin/directory?${query}`)
      if (id !== request) return
      if (result.total > 0 && state.offset >= result.total) {
        state.offset = Math.floor((result.total - 1) / state.limit) * state.limit
        writeRoute()
        return load()
      }
      count.textContent = `${result.total.toLocaleString()} ${result.total === 1 ? title.slice(0, -1) : title} found`
      tbody.innerHTML = result.rows.length
        ? result.rows.map(row).join('')
        : `<tr><td colspan="${columns.length}" class="placeholder">No ${title} match these filters. Try another search or clear the filters.</td></tr>`
      prev.disabled = state.offset === 0
      next.disabled = state.offset + state.limit >= result.total
      root.querySelector('[data-page]').textContent = result.total
        ? `${state.offset + 1}–${state.offset + result.rows.length} of ${result.total.toLocaleString()}`
        : '0 results'
    } catch (error) {
      if (id !== request) return
      count.textContent = `Could not load ${title}.`
      tbody.innerHTML = `<tr><td colspan="${columns.length}" class="placeholder">${escape(error.message || 'Request failed')}. Use Refresh results to try again.</td></tr>`
    } finally {
      if (id === request) root.querySelector('.table-wrap').setAttribute('aria-busy', 'false')
    }
  }
  function change(resetPage = true) {
    clearTimeout(timer)
    if (location.hash.replace(/^#\/?/, '').split('?')[0] !== kind) return
    if (resetPage) state.offset = 0
    sync()
    writeRoute()
    return load()
  }
  window.addEventListener('hashchange', () => {
    clearTimeout(timer)
    clearLookup('club')
    clearLookup('team')
  })
  function clearLookup(scope) {
    clearTimeout(lookupTimers[scope])
    ++lookupVersions[scope]
    const input = root.querySelector(`[data-find="${scope}"]`)
    if (input) input.value = ''
    const matches = root.querySelector(`[data-matches="${scope}"]`)
    if (matches) matches.replaceChildren()
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    void change()
  })
  form.elements.search.addEventListener('input', () => {
    state.search = form.elements.search.value
    ++request // An older response must not repaint while the new search is debouncing.
    prev.disabled = next.disabled = true
    clearTimeout(timer)
    timer = setTimeout(() => void change(), 300)
  })
  for (const name of ['state', 'role'])
    form.elements[name]?.addEventListener('change', () => {
      state[name] = form.elements[name].value
      void change()
    })
  root.querySelector('[data-size]').addEventListener('change', (event) => {
    state.limit = Number(event.target.value)
    void change()
  })
  prev.addEventListener('click', () => {
    state.offset = Math.max(0, state.offset - state.limit)
    void change(false)
  })
  next.addEventListener('click', () => {
    state.offset += state.limit
    void change(false)
  })
  form.addEventListener('click', (event) => {
    if (event.target.closest('[data-reset]')) {
      state = { ...defaults }
      clearLookup('club')
      clearLookup('team')
      void change()
    }
    const clear = event.target.closest('[data-clear]')
    if (clear) {
      const scope = clear.dataset.clear
      state[`${scope}Id`] = state[`${scope}Name`] = ''
      clearLookup(scope)
      if (scope === 'club') {
        state.teamId = state.teamName = ''
        clearLookup('team')
      }
      void change()
    }
  })
  for (const scope of ['club', 'team']) {
    const input = root.querySelector(`[data-find="${scope}"]`)
    if (!input) continue
    input.addEventListener('input', () => {
      clearTimeout(lookupTimers[scope])
      const version = ++lookupVersions[scope]
      const matches = root.querySelector(`[data-matches="${scope}"]`)
      const search = input.value.trim()
      matches.replaceChildren()
      if (!search) return
      matches.textContent = 'Searching…'
      lookupTimers[scope] = setTimeout(async () => {
        try {
          const query = new URLSearchParams({ kind: `${scope}s`, search, limit: 10 })
          if (scope === 'team' && state.clubId) query.set('clubId', state.clubId)
          const result = await fetchAdmin(`/admin/directory?${query}`)
          if (lookupVersions[scope] !== version) return
          matches.replaceChildren()
          for (const item of result.rows) {
            const button = document.createElement('button')
            button.type = 'button'
            button.className = 'directory-match'
            const name = item.displayName || item.name
            button.textContent =
              scope === 'team'
                ? `${name} · ${item.club.name}`
                : `${name}${item.city ? ` · ${item.city}` : ''}`
            button.addEventListener('click', () => {
              state[`${scope}Id`] = item.id
              state[`${scope}Name`] = name
              clearLookup(scope)
              if (scope === 'club') {
                state.teamId = state.teamName = ''
                clearLookup('team')
              }
              void change()
              input.focus()
            })
            matches.append(button)
          }
          const hint = document.createElement('p')
          hint.className = 'muted-line'
          hint.textContent =
            result.total > 10
              ? 'Showing 10 matches. Keep typing to narrow the list.'
              : result.total === 0
                ? 'No matches. Try another name.'
                : ''
          matches.append(hint)
        } catch {
          if (lookupVersions[scope] === version)
            matches.textContent = 'Search unavailable. Edit the name to retry.'
        }
      }, 300)
    })
  }
  return {
    loadRoute() {
      clearTimeout(timer)
      clearLookup('club')
      clearLookup('team')
      const query = new URLSearchParams(location.hash.split('?')[1] || '')
      state = { ...defaults }
      for (const key of ['search', 'clubId', 'clubName', 'teamId', 'teamName'])
        state[key] = (query.get(key) || '').slice(0, 120)
      const validStates = people ? ['all', 'active', 'deleted'] : ['all', 'populated', 'empty']
      if (validStates.includes(query.get('state'))) state.state = query.get('state')
      if (kind === 'users' && Object.hasOwn(roles, query.get('role')))
        state.role = query.get('role')
      if ([25, 50, 100].includes(Number(query.get('limit'))))
        state.limit = Number(query.get('limit'))
      const offset = Number(query.get('offset'))
      if (Number.isInteger(offset) && offset >= 0 && offset <= 1000000) state.offset = offset
      sync()
      return load()
    },
  }
}
