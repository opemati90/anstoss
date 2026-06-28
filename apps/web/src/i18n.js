/* Anstoss landing page — DE/EN i18n + UI helpers.
   Chooses initial locale by:
     1. ?lang= URL param (overrides everything; persisted to localStorage)
     2. localStorage anstoss.lang (sticky preference)
     3. navigator.language (device locale)
     4. fallback: de
   The user can flip locales via the DE/EN switch in the nav. */

const DICT = {
  de: {
    title: 'Anstoss — Eine App für deinen Fußballverein',
    description:
      'Anstoss bündelt Spielplan, Aufstellungen, Live-Scores und Mannschafts-Chat in einer App — mit den Vereinsfarben deines Clubs.',
    'nav.features': 'Funktionen',
    'nav.preview': 'Vorschau',
    'nav.faq': 'FAQ',
    'nav.cta': 'App holen',
    'hero.eyebrow': 'Die App für Amateurvereine',
    'hero.h1': 'Dein Verein.<br />Alles an einem Ort.',
    'hero.lede':
      'Spielplan, Aufstellungen, Live-Scores und Mannschafts-Chat — in den Farben deines Vereins. Kostenlos für Amateurclubs.',
    'hero.cta1': 'App herunterladen',
    'hero.cta2': 'Verein anlegen',
    'hero.trust': 'DSGVO-konformes Vereins-OPS-Tool · Hosted in der EU',
    'card.eyebrow': 'Mitgliedschaft',
    'card.row.label': 'Amateurclubs',
    'card.row.value': 'Startzugang inklusive',
    'card.feat.1': 'White-Label-App in Vereinsfarben',
    'card.feat.2': 'Mannschafts-Chat & Direktnachrichten',
    'card.feat.3': 'Spielplan-Import und manuelle Pflege',
    'card.feat.4': 'Aufstellungen, Live-Ticker, MOTM',
    'card.feat.5': 'Push für RSVPs, Tore und Mannschafts-Ankündigungen',
    'card.cta': 'App holen →',
    'feat.eyebrow': 'Was Anstoss kann',
    'feat.h2': 'WhatsApp-Reichweite,<br />Vereins-Tiefe.',
    'feat.sub':
      'Anstoss vereint, was bei euch heute auf zehn Tools verteilt liegt. Kein Doodle für Zusagen, kein PDF für die Aufstellung, kein Excel für den Kader.',
    'feat.1.t': 'Live-Scores',
    'feat.1.b':
      'Score, Minute und Tore live im Mannschafts-Chat — synchron für Spieler:innen, Trainer:innen und Eltern.',
    'feat.2.t': 'Aufstellungen & Lineup',
    'feat.2.b':
      'Die Aufstellung wird vom Trainer im Lineup-Builder erstellt oder aus verknüpften Teamdaten vorbereitet — eine Tap-Geste, alle wissen Bescheid.',
    'feat.3.t': 'Mannschafts-Chat',
    'feat.3.b':
      'Reaktionen, Antworten, Sprachnachrichten, Bilder und automatische Übersetzung in die Sprache jeder Empfängerin — ohne Datenleck zu Drittanbietern.',
    'feat.4.t': 'Termine & RSVP',
    'feat.4.b':
      'Trainings, Spiele und Events mit Ein-Tap-Zusage. Trainer sehen sofort, wer dabei ist — und können den Rest schnell nachfragen.',
    'feat.5.t': 'Squad & Roster',
    'feat.5.b':
      'Spielerprofile mit Position, Trikotnummer, Saisonstatistiken und Anwesenheitsquote. Kader-Slots können manuell gepflegt oder aus verknüpften Teamdaten vorbereitet werden.',
    'feat.6.t': 'MOTM & Tabelle',
    'feat.6.b':
      'Spieler des Spiels per Live-Abstimmung. Tabelle, Form-Streak und nächste Begegnung bleiben direkt beim Team sichtbar.',
    'prev.eyebrow': 'In der App',
    'prev.h2': 'Pre-Match-Optik,<br />Vereins-Identität.',
    'prev.sub':
      'Anstoss ist <em>White-Label</em>: Vereinsfarben, Wappen, Trikot. Kein generisches Blau, kein Anstoss-Branding über deinem Verein.',
    'prev.card1.eyebrow': 'MATCHDAY · DI 14:00',
    'prev.card1.meta': 'League Match · 2025/26',
    'prev.tab.1': 'Time Line',
    'prev.tab.2': 'Lineup',
    'prev.tab.3': 'Stats',
    'prev.card2.eyebrow': 'CHAT · #TEAM',
    'prev.card2.msg1': 'Wer bringt Wasser?',
    'prev.card2.msg2': 'Eu trago. Quem joga sábado? <em>· Übersetzt aus PT</em>',
    'split.eyebrow': 'Für Vereine',
    'split.h2': 'Vom Bambini bis zur Ersten — eine App.',
    'split.sub':
      'Mehrere Mannschaften, mehrere Rollen, ein Verein. Spieler:innen und Eltern wechseln nahtlos zwischen Teams. Trainer:innen verwalten ihren Kader, Vereinsadmins sehen alles auf einen Blick.',
    'split.li.1':
      '<strong>Mehrere Teams pro Verein</strong> — Erste, Zweite, U19, U17, Damen, Senioren.',
    'split.li.2':
      '<strong>Rollen­basierte Sicht</strong> — Spieler, Trainer, Eltern, Vereinsadmin, Free Agent.',
    'split.li.3':
      '<strong>Eltern-Kanal</strong> — Eigener Bereich für Eltern, getrennt von Spielergruppen.',
    'split.li.4':
      '<strong>Beitrags-Verwaltung</strong> — Mitgliedsbeiträge manuell oder per Zahlungsanbieter erfassen.',
    'faq.eyebrow': 'Häufige Fragen',
    'faq.h2': 'Schnell beantwortet.',
    'faq.q1': 'Funktioniert Anstoss auch ohne externe Teamdaten?',
    'faq.a1':
      'Ja. Du kannst Termine und Aufstellungen manuell pflegen. Eine externe Teamdaten-Anbindung ist optional und unterstützt nur den Spielplan-Import, wenn sie verfügbar ist.',
    'faq.q2': 'Wer hat Zugriff auf welche Daten?',
    'faq.a2':
      'Wir betreiben strikte Rollen­trennung: Spieler:innen sehen ihre Mannschaft, Eltern den Eltern-Kanal, Trainer:innen ihren Kader, Vereinsadmins den ganzen Verein.',
    'faq.q3': 'Werden Chat-Nachrichten übersetzt?',
    'faq.a3':
      'Ja, automatisch in die Sprache der Empfänger:in. Wir nutzen dafür einen selbst gehosteten Übersetzungs-Server in der EU — die Nachrichten verlassen unsere Infrastruktur nicht.',
    'faq.q4': 'Können Kinder unter 16 Anstoss nutzen?',
    'faq.a4': 'Ja, mit Einwilligung der Erziehungs­berechtigten gemäß DSGVO Art. 8.',
    'faq.q5': 'Wie lösche ich mein Konto?',
    'faq.a5': 'Unter „Mehr → Daten → Konto löschen" oder über anstoss.io/account-deletion.',
    'faq.q6': 'Auf welchen Plattformen läuft Anstoss?',
    'faq.a6': 'iOS und Android. Eine Tablet- und Web-App folgt nach dem MVP-Launch.',
    'dl.eyebrow': 'Loslegen',
    'dl.h2': 'App holen, Verein einrichten, fertig.',
    'dl.sub':
      'Lade Anstoss aus dem App Store oder Play Store. Verein anlegen, ersten Trainer einladen, fertig — Spieler:innen werden automatisch über ihre Telefonnummer zugeordnet.',
    'dl.appstore.tiny': 'Lade im',
    'dl.playstore.tiny': 'Hol es bei',
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
    'footer.fineprint': '© <span id="year"></span> Anstoss — Eine App für deinen Fußballverein.',
  },
  en: {
    title: 'Anstoss — One app for your football club',
    description:
      "Anstoss bundles fixtures, lineups, live scores, and team chat in one app — in your club's colours.",
    'nav.features': 'Features',
    'nav.preview': 'Preview',
    'nav.faq': 'FAQ',
    'nav.cta': 'Get the app',
    'hero.eyebrow': 'The app for amateur football clubs',
    'hero.h1': 'Your club.<br />One place.',
    'hero.lede':
      "Fixtures, lineups, live scores, and team chat — in your club's colours. Free for amateur clubs.",
    'hero.cta1': 'Download the app',
    'hero.cta2': 'Set up a club',
    'hero.trust': 'GDPR-compliant club ops · Hosted in the EU',
    'card.eyebrow': 'Membership',
    'card.row.label': 'Amateur clubs',
    'card.row.value': 'Launch access included',
    'card.feat.1': 'White-label app in your colours',
    'card.feat.2': 'Team chat & direct messages',
    'card.feat.3': 'Fixture import and manual schedule control',
    'card.feat.4': 'Lineups, live ticker, MOTM',
    'card.feat.5': 'Push for RSVPs, goals and team announcements',
    'card.cta': 'Get the app →',
    'feat.eyebrow': 'What Anstoss does',
    'feat.h2': 'WhatsApp reach,<br />football-club depth.',
    'feat.sub':
      'Anstoss replaces the ten tools your club currently scatters across. No Doodle for RSVPs, no PDF for the lineup, no Excel for the squad.',
    'feat.1.t': 'Live scores',
    'feat.1.b':
      'Score, minute, and goals live in team chat — in sync for players, coaches, and parents.',
    'feat.2.t': 'Lineups',
    'feat.2.b':
      'The lineup is built by the coach or prepared from linked team data when available — one tap, everyone knows.',
    'feat.3.t': 'Team chat',
    'feat.3.b':
      "Reactions, replies, voice notes, images, and automatic translation into each recipient's language — without leaking data to third parties.",
    'feat.4.t': 'Schedule & RSVP',
    'feat.4.b':
      "Training, matches, and events with one-tap RSVP. Coaches see who's in instantly and can chase the rest fast.",
    'feat.5.t': 'Squad & roster',
    'feat.5.b':
      'Player profiles with position, jersey, season stats, and attendance rate. Roster slots can be managed manually or prepared from linked team data.',
    'feat.6.t': 'MOTM & table',
    'feat.6.b':
      'Man-of-the-match by live vote. Standings, form streak, and the next fixture stay visible for the team.',
    'prev.eyebrow': 'In the app',
    'prev.h2': "Pre-Match aesthetic,<br />your club's identity.",
    'prev.sub':
      'Anstoss is <em>white-label</em>: club colours, crest, kit. No generic blue, no Anstoss branding on top of your club.',
    'prev.card1.eyebrow': 'MATCHDAY · TUE 14:00',
    'prev.card1.meta': 'League Match · 2025/26',
    'prev.tab.1': 'Time Line',
    'prev.tab.2': 'Lineup',
    'prev.tab.3': 'Stats',
    'prev.card2.eyebrow': 'CHAT · #TEAM',
    'prev.card2.msg1': "Who's bringing water?",
    'prev.card2.msg2': "I'll bring it. Who's playing Saturday? <em>· Translated from PT</em>",
    'split.eyebrow': 'For clubs',
    'split.h2': 'From U6 to first team — one app.',
    'split.sub':
      'Multiple teams, multiple roles, one club. Players and parents switch seamlessly between teams. Coaches manage their squad, club admins see everything at a glance.',
    'split.li.1':
      '<strong>Multiple teams per club</strong> — first, reserves, U19, U17, women, senior.',
    'split.li.2':
      '<strong>Role-based view</strong> — player, coach, parent, club admin, free agent.',
    'split.li.3':
      '<strong>Parent channel</strong> — a dedicated space for parents, separate from player groups.',
    'split.li.4':
      '<strong>Membership dues</strong> — track manual payments or configured payment-provider receipts.',
    'faq.eyebrow': 'Frequently asked',
    'faq.h2': 'Quickly answered.',
    'faq.q1': 'Does Anstoss work without external team data?',
    'faq.a1':
      'Yes. You can keep schedules and lineups manually. External team-data linking is optional and only supports fixture import when available.',
    'faq.q2': 'Who can see what?',
    'faq.a2':
      "Strict role separation: players see their team, parents see the parents' channel, coaches see their squad, club admins see the whole club.",
    'faq.q3': 'Are chat messages translated?',
    'faq.a3':
      "Yes, automatically into each recipient's language. We use a self-hosted translation server in the EU — messages never leave our infrastructure.",
    'faq.q4': 'Can children under 16 use Anstoss?',
    'faq.a4': 'Yes, with parental consent under GDPR Art. 8.',
    'faq.q5': 'How do I delete my account?',
    'faq.a5': 'Under "More → Data → Delete account" or at anstoss.io/account-deletion.',
    'faq.q6': 'Which platforms run Anstoss?',
    'faq.a6': 'iOS and Android. A tablet and web app land after the MVP launch.',
    'dl.eyebrow': 'Get started',
    'dl.h2': 'Get the app, set up the club, done.',
    'dl.sub':
      'Download Anstoss from the App Store or Play Store. Set up your club, invite your first coach, done — players are auto-matched by phone number.',
    'dl.appstore.tiny': 'Download on the',
    'dl.playstore.tiny': 'Get it on',
    'footer.tagline':
      'Anstoss bundles match operations, communication, and membership for amateur football clubs in Germany.',
    'footer.product': 'Product',
    'footer.product.features': 'Features',
    'footer.product.signup': 'Set up a club',
    'footer.product.join': 'Redeem invite',
    'footer.legal': 'Legal',
    'footer.legal.imprint': 'Imprint',
    'footer.legal.privacy': 'Privacy',
    'footer.legal.terms': 'Terms',
    'footer.legal.cookies': 'Cookies',
    'footer.contact': 'Contact',
    'footer.fineprint': '© <span id="year"></span> Anstoss — One app for your football club.',
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
  // Active state on the language switch
  document.querySelectorAll('.lang-switch [data-lang]').forEach((btn) => {
    const isActive = btn.getAttribute('data-lang') === lang
    btn.setAttribute('aria-pressed', String(isActive))
    btn.classList.toggle('is-active', isActive)
  })
  // Title gets re-rendered (data-i18n on <title> covers it).
  // Year placeholder gets clobbered by innerHTML on footer fineprint —
  // re-inject it.
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

/* Mobile burger ↔ nav drawer */
function bindBurger() {
  const burger = document.querySelector('.nav-burger')
  if (!burger) return
  burger.addEventListener('click', () => {
    const expanded = burger.getAttribute('aria-expanded') === 'true'
    burger.setAttribute('aria-expanded', String(!expanded))
    document.body.classList.toggle('nav-open', !expanded)
  })
  // Close drawer when a nav link is tapped.
  document.querySelectorAll('.nav-links a').forEach((a) => {
    a.addEventListener('click', () => {
      burger.setAttribute('aria-expanded', 'false')
      document.body.classList.remove('nav-open')
    })
  })
}

document.addEventListener('DOMContentLoaded', () => {
  applyLang(pickInitialLang())
  bindLangSwitch()
  bindBurger()
})
