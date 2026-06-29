(() => {
  const STORAGE_KEY = 'anstoss.cookieConsent'
  const COOKIE_NAME = 'anstoss_cookie_consent'
  const COOKIE_MAX_AGE = 60 * 60 * 24 * 180

  const copy = {
    de: {
      title: 'Cookies auf anstoss.io',
      body:
        'Wir nutzen keine Tracking- oder Werbe-Cookies. Wenn du zustimmst, speichern wir nur deine Cookie-Auswahl. Bei Ablehnung setzen wir keine optionalen Cookies.',
      accept: 'Akzeptieren',
      reject: 'Ablehnen',
      learn: 'Mehr erfahren',
      label: 'Cookie-Einstellungen',
    },
    en: {
      title: 'Cookies on anstoss.io',
      body:
        'We do not use tracking or advertising cookies. If you accept, we only store your cookie choice. If you reject, we do not set optional cookies.',
      accept: 'Accept',
      reject: 'Reject',
      learn: 'Learn more',
      label: 'Cookie settings',
    },
  }

  function storageGet() {
    try {
      return window.localStorage.getItem(STORAGE_KEY)
    } catch {
      return null
    }
  }

  function storageSet(value) {
    try {
      window.localStorage.setItem(STORAGE_KEY, value)
    } catch {
      // Ignore storage failures. The banner can reappear if storage is blocked.
    }
  }

  function storageRemove() {
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Ignore storage failures.
    }
  }

  function setConsentCookie(value) {
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${COOKIE_NAME}=v1:${value}; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure}`
  }

  function deleteConsentCookie() {
    document.cookie = `${COOKIE_NAME}=; Max-Age=0; Path=/; SameSite=Lax`
  }

  function getLanguage() {
    const lang = document.documentElement.getAttribute('lang') || navigator.language || 'de'
    return lang.toLowerCase().startsWith('en') ? 'en' : 'de'
  }

  function getChoice() {
    const choice = storageGet()
    return choice === 'accepted' || choice === 'rejected' ? choice : null
  }

  function closeBanner(banner) {
    banner.classList.remove('is-visible')
    window.setTimeout(() => banner.remove(), 180)
  }

  function remember(choice, banner) {
    storageSet(choice)
    if (choice === 'accepted') {
      setConsentCookie('accepted')
    } else {
      deleteConsentCookie()
    }
    closeBanner(banner)
  }

  function makeButton(label, variant, onClick) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `cookie-consent__button cookie-consent__button--${variant}`
    button.textContent = label
    button.addEventListener('click', onClick)
    return button
  }

  function showBanner() {
    const existing = document.querySelector('[data-cookie-consent]')
    if (existing) {
      existing.classList.add('is-visible')
      return
    }

    const text = copy[getLanguage()]
    const banner = document.createElement('section')
    banner.className = 'cookie-consent'
    banner.setAttribute('data-cookie-consent', '')
    banner.setAttribute('role', 'region')
    banner.setAttribute('aria-label', text.label)

    const content = document.createElement('div')
    content.className = 'cookie-consent__copy'

    const title = document.createElement('h2')
    title.textContent = text.title

    const body = document.createElement('p')
    body.textContent = text.body

    const learn = document.createElement('a')
    learn.href = './legal.html#cookies'
    learn.textContent = text.learn

    content.append(title, body, learn)

    const actions = document.createElement('div')
    actions.className = 'cookie-consent__actions'
    actions.append(
      makeButton(text.reject, 'ghost', () => remember('rejected', banner)),
      makeButton(text.accept, 'solid', () => remember('accepted', banner)),
    )

    banner.append(content, actions)
    document.body.appendChild(banner)
    window.requestAnimationFrame(() => banner.classList.add('is-visible'))
  }

  function reset() {
    storageRemove()
    deleteConsentCookie()
    showBanner()
  }

  window.AnstossCookieConsent = {
    getChoice,
    reset,
    show: showBanner,
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('click', (event) => {
      const trigger = event.target.closest('[data-cookie-settings]')
      if (!trigger) return
      event.preventDefault()
      reset()
    })

    if (!getChoice()) {
      showBanner()
    }
  })
})()
