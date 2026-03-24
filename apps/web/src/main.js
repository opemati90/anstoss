const form = document.getElementById('invite-form')
const output = document.getElementById('invite-output')
const input = document.getElementById('invite-code')

async function previewInvite(code) {
  const response = await fetch(`/public/invites/${code}`)
  if (!response.ok) {
    throw new Error(`Invite lookup failed with ${response.status}`)
  }

  return response.json()
}

form.addEventListener('submit', async (event) => {
  event.preventDefault()

  const code = input.value.trim()
  if (!code) {
    output.textContent = 'Enter an invite code to preview the landing payload.'
    return
  }

  try {
    const invite = await previewInvite(code)
    output.textContent = JSON.stringify(invite, null, 2)
  } catch (error) {
    output.textContent = String(error)
  }
})
