const dashboardEl = document.getElementById('dashboard')
const clubsEl = document.getElementById('clubs')
const teamLinksEl = document.getElementById('team-links')
const syncRunsEl = document.getElementById('sync-runs')
const supportForm = document.getElementById('support-form')
const supportOutput = document.getElementById('support-output')

async function requestJson(path, options) {
  const response = await fetch(path, options)
  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`)
  }

  return response.json()
}

async function loadDashboard() {
  try {
    const data = await requestJson('/admin/dashboard')
    dashboardEl.innerHTML = Object.entries(data)
      .map(
        ([label, value]) => `
          <div class="metric">
            <span>${label.replace(/([A-Z])/g, ' $1')}</span>
            <strong>${value}</strong>
          </div>
        `,
      )
      .join('')
  } catch {
    dashboardEl.innerHTML = '<div class="metric"><span>Status</span><strong>Unavailable</strong></div>'
  }
}

async function loadClubs() {
  try {
    const clubs = await requestJson('/admin/clubs')
    clubsEl.innerHTML = clubs
      .map(
        (club) => `
          <article class="list-card">
            <header>
              <div>
                <h3>${club.name}</h3>
                <p><code>${club.id}</code></p>
              </div>
              <span class="pill">${club.slug}</span>
            </header>
            <p>Members: ${club.counts.memberships} · Teams: ${club.counts.teams} · Events: ${club.counts.events}</p>
            <p>Invites: ${club.counts.invites} · Primary: ${club.primaryColor}</p>
          </article>
        `,
      )
      .join('')
  } catch {
    clubsEl.innerHTML = '<p class="placeholder">Club data is unavailable. Authenticate against the API to load live data.</p>'
  }
}

async function loadTeamLinks() {
  try {
    const links = await requestJson('/admin/fussball/team-links')
    teamLinksEl.innerHTML = links
      .map(
        (link) => `
          <article class="list-card">
            <header>
              <div>
                <h3>${link.label}</h3>
                <p>${link.club.name} · ${link.team.displayName}</p>
              </div>
              <span class="pill">${link.status}</span>
            </header>
            <p><code>${link.externalTeamId}</code></p>
            <p>Fixtures: ${link.counts.fixtures} · Sync runs: ${link.counts.syncRuns}</p>
            <p>Last synced: ${link.lastSyncedAt ? new Date(link.lastSyncedAt).toLocaleString() : 'Never'}</p>
          </article>
        `,
      )
      .join('')
  } catch {
    teamLinksEl.innerHTML = '<p class="placeholder">Team link data is unavailable.</p>'
  }
}

async function loadSyncRuns() {
  try {
    const runs = await requestJson('/admin/fussball/sync-runs')
    syncRunsEl.innerHTML = runs
      .map(
        (run) => `
          <article class="list-card">
            <header>
              <div>
                <h3>${run.teamLink.label}</h3>
                <p>${run.teamLink.club.name} · ${run.teamLink.team.displayName}</p>
              </div>
              <span class="pill">${run.status}</span>
            </header>
            <p>Imported: ${run.importedCount} · Updated: ${run.updatedCount} · Skipped: ${run.skippedCount}</p>
            <p>Started: ${new Date(run.startedAt).toLocaleString()}</p>
            <p>${run.errorSummary || 'No error summary recorded.'}</p>
          </article>
        `,
      )
      .join('')
  } catch {
    syncRunsEl.innerHTML = '<p class="placeholder">Sync run data is unavailable.</p>'
  }
}

supportForm.addEventListener('submit', async (event) => {
  event.preventDefault()

  const formData = new FormData(supportForm)
  const payload = Object.fromEntries(formData.entries())
  if (!payload.note) {
    delete payload.note
  }

  try {
    const result = await requestJson('/admin/support-actions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    supportOutput.textContent = JSON.stringify(result, null, 2)
  } catch (error) {
    supportOutput.textContent = String(error)
  }
})

document.getElementById('refresh-dashboard').addEventListener('click', loadDashboard)
document.getElementById('refresh-clubs').addEventListener('click', loadClubs)
document.getElementById('refresh-links').addEventListener('click', loadTeamLinks)
document.getElementById('refresh-sync-runs').addEventListener('click', loadSyncRuns)

loadDashboard()
loadClubs()
loadTeamLinks()
loadSyncRuns()
