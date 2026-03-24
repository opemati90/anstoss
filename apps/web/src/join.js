const params = new URLSearchParams(window.location.search)
const codeFromQuery = params.get('code')
const title = document.getElementById('join-title')
const body = document.getElementById('join-body')
const iosLink = document.getElementById('ios-link')
const androidLink = document.getElementById('android-link')

async function loadInvite(code) {
  const response = await fetch(`/public/invites/${code}`)
  if (!response.ok) {
    throw new Error(`Invite lookup failed with ${response.status}`)
  }

  return response.json()
}

if (codeFromQuery) {
  loadInvite(codeFromQuery)
    .then((invite) => {
      title.textContent = `Join ${invite.club.name}`
      body.textContent = `Invite ${invite.code} is valid until ${new Date(invite.expiresAt).toLocaleString()}.`
      iosLink.href = invite.installUrls.ios
      androidLink.href = invite.installUrls.android
      document.documentElement.style.setProperty('--accent', invite.club.primaryColor)
    })
    .catch((error) => {
      title.textContent = 'Invite unavailable'
      body.textContent = String(error)
    })
}
