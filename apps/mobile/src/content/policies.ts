// Long-form legal copy rendered by the in-app /policy/[kind] screens.
// Sourced from apps/web/src/legal.html (kept intentionally in lockstep
// with the marketing site) and re-shaped into structured blocks so the
// mobile renderer can format reading typography correctly.

export type PolicyBlock =
  | { kind: 'p'; text: string }
  | { kind: 'h'; text: string }
  | { kind: 'ul'; items: string[] }

export type PolicyKind = 'impressum' | 'privacy' | 'terms' | 'cookies'

export type Policy = {
  kind: PolicyKind
  title: string
  subtitle: string
  body: PolicyBlock[]
}

export const POLICY_LAST_UPDATED = '2026-03-31'

export const POLICIES: Record<'de' | 'en', Record<PolicyKind, Policy>> = {
  de: {
    impressum: {
      kind: 'impressum',
      title: 'Impressum',
      subtitle: 'Angaben gemäß § 5 DDG (ehemals TMG)',
      body: [
        { kind: 'h', text: 'Verantwortlich' },
        {
          kind: 'p',
          text: 'Opeyemi Ajimati\nHönower Wiesenweg 57\n12623 Berlin\nDeutschland',
        },
        { kind: 'h', text: 'Kontakt' },
        { kind: 'p', text: 'E-Mail: kontakt@anstoss.io' },
        { kind: 'h', text: 'Inhaltlich Verantwortlicher gemäß § 18 Abs. 2 MStV' },
        { kind: 'p', text: 'Opeyemi Ajimati\nHönower Wiesenweg 57\n12623 Berlin' },
        { kind: 'h', text: 'EU-Streitschlichtung' },
        {
          kind: 'p',
          text: 'Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit: https://ec.europa.eu/consumers/odr/. Wir sind nicht verpflichtet und nicht bereit, an einem Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.',
        },
      ],
    },
    privacy: {
      kind: 'privacy',
      title: 'Datenschutz',
      subtitle: 'Wie wir Deine Daten verarbeiten — kurz, transparent, ohne Tracking.',
      body: [
        {
          kind: 'p',
          text: 'Anstoss respektiert Deine Privatsphäre. Diese Erklärung beschreibt, welche Daten wir verarbeiten und warum.',
        },
        { kind: 'h', text: 'Verantwortlicher' },
        {
          kind: 'p',
          text: 'Opeyemi Ajimati · Hönower Wiesenweg 57 · 12623 Berlin\nE-Mail: kontakt@anstoss.io',
        },
        { kind: 'h', text: 'Welche Daten verarbeiten wir' },
        {
          kind: 'ul',
          items: [
            'E-Mail-Adresse für die Anmeldung per Einmalcode.',
            'Name, Geburtsdatum, Nutzer-ID und Rolle für die Vereinszuordnung.',
            'RSVP-Antworten, Chat-Nachrichten, Direktnachrichten, Reaktionen, Aufstellungen, Einladungen, Profilbilder, Vereinswappen, Chat-Bilder und Sprachnachrichten für die Vereinsverwaltung.',
            'Beitragsstatus, Zahlungsnachweise und Stripe-Referenzen für Vereinsbeiträge.',
            'Geräte-Token (Expo) für Push-Benachrichtigungen.',
            'Fehler- und Leistungsdaten für Stabilität und Missbrauchsschutz.',
          ],
        },
        { kind: 'h', text: 'Rechtsgrundlage' },
        {
          kind: 'p',
          text: 'Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung), lit. f (berechtigte Interessen des Vereinsbetriebs) und Deine ausdrückliche Einwilligung für Marketing.',
        },
        { kind: 'h', text: 'Speicherdauer' },
        {
          kind: 'p',
          text: 'Wir speichern Daten nur so lange, wie es für den vereinbarten Zweck erforderlich ist oder gesetzliche Aufbewahrungsfristen es vorschreiben.',
        },
        { kind: 'h', text: 'Deine Rechte' },
        {
          kind: 'ul',
          items: [
            'Auskunft (Art. 15 DSGVO).',
            'Berichtigung (Art. 16 DSGVO).',
            'Löschung (Art. 17 DSGVO).',
            'Einschränkung der Verarbeitung (Art. 18 DSGVO).',
            'Datenübertragbarkeit (Art. 20 DSGVO).',
            'Widerspruch (Art. 21 DSGVO).',
          ],
        },
        {
          kind: 'p',
          text: 'Anfragen richte bitte an kontakt@anstoss.io. Dein Konto kannst Du in der App unter Mehr → Daten → Konto löschen oder ohne App-Zugriff unter https://anstoss.io/account-deletion löschen lassen. Beschwerden kannst Du zudem bei der zuständigen Aufsichtsbehörde einreichen.',
        },
        { kind: 'h', text: 'Auftragsverarbeiter' },
        {
          kind: 'ul',
          items: [
            'Railway — API-Hosting und Datenbank (EU-Region, Anbieter USA / SCCs)',
            'Cloudflare R2 — Bilder',
            'Upstash Redis — Cache',
            'Resend — E-Mail-Einmalcodes und Transaktionsmails',
            'Stripe — Zahlungsabwicklung',
            'Expo — Push-Benachrichtigungen',
            'Sentry — Fehlerüberwachung',
            'FUSSBALL.DE/DFBnet — offizieller Vereins-Widget-Inhalt, der nur nach Einbindung durch einen Vereinsadmin geladen wird; dabei erhält der Anbieter übliche Web-Anfragedaten wie IP-Adresse und Geräte-/Browserinformationen',
          ],
        },
      ],
    },
    terms: {
      kind: 'terms',
      title: 'Nutzungsbedingungen',
      subtitle: 'Was wir voneinander erwarten — und was nicht.',
      body: [
        {
          kind: 'p',
          text: 'Mit der Nutzung von Anstoss erklärst Du Dich mit diesen Nutzungsbedingungen einverstanden.',
        },
        { kind: 'h', text: 'Account und Mitgliedschaft' },
        {
          kind: 'p',
          text: 'Du bist verantwortlich für die Richtigkeit Deiner Angaben und die Sicherheit Deines Zugangs. Mehrfach- oder Pseudoaccounts sind unzulässig.',
        },
        { kind: 'h', text: 'Inhalte' },
        {
          kind: 'p',
          text: 'Du behältst die Rechte an den von Dir hochgeladenen Inhalten und gewährst uns ein einfaches Nutzungsrecht zur Bereitstellung des Dienstes. Hass, Belästigung und Diskriminierung sind verboten.',
        },
        { kind: 'h', text: 'Verfügbarkeit' },
        {
          kind: 'p',
          text: 'Wir bemühen uns um eine hohe Verfügbarkeit, übernehmen aber keine Garantie für eine ununterbrochene Erreichbarkeit.',
        },
        { kind: 'h', text: 'Kündigung' },
        {
          kind: 'p',
          text: 'Du kannst Deinen Account jederzeit über das Profil löschen. Wir können Accounts bei groben Verstößen sperren.',
        },
      ],
    },
    cookies: {
      kind: 'cookies',
      title: 'Cookies',
      subtitle: 'Was die App speichert — und was wir konsequent vermeiden.',
      body: [
        {
          kind: 'p',
          text: 'Die Anstoss-App verwendet keine Tracking-Cookies. Auf der Website setzen wir nur funktionale Cookies, die für die Sprachwahl und den Login nötig sind. Es findet kein Profiling und kein Drittanbieter-Tracking statt.',
        },
        { kind: 'h', text: 'Funktional' },
        {
          kind: 'ul',
          items: [
            'anstoss.lang — gespeicherte Sprachauswahl im Browser.',
            'Anstoss-Sitzungstoken — nötig, um Dich angemeldet zu halten.',
          ],
        },
      ],
    },
  },
  en: {
    impressum: {
      kind: 'impressum',
      title: 'Imprint',
      subtitle: 'Information pursuant to § 5 DDG (formerly TMG)',
      body: [
        { kind: 'h', text: 'Responsible person' },
        {
          kind: 'p',
          text: 'Opeyemi Ajimati\nHönower Wiesenweg 57\n12623 Berlin\nGermany',
        },
        { kind: 'h', text: 'Contact' },
        { kind: 'p', text: 'Email: kontakt@anstoss.io' },
        { kind: 'h', text: 'Responsible for content per § 18 (2) MStV' },
        { kind: 'p', text: 'Opeyemi Ajimati\nHönower Wiesenweg 57\n12623 Berlin' },
        { kind: 'h', text: 'EU dispute resolution' },
        {
          kind: 'p',
          text: 'The European Commission provides an online dispute resolution platform: https://ec.europa.eu/consumers/odr/. We are neither obligated nor willing to participate in dispute resolution proceedings before a consumer arbitration board.',
        },
      ],
    },
    privacy: {
      kind: 'privacy',
      title: 'Privacy',
      subtitle: 'How we handle your data — short, transparent, no tracking.',
      body: [
        {
          kind: 'p',
          text: 'Anstoss respects your privacy. This statement describes which data we process and why.',
        },
        { kind: 'h', text: 'Controller' },
        {
          kind: 'p',
          text: 'Opeyemi Ajimati · Hönower Wiesenweg 57 · 12623 Berlin\nEmail: kontakt@anstoss.io',
        },
        { kind: 'h', text: 'What we process' },
        {
          kind: 'ul',
          items: [
            'Email address for one-time-code sign-in.',
            'Name, date of birth, user ID, and role for club membership.',
            'RSVP responses, chat messages, direct messages, reactions, lineups, invitations, profile photos, club badges, chat images, and voice notes for club operations.',
            'Contribution amounts, due dates, payment status, reminder history, and bank-statement matching decisions recorded by your club. Anstoss does not collect or hold member dues.',
            'Stripe subscription references for a club’s Anstoss software plan. Stripe is not used to collect player contributions.',
            'Device tokens (Expo) for push notifications.',
            'Crash and performance data for stability and abuse prevention.',
          ],
        },
        { kind: 'h', text: 'Legal basis' },
        {
          kind: 'p',
          text: 'Art. 6 (1) (b) GDPR (contract performance), (f) (legitimate interests of club operations), and your explicit consent for marketing.',
        },
        { kind: 'h', text: 'Retention' },
        {
          kind: 'p',
          text: 'Raw bank-import files are deleted within 24 hours. Unaccepted expired or revoked invitations are deleted after 90 days. Resolved authority-claim evidence is deleted after 180 days unless an open dispute requires preservation. Short-lived ownership verification challenges are deleted after use or expiry. Operational membership and contribution records remain available to the club while needed for club administration; accounting and security audit records may be retained for applicable statutory limitation or bookkeeping periods. Account deletion anonymises the member identity while preserving only records that the club or Anstoss must retain for legal, accounting, fraud-prevention, or security purposes.',
        },
        { kind: 'h', text: 'Your rights' },
        {
          kind: 'ul',
          items: [
            'Access (Art. 15 GDPR).',
            'Rectification (Art. 16 GDPR).',
            'Erasure (Art. 17 GDPR).',
            'Restriction of processing (Art. 18 GDPR).',
            'Data portability (Art. 20 GDPR).',
            'Objection (Art. 21 GDPR).',
          ],
        },
        {
          kind: 'p',
          text: 'Send requests to kontakt@anstoss.io. You can delete your account in the app under More → Data → Delete account, or without app access at https://anstoss.io/account-deletion. You may also lodge a complaint with the competent supervisory authority.',
        },
        { kind: 'h', text: 'Processors' },
        {
          kind: 'ul',
          items: [
            'Railway — API hosting and database (EU region, US provider / SCCs)',
            'Cloudflare R2 — images',
            'Upstash Redis — cache',
            'Resend — email one-time codes and transactional email',
            'Stripe — payment processing',
            'Expo — push notifications',
            'Sentry — error monitoring',
            'FUSSBALL.DE/DFBnet — official club widget content loaded only when a club administrator embeds a widget; the provider receives normal web-request metadata such as IP address and device/browser information',
          ],
        },
      ],
    },
    terms: {
      kind: 'terms',
      title: 'Terms of service',
      subtitle: 'What we expect from each other — and what we don’t.',
      body: [
        {
          kind: 'p',
          text: 'By using Anstoss, you agree to these Terms of Service.',
        },
        { kind: 'h', text: 'Account and membership' },
        {
          kind: 'p',
          text: 'You are responsible for the accuracy of your information and the security of your access. Multiple or pseudonymous accounts are not permitted.',
        },
        { kind: 'h', text: 'Content' },
        {
          kind: 'p',
          text: 'You retain rights to content you upload and grant us a non-exclusive license to provide the service. Hate, harassment, and discrimination are prohibited.',
        },
        { kind: 'h', text: 'Availability' },
        {
          kind: 'p',
          text: 'We strive for high availability but make no guarantee of uninterrupted access.',
        },
        { kind: 'h', text: 'Termination' },
        {
          kind: 'p',
          text: 'You can delete your account at any time from your profile. We may suspend accounts for serious violations.',
        },
      ],
    },
    cookies: {
      kind: 'cookies',
      title: 'Cookies',
      subtitle: 'What the app stores — and what we deliberately avoid.',
      body: [
        {
          kind: 'p',
          text: 'The Anstoss app uses no tracking cookies. On the website we only set functional cookies needed for language preference and sign-in. There is no profiling or third-party tracking.',
        },
        { kind: 'h', text: 'Functional' },
        {
          kind: 'ul',
          items: [
            'anstoss.lang — stored language preference in the browser.',
            'Anstoss session token — needed to keep you signed in.',
          ],
        },
      ],
    },
  },
}
