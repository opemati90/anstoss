const dashboardEl = document.getElementById('dashboard')
const clubsEl = document.getElementById('clubs')
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
  } catch (error) {
    dashboardEl.innerHTML = `<div class="metric"><span>Status</span><strong>Unavailable</strong></div>`
  }
}

async function loadClubs() {
  try {
    const clubs = await requestJson('/admin/clubs')
    clubsEl.innerHTML = clubs
      .map(
        (club) => `
          <article class="club-card">
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
  } catch (error) {
    clubsEl.innerHTML = '<p>Club data is unavailable. Authenticate against the API to load live data.</p>'
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

loadDashboard()
loadClubs()
