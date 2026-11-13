/* Anstoss website interactions: language select and pills, role tabs,
   club colour swatches, billing toggle. Copy comes from i18n.js. */
;(() => {
  const I18N = window.AnstossI18n
  if (!I18N || !document.body.hasAttribute('data-site')) return

  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
  const TICK =
    '<span class="tick"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg></span>'

  const state = { role: 0, yearly: false }

  // Roving-focus keyboard support shared by the tablist and radiogroups.
  function arrowNav(items, onPick) {
    items.forEach((el, i) => {
      el.addEventListener('keydown', (e) => {
        const rtl = document.documentElement.dir === 'rtl'
        const next = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1, ArrowDown: 1, ArrowUp: -1 }[e.key]
        let j = null
        if (next) j = (i + next + items.length) % items.length
        else if (e.key === 'Home') j = 0
        else if (e.key === 'End') j = items.length - 1
        if (j === null) return
        e.preventDefault()
        items[j].focus()
        onPick(j)
      })
      el.addEventListener('click', () => onPick(i))
    })
  }

  function select(items, idx, attr) {
    items.forEach((el, i) => {
      el.setAttribute(attr, String(i === idx))
      el.tabIndex = i === idx ? 0 : -1
    })
  }

  /* Language */
  const sel = document.getElementById('lang')
  if (sel) sel.addEventListener('change', () => I18N.choose(sel.value))
  document.querySelectorAll('[data-lang-pill]').forEach((b) =>
    b.addEventListener('click', () => I18N.choose(b.getAttribute('data-lang-pill'))),
  )

  /* Roles */
  const tabs = Array.from(document.querySelectorAll('[data-role-tab]'))
  const mocks = Array.from(document.querySelectorAll('[data-role-mock]'))
  const panel = document.getElementById('rpanel')
  const roleTitle = document.querySelector('[data-role-title]')
  const roleBullets = document.querySelector('[data-role-bullets]')

  function renderRole() {
    const role = I18N.t().roles[state.role]
    select(tabs, state.role, 'aria-selected')
    mocks.forEach((m, i) => (m.hidden = i !== state.role))
    if (panel) panel.setAttribute('aria-labelledby', `rtab-${state.role}`)
    if (roleTitle) roleTitle.textContent = role[1]
    if (roleBullets) roleBullets.innerHTML = role[2].map((x) => `<li>${TICK}<span>${esc(x)}</span></li>`).join('')
  }
  arrowNav(tabs, (i) => {
    state.role = i
    renderRole()
  })

  /* Club colour */
  const swatches = Array.from(document.querySelectorAll('[data-swatch]'))
  arrowNav(swatches, (i) => {
    select(swatches, i, 'aria-checked')
    document.documentElement.style.setProperty('--club', swatches[i].getAttribute('data-swatch'))
  })

  /* Billing */
  const billing = Array.from(document.querySelectorAll('[data-billing]'))
  const price = document.querySelector('[data-price]')
  const per = document.querySelector('[data-per]')
  function renderPrice() {
    const t = I18N.t()
    select(billing, state.yearly ? 1 : 0, 'aria-checked')
    if (price) price.textContent = state.yearly ? t.club_py : t.club_pm
    if (per) per.textContent = state.yearly ? t.club_pery : t.club_perm
  }
  arrowNav(billing, (i) => {
    state.yearly = i === 1
    renderPrice()
  })

  document.addEventListener('anstoss:lang', () => {
    renderRole()
    renderPrice()
  })
})()
