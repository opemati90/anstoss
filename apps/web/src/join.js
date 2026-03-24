const params = new URLSearchParams(window.location.search)
const title = document.getElementById('join-title')
const body = document.getElementById('join-body')
const eyebrow = document.getElementById('join-eyebrow')
const hint = document.getElementById('join-hint')
const openAppLink = document.getElementById('open-app-link')
const iosLink = document.getElementById('ios-link')
const androidLink = document.getElementById('android-link')
const kindChip = document.getElementById('kind-chip')
const statusChip = document.getElementById('status-chip')
const clubBadge = document.getElementById('club-badge')
const clubBadgeFallback = document.getElementById('club-badge-fallback')
const clubName = document.getElementById('club-name')
const teamName = document.getElementById('team-name')
const groupName = document.getElementById('group-name')
const roleName = document.getElementById('role-name')
const phaseName = document.getElementById('phase-name')
const expiresAt = document.getElementById('expires-at')
const journeyAuthCopy = document.getElementById('journey-auth-copy')
const journeyRedeemCopy = document.getElementById('journey-redeem-copy')

const roleLabels = {
  HEAD_COACH: 'Cheftrainer',
  ASSISTANT_COACH: 'Co-Trainer',
  PLAYER: 'Spieler',
  PARENT: 'Elternteil',
}

const statusLabels = {
  PENDING: 'Bereit',
  SENT: 'Versendet',
  ACCEPTED: 'Bereits eingelöst',
  EXPIRED: 'Abgelaufen',
  REVOKED: 'Zurückgezogen',
}

const kindLabels = {
  MEMBER_INVITE: 'Teamzugang',
  PARENT_APPROVAL: 'Elterliche Freigabe',
}

const phaseLabels = {
  FULL: 'Voller Zugang',
  TRIAL: 'Probetraining',
}

function extractInviteCode() {
  const codeFromQuery = params.get('code')
  if (codeFromQuery) {
    return codeFromQuery.trim().toUpperCase()
  }

  const segments = window.location.pathname
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)

  const lastSegment = segments.at(-1)
  if (!lastSegment) {
    return null
  }

  const normalizedLastSegment = lastSegment.replace(/\.html$/i, '')
  if (
    normalizedLastSegment.toLowerCase() === 'join' ||
    normalizedLastSegment.toLowerCase() === 'index'
  ) {
    return null
  }

  return normalizedLastSegment.toUpperCase()
}

async function loadInvite(code) {
  const response = await fetch(`/public/invites/${code}`)
  if (!response.ok) {
    throw new Error(`Invite lookup failed with ${response.status}`)
  }

  return response.json()
}

function formatDate(value) {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value))
}

function buildAppLink(code) {
  return `anstoss://join/${encodeURIComponent(code)}`
}

function getPlatform() {
  const ua = navigator.userAgent.toLowerCase()
  if (/iphone|ipad|ipod/.test(ua)) return 'ios'
  if (/android/.test(ua)) return 'android'
  return 'desktop'
}

function installFallbackHref(invite) {
  const platform = getPlatform()
  if (platform === 'ios') return invite.installUrls.ios
  if (platform === 'android') return invite.installUrls.android
  return null
}

function wireOpenAppFallback(invite) {
  const fallbackHref = installFallbackHref(invite)

  openAppLink.addEventListener('click', () => {
    if (!fallbackHref) return

    const fallbackTimer = window.setTimeout(() => {
      window.location.href = fallbackHref
    }, 1300)

    const clearFallback = () => window.clearTimeout(fallbackTimer)
    window.addEventListener('pagehide', clearFallback, { once: true })
    window.addEventListener('blur', clearFallback, { once: true })
  })
}

function setInviteMeta(invite) {
  clubName.textContent = invite.club.name
  teamName.textContent = invite.team.displayName
  groupName.textContent = invite.team.group.displayName
  roleName.textContent = roleLabels[invite.role] || invite.role
  phaseName.textContent = phaseLabels[invite.phase] || invite.phase
  expiresAt.textContent = formatDate(invite.expiresAt)

  if (invite.club.badgeUrl) {
    clubBadge.src = invite.club.badgeUrl
    clubBadge.alt = `${invite.club.name} Wappen`
    clubBadge.hidden = false
    clubBadgeFallback.hidden = true
  } else {
    clubBadge.hidden = true
    clubBadgeFallback.hidden = false
    clubBadgeFallback.textContent = invite.club.name
      .split(/\s+/)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()
  }
}

function setInviteNarrative(invite) {
  eyebrow.textContent =
    invite.kind === 'PARENT_APPROVAL'
      ? 'Elterliche Freigabe'
      : invite.phase === 'TRIAL'
        ? 'Probetraining'
        : 'Anstoss Einladung'

  title.textContent =
    invite.kind === 'PARENT_APPROVAL'
      ? `Bestätigung für ${invite.team.displayName}`
      : `${invite.club.name} lädt dich zu ${invite.team.displayName} ein`

  if (invite.kind === 'PARENT_APPROVAL') {
    body.textContent = invite.childName
      ? `${invite.childName} möchte diesem Team beitreten. Die Freigabe erfolgt direkt in der App.`
      : 'Diese Einladung öffnet die elterliche Bestätigung direkt in der App.'
    journeyAuthCopy.textContent =
      'Melde dich mit der E-Mail-Adresse an, an die die Freigabe geschickt wurde.'
    journeyRedeemCopy.textContent =
      'Öffne die Anfrage in Anstoss und bestätige den Zugriff für das Kind.'
    hint.textContent =
      'Die Bestätigung wird in Anstoss abgeschlossen. Dort siehst du auch, für welches Team die Freigabe gilt.'
    return
  }

  if (invite.phase === 'TRIAL') {
    body.textContent =
      'Diese Einladung richtet ein zeitlich begrenztes Probetraining ein. Nach der Anmeldung kann der Zugang direkt im Team geprüft werden.'
    journeyRedeemCopy.textContent =
      'Bestätige den Zugang in der App. Das Team sieht anschließend, dass es sich um ein Probetraining handelt.'
  } else {
    body.textContent =
      'Die Einladung führt direkt in den passenden Vereinsbereich. Mannschaft, Rolle und Zugangsart sind bereits vorbereitet.'
    journeyRedeemCopy.textContent =
      'Bestätige den Zugang in der App, damit die Einladung direkt dem richtigen Team zugeordnet wird.'
  }

  if (invite.role === 'PLAYER') {
    journeyAuthCopy.textContent =
      'Melde dich mit deiner E-Mail-Adresse an. Für Spieler unter 16 Jahren wird danach bei Bedarf die Zustimmung eines Elternteils abgefragt.'
  } else if (invite.role === 'PARENT') {
    journeyAuthCopy.textContent =
      'Melde dich mit deiner E-Mail-Adresse an. Danach wird der Elternzugang direkt mit dem Team verknüpft.'
  }
}

function setInviteStatus(invite) {
  kindChip.textContent = kindLabels[invite.kind] || invite.kind
  statusChip.textContent = statusLabels[invite.status] || invite.status

  if (invite.status === 'ACCEPTED') {
    statusChip.classList.add('success')
    openAppLink.textContent = 'Anstoss öffnen'
    hint.textContent =
      'Diese Einladung wurde bereits verwendet. Wenn du schon Teil des Teams bist, öffne einfach Anstoss direkt.'
  } else if (invite.status === 'EXPIRED' || invite.status === 'REVOKED') {
    statusChip.classList.add('warning')
    openAppLink.classList.add('disabled')
    openAppLink.setAttribute('aria-disabled', 'true')
    openAppLink.addEventListener('click', (event) => event.preventDefault())
    hint.textContent =
      'Die Einladung ist nicht mehr aktiv. Bitte wende dich an den Verein, falls du einen neuen Link brauchst.'
  }
}

function renderInvite(invite, code) {
  document.title = `${invite.club.name} · Einladung · Anstoss`
  document.documentElement.style.setProperty('--accent', invite.club.primaryColor)
  document.documentElement.style.setProperty(
    '--accent-soft',
    `${invite.club.primaryColor}12`,
  )

  setInviteMeta(invite)
  setInviteNarrative(invite)
  setInviteStatus(invite)

  openAppLink.href = buildAppLink(code)
  iosLink.href = invite.installUrls.ios
  androidLink.href = invite.installUrls.android

  if (invite.status !== 'EXPIRED' && invite.status !== 'REVOKED') {
    wireOpenAppFallback(invite)
  }
}

function renderError(error) {
  eyebrow.textContent = 'Einladung'
  title.textContent = 'Einladung nicht verfügbar'
  body.textContent =
    error instanceof Error
      ? error.message
      : 'Die Einladung konnte gerade nicht geladen werden.'
  kindChip.textContent = 'Nicht verfügbar'
  statusChip.textContent = 'Bitte erneut versuchen'
  statusChip.classList.add('warning')
  openAppLink.textContent = 'Anstoss laden'
  openAppLink.href = '#'
  openAppLink.classList.add('disabled')
  iosLink.href = 'https://apps.apple.com/app/anstoss/id0000000000'
  androidLink.href =
    'https://play.google.com/store/apps/details?id=app.anstoss.mobile'
}

const inviteCode = extractInviteCode()

if (!inviteCode) {
  renderError(new Error('Dieser Link enthält keinen gültigen Einladungscode.'))
} else {
  loadInvite(inviteCode)
    .then((invite) => renderInvite(invite, inviteCode))
    .catch((error) => renderError(error))
}
