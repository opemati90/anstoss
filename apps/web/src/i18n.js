/* Anstoss landing page locale switch and small UI helpers.
   Locale order:
     1. ?lang= URL param
     2. localStorage anstoss.lang
     3. navigator.language
     4. fallback: de */

const DICT = {
  de: {
    title: 'Anstoss - Eine App für deinen Fußballverein',
    description:
      'Anstoss bündelt Spielplan, Aufstellungen, Live-Scores und Mannschafts-Chat in einer App mit den Vereinsfarben deines Clubs.',
    'nav.features': 'Funktionen',
    'nav.preview': 'Vorschau',
    'nav.faq': 'FAQ',
    'nav.cta': 'App herunterladen',
    'hero.eyebrow': 'Die App für Amateurvereine',
    'hero.h1': 'Dein Verein.<br />Alles an einem Ort.',
    'hero.lede':
      'Spielplan, Aufstellung, Live-Ticker und Teamchat in einer App. Gebaut für Amateurclubs, Eltern und Trainer.',
    'hero.cta1': 'App herunterladen',
    'hero.cta2': 'Verein anlegen',
    'panel.kicker': 'Clubbetrieb',
    'panel.h2': 'Alles bleibt beim Verein.',
    'panel.copy':
      'Vereinsfarben, Rollen, Teams und Spieltage werden in einem klaren Flow geführt.',
    'panel.stat.1.label': 'Teams',
    'panel.stat.1.value': 'Mehrere Kader',
    'panel.stat.2.label': 'Daten',
    'panel.stat.2.value': 'EU gehostet',
    'feat.h2': 'Alles, was den Spieltag bewegt.',
    'feat.sub':
      'Anstoss ersetzt die losen Chats, Tabellen, PDF-Listen und Nachfragen, die im Amateurfußball jede Woche Zeit kosten.',
    'feat.1.token': 'Matchday',
    'feat.1.t': 'Aufstellung, RSVP und Live-Ticker',
    'feat.1.b':
      'Trainer planen den Kader, Spieler sagen zu, Eltern sehen Zeiten und der Live-Ticker bleibt direkt beim Team.',
    'feat.2.token': 'Chat',
    'feat.2.t': 'Teamchat ohne Tool-Wechsel',
    'feat.2.b':
      'Nachrichten, Medien und Übersetzung sitzen neben dem Spielplan, nicht in einer privaten Chatgruppe.',
    'feat.3.token': 'Rollen',
    'feat.3.t': 'Klare Sicht für jede Rolle',
    'feat.3.b':
      'Spieler, Trainer, Eltern und Vereinsadmins sehen genau das, was für ihren Alltag relevant ist.',
    'feat.4.token': 'Verein',
    'feat.4.t': 'Mehrere Teams in einem Club',
    'feat.4.b':
      'Erste, Jugend, Frauen, Senioren und Elternkanäle laufen unter einem Verein, ohne getrennte Inseln.',
    'feat.5.token': 'Beiträge',
    'feat.5.t': 'Mitgliedschaft und Nachweise',
    'feat.5.b':
      'Vereinsadmins behalten Beiträge, Belege und offene Aufgaben im Blick. Der MVP bleibt einfach, aber nicht blind.',
    'prev.h2': 'Dein Club ist die Marke.',
    'prev.sub':
      'Anstoss ist <em>White-Label</em>: Farben, Wappen, Teams und Rollen gehören dem Verein. Die App tritt zurück.',
    'prev.item.1.t': 'Vereinsfarben',
    'prev.item.1.b': 'Jede Mannschaft wirkt wie euer eigener digitaler Raum.',
    'prev.item.2.t': 'Saisonkontext',
    'prev.item.2.b': 'Spielplan, Tabelle und Form bleiben am Team sichtbar.',
    'prev.item.3.t': 'Datenschutz',
    'prev.item.3.b': 'Rollen und EU-Hosting sind Teil des Produkts, nicht Kleingedrucktes.',
    'split.h2': 'Vom Probetraining bis zum Spieltag.',
    'split.sub':
      'Der wichtigste Weg ist kurz: Club finden, beitreten, mitspielen. Admins behalten Teams, Rollen und Kommunikation im Griff.',
    'split.li.1.t': 'Club finden',
    'split.li.1.b':
      'Spieler suchen ihren Verein oder lösen eine Einladung ein. Clubseiten zeigen nur öffentliche Informationen.',
    'split.li.2.t': 'Team beitreten',
    'split.li.2.b':
      'Trainer und Admins bestätigen Rollen. Eltern können sauber von Spielergruppen getrennt werden.',
    'split.li.3.t': 'Woche steuern',
    'split.li.3.b':
      'Training, Spiel, Aufstellung, Chat und Beiträge laufen in einem wiederholbaren Vereinsrhythmus.',
    'faq.eyebrow': 'Häufige Fragen',
    'faq.h2': 'Schnell beantwortet.',
    'faq.q1': 'Funktioniert Anstoss auch ohne externe Teamdaten?',
    'faq.a1':
      'Ja. Du kannst Termine und Aufstellungen manuell pflegen. Eine externe Teamdaten-Anbindung ist optional und unterstützt den Spielplan-Import, wenn sie verfügbar ist.',
    'faq.q2': 'Wer hat Zugriff auf welche Daten?',
    'faq.a2':
      'Anstoss trennt Rollen klar: Spieler sehen ihre Mannschaft, Eltern den Eltern-Kanal, Trainer ihren Kader und Vereinsadmins den ganzen Verein.',
    'faq.q3': 'Werden Chat-Nachrichten übersetzt?',
    'faq.a3':
      'Ja, automatisch in die Sprache der Empfänger. Die Übersetzung läuft über unsere selbst gehostete Infrastruktur in der EU.',
    'faq.q4': 'Können Kinder unter 16 Anstoss nutzen?',
    'faq.a4': 'Ja, mit Einwilligung der Erziehungsberechtigten gemäß DSGVO Art. 8.',
    'faq.q5': 'Wie lösche ich mein Konto?',
    'faq.a5': 'Unter „Mehr > Daten > Konto löschen" oder über anstoss.io/account-deletion.',
    'faq.q6': 'Auf welchen Plattformen läuft Anstoss?',
    'faq.a6': 'iOS und Android. Eine Tablet- und Web-App folgt nach dem MVP-Launch.',
    'dl.h2': 'App herunterladen und Verein starten.',
    'dl.sub':
      'Lade Anstoss, lege deinen Verein an und lade den ersten Trainer ein. Spieler werden über ihre Telefonnummer zugeordnet.',
    'dl.appstore.tiny': 'Lade im',
    'dl.playstore.tiny': 'Hol es bei',
    'footer.tagline':
      'Anstoss bündelt Spielbetrieb, Kommunikation und Mitgliedschaft für Amateurvereine in Deutschland.',
    'footer.product': 'Produkt',
    'footer.product.features': 'Funktionen',
    'footer.product.signup': 'Verein anlegen',
    'footer.product.join': 'Einladung einlösen',
    'footer.legal': 'Rechtliches',
    'footer.legal.imprint': 'Impressum',
    'footer.legal.privacy': 'Datenschutz',
    'footer.legal.terms': 'AGB',
    'footer.legal.cookies': 'Cookies',
    'footer.contact': 'Kontakt',
    'footer.accountDeletion': 'Konto löschen',
    'footer.fineprint': '© <span id="year"></span> Anstoss. Eine App für deinen Fußballverein.',
  },
  en: {
    title: 'Anstoss - One app for your football club',
    description:
      "Anstoss bundles fixtures, lineups, live scores, and team chat in one app with your club's colours.",
    'nav.features': 'Features',
    'nav.preview': 'Preview',
    'nav.faq': 'FAQ',
    'nav.cta': 'Download app',
    'hero.eyebrow': 'The app for amateur football clubs',
    'hero.h1': 'Your club.<br />One place.',
    'hero.lede':
      'Fixtures, lineups, live ticker and team chat in one app. Built for amateur clubs, parents and coaches.',
    'hero.cta1': 'Download app',
    'hero.cta2': 'Set up club',
    'panel.kicker': 'Club operations',
    'panel.h2': 'The club stays in control.',
    'panel.copy': 'Colours, roles, teams and matchdays move through one clear flow.',
    'panel.stat.1.label': 'Teams',
    'panel.stat.1.value': 'Multiple squads',
    'panel.stat.2.label': 'Data',
    'panel.stat.2.value': 'EU hosted',
    'feat.h2': 'Everything matchday depends on.',
    'feat.sub':
      'Anstoss replaces the loose chats, tables, PDF lists and follow-ups that cost amateur clubs time every week.',
    'feat.1.token': 'Matchday',
    'feat.1.t': 'Lineup, RSVP and live ticker',
    'feat.1.b':
      'Coaches plan the squad, players respond, parents see timing and the live ticker stays with the team.',
    'feat.2.token': 'Chat',
    'feat.2.t': 'Team chat without tool switching',
    'feat.2.b':
      'Messages, media and translation sit next to the schedule, not inside a private group chat.',
    'feat.3.token': 'Roles',
    'feat.3.t': 'Clear views for every role',
    'feat.3.b':
      'Players, coaches, parents and club admins see exactly what matters for their day.',
    'feat.4.token': 'Club',
    'feat.4.t': 'Multiple teams in one club',
    'feat.4.b':
      'First team, youth, women, seniors and parent channels run under one club without separate islands.',
    'feat.5.token': 'Dues',
    'feat.5.t': 'Membership and receipts',
    'feat.5.b':
      'Club admins keep dues, receipts and open tasks visible. The MVP stays simple, but not blind.',
    'prev.h2': 'Your club is the brand.',
    'prev.sub':
      'Anstoss is <em>white-label</em>: colours, crest, teams and roles belong to the club. The app steps back.',
    'prev.item.1.t': 'Club colours',
    'prev.item.1.b': 'Every team feels like its own digital room.',
    'prev.item.2.t': 'Season context',
    'prev.item.2.b': 'Fixtures, table and form stay visible around the team.',
    'prev.item.3.t': 'Privacy',
    'prev.item.3.b': 'Roles and EU hosting are part of the product, not fine print.',
    'split.h2': 'From trial training to matchday.',
    'split.sub':
      'The key path is short: find the club, join, play. Admins keep teams, roles and communication under control.',
    'split.li.1.t': 'Find club',
    'split.li.1.b':
      'Players search for their club or redeem an invite. Club pages show only public information.',
    'split.li.2.t': 'Join team',
    'split.li.2.b':
      'Coaches and admins approve roles. Parent spaces can stay separate from player groups.',
    'split.li.3.t': 'Run the week',
    'split.li.3.b':
      'Training, matches, lineup, chat and dues move through one repeatable club rhythm.',
    'faq.eyebrow': 'Frequently asked',
    'faq.h2': 'Quick answers.',
    'faq.q1': 'Does Anstoss work without external team data?',
    'faq.a1':
      'Yes. You can manage schedules and lineups manually. External team-data linking is optional and only supports fixture import when available.',
    'faq.q2': 'Who can see what?',
    'faq.a2':
      'Anstoss separates roles clearly: players see their team, parents see the parent channel, coaches see their squad and club admins see the whole club.',
    'faq.q3': 'Are chat messages translated?',
    'faq.a3':
      'Yes, automatically into each recipient language. Translation runs through our self-hosted infrastructure in the EU.',
    'faq.q4': 'Can children under 16 use Anstoss?',
    'faq.a4': 'Yes, with parental consent under GDPR Art. 8.',
    'faq.q5': 'How do I delete my account?',
    'faq.a5': 'Under "More > Data > Delete account" or at anstoss.io/account-deletion.',
    'faq.q6': 'Which platforms run Anstoss?',
    'faq.a6': 'iOS and Android. A tablet and web app land after the MVP launch.',
    'dl.h2': 'Download the app and start the club.',
    'dl.sub':
      'Download Anstoss, set up your club and invite the first coach. Players are matched by phone number.',
    'dl.appstore.tiny': 'Download on the',
    'dl.playstore.tiny': 'Get it on',
    'footer.tagline':
      'Anstoss bundles match operations, communication and membership for amateur football clubs in Germany.',
    'footer.product': 'Product',
    'footer.product.features': 'Features',
    'footer.product.signup': 'Set up club',
    'footer.product.join': 'Redeem invite',
    'footer.legal': 'Legal',
    'footer.legal.imprint': 'Imprint',
    'footer.legal.privacy': 'Privacy',
    'footer.legal.terms': 'Terms',
    'footer.legal.cookies': 'Cookies',
    'footer.contact': 'Contact',
    'footer.accountDeletion': 'Delete account',
    'footer.fineprint': '© <span id="year"></span> Anstoss. One app for your football club.',
  },
}

const STORE_KEY = 'anstoss.lang'

function pickInitialLang() {
  const url = new URL(window.location.href)
  const fromUrl = url.searchParams.get('lang')
  if (fromUrl === 'de' || fromUrl === 'en') return fromUrl
  const stored = localStorage.getItem(STORE_KEY)
  if (stored === 'de' || stored === 'en') return stored
  const nav = (navigator.language || '').slice(0, 2).toLowerCase()
  return nav === 'en' ? 'en' : 'de'
}

function applyLang(lang) {
  const dict = DICT[lang] || DICT.de
  document.documentElement.setAttribute('lang', lang)
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n')
    const v = dict[key]
    if (typeof v !== 'string') return
    const attr = el.getAttribute('data-i18n-attr')
    if (attr) el.setAttribute(attr, v)
    else el.textContent = v
  })
  document.querySelectorAll('[data-i18n-html]').forEach((el) => {
    const key = el.getAttribute('data-i18n-html')
    const v = dict[key]
    if (typeof v !== 'string') return
    el.innerHTML = v
  })
  document.querySelectorAll('.lang-switch [data-lang]').forEach((btn) => {
    const isActive = btn.getAttribute('data-lang') === lang
    btn.setAttribute('aria-pressed', String(isActive))
    btn.classList.toggle('is-active', isActive)
  })
  const yearEl = document.getElementById('year')
  if (yearEl) yearEl.textContent = String(new Date().getFullYear())
  localStorage.setItem(STORE_KEY, lang)
}

function bindLangSwitch() {
  document.querySelectorAll('.lang-switch [data-lang]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const lang = btn.getAttribute('data-lang')
      if (lang === 'de' || lang === 'en') applyLang(lang)
    })
  })
}

function bindBurger() {
  const burger = document.querySelector('.nav-burger')
  if (!burger) return
  burger.addEventListener('click', () => {
    const expanded = burger.getAttribute('aria-expanded') === 'true'
    burger.setAttribute('aria-expanded', String(!expanded))
    document.body.classList.toggle('nav-open', !expanded)
  })
  document.querySelectorAll('.nav-links a').forEach((a) => {
    a.addEventListener('click', () => {
      burger.setAttribute('aria-expanded', 'false')
      document.body.classList.remove('nav-open')
    })
  })
}

function bindReveals() {
  const items = Array.from(document.querySelectorAll('[data-reveal]'))
  if (!items.length) return

  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    items.forEach((el) => el.classList.add('is-visible'))
    return
  }

  document.body.classList.add('reveal-ready')
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        entry.target.classList.add('is-visible')
        observer.unobserve(entry.target)
      })
    },
    { threshold: 0.16, rootMargin: '0px 0px -8% 0px' },
  )
  items.forEach((el) => observer.observe(el))
}

document.addEventListener('DOMContentLoaded', () => {
  applyLang(pickInitialLang())
  bindLangSwitch()
  bindBurger()
  bindReveals()
})
