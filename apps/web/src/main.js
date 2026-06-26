const inviteForm = document.getElementById('invite-form')
const inviteOutput = document.getElementById('invite-output')
const inviteInput = document.getElementById('invite-code')
const clubSummaryForm = document.getElementById('club-summary-form')
const clubIdInput = document.getElementById('club-id')
const clubSummaryOutput = document.getElementById('club-summary-output')

const params = new URLSearchParams(window.location.search)
if (params.get('clubId')) {
  clubIdInput.value = params.get('clubId')
}

async function requestJson(path, options) {
  const response = await fetch(path, options)
  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`)
  }

  return response.json()
}

async function previewInvite(code) {
  return requestJson(`/public/invites/${code}`)
}

async function loadClubSummary(clubId) {
  return requestJson(`/clubs/${clubId}/public/summary`)
}

function renderSummary(summary) {
  if (!summary.linkedTeam) {
    clubSummaryOutput.innerHTML = `
      <p class="placeholder-copy">
        No active external team-data link is available for this club yet.
      </p>
    `
    return
  }

  const tableRows = summary.table
    .slice(0, 6)
    .map(
      (row) => `
        <tr>
          <td>${row.place}</td>
          <td>${row.team}</td>
          <td>${row.games}</td>
          <td>${row.goal}</td>
          <td>${row.points}</td>
        </tr>
      `,
    )
    .join('')

  const form = summary.formStreak?.length
    ? summary.formStreak.join(' · ')
    : 'No recent finished matches'

  clubSummaryOutput.innerHTML = `
    <div class="summary-grid">
      <article class="summary-card">
        <p class="mono">Linked Team</p>
        <h3>${summary.linkedTeam.label}</h3>
        <p>${summary.widgetUrl || 'No public widget URL captured yet.'}</p>
      </article>
      <article class="summary-card">
        <p class="mono">Next Match</p>
        <h3>${summary.nextMatch ? `${summary.nextMatch.homeTeam} vs ${summary.nextMatch.awayTeam}` : 'No upcoming match'}</h3>
        <p>${summary.nextMatch ? [summary.nextMatch.venueName, summary.nextMatch.pitchAddress].filter(Boolean).join(' · ') || 'Venue missing on source' : 'Waiting for synced fixtures'}</p>
      </article>
      <article class="summary-card">
        <p class="mono">Last Result</p>
        <h3>${summary.lastResult && summary.lastResult.resultHome !== null && summary.lastResult.resultAway !== null ? `${summary.lastResult.homeTeam} ${summary.lastResult.resultHome}:${summary.lastResult.resultAway} ${summary.lastResult.awayTeam}` : 'No final result yet'}</h3>
        <p>Form: ${form}</p>
      </article>
    </div>
    <div class="table-shell">
      <div class="panel-head compact">
        <h3>Table Snapshot</h3>
        <span class="mono">${summary.updatedAt ? `Updated ${new Date(summary.updatedAt).toLocaleString()}` : 'Not synced yet'}</span>
      </div>
      ${
        tableRows
          ? `<table class="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Team</th>
                  <th>GP</th>
                  <th>Goals</th>
                  <th>Pts</th>
                </tr>
              </thead>
              <tbody>${tableRows}</tbody>
            </table>`
          : '<p class="placeholder-copy">No table snapshot was available in the latest sync.</p>'
      }
    </div>
  `
}

inviteForm.addEventListener('submit', async (event) => {
  event.preventDefault()

  const code = inviteInput.value.trim()
  if (!code) {
    inviteOutput.textContent = 'Enter an invite code to preview the landing payload.'
    return
  }

  try {
    const invite = await previewInvite(code)
    inviteOutput.textContent = JSON.stringify(invite, null, 2)
  } catch (error) {
    inviteOutput.textContent = String(error)
  }
})

clubSummaryForm.addEventListener('submit', async (event) => {
  event.preventDefault()

  const clubId = clubIdInput.value.trim()
  if (!clubId) {
    clubSummaryOutput.innerHTML = '<p class="placeholder-copy">Enter a club ID first.</p>'
    return
  }

  clubSummaryOutput.innerHTML = '<p class="placeholder-copy">Loading summary ...</p>'

  try {
    const summary = await loadClubSummary(clubId)
    renderSummary(summary)
  } catch (error) {
    clubSummaryOutput.innerHTML = `<p class="placeholder-copy">${String(error)}</p>`
  }
})

if (clubIdInput.value.trim()) {
  clubSummaryForm.dispatchEvent(new Event('submit'))
}
