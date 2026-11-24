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

export const POLICY_LAST_UPDATED = '2026-11-14'

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
            'Beitragsstatus, Zahlungsnachweise, Vereinskontodaten für Überweisungen und Stripe-Referenzen für Anstoss-Abonnements.',
            'Geräte-Token (Expo) für Push-Benachrichtigungen.',
            'Fehler- und Leistungsdaten für Stabilität und Missbrauchsschutz.',
          ],
        },
        { kind: 'h', text: 'Rechtsgrundlage' },
        {
          kind: 'p',
          text: 'Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung), lit. f (berechtigte Interessen des Vereinsbetriebs) und Deine ausdrückliche Einwilligung für Marketing.',
        },
        { kind: 'h', text: 'Freie Profile, Vereinssuche und Probetrainings' },
        {
          kind: 'p',
          text: 'Wenn Du ein Suchprofil anlegst, verarbeiten wir Deine freiwilligen Angaben: gesuchte Rolle als Spieler oder Trainer, Position, bevorzugter Fuß, Erfahrung, Verfügbarkeit, Beschreibung, Ort, Postleitzahl, Suchbereich sowie hochgeladene Fotos und Videos. Suchstatus und Sichtbarkeit steuerst Du im Profil. Ohne aktive Suche und passende Sichtbarkeit erscheint das Profil nicht in der Kandidatensuche. Eine Entfernung aus einem Verein veröffentlicht kein Profil.',
        },
        {
          kind: 'p',
          text: 'Die Vereinssuche verwendet derzeit ungefähre Postleitzahlregionen, keine GPS-Ortung und keine verlässliche Kilometerentfernung. Gesuche und Einladungen führen nicht automatisch zu einer Aufnahme. Du entscheidest über Anfragen und Einladungen; die Berechtigten des Vereins entscheiden über die Aufnahme. Deine vollständige Postleitzahl wird anderen Suchenden nicht angezeigt.',
        },
        {
          kind: 'p',
          text: 'Bei einer Anfrage oder Einladung verarbeitet der beteiligte Verein die dafür erforderlichen Profil- und Terminangaben, Antworten sowie gegebenenfalls Rückmeldungen und Aufnahmedaten. Bereits beteiligte Vereine können das Profil für die Bearbeitung eines laufenden Probetrainings und bis zu 14 Tage nach dessen Abschluss sehen. Das Ausblenden eines Profils löscht keine laufenden Anfragen. Hochgeladene Medien können über bereits bekannte Datei-URLs weiter erreichbar sein; Sichtbarkeitseinstellungen sind kein Kopierschutz. Lade nur Inhalte hoch, die Du berechtigt teilen darfst.',
        },
        { kind: 'h', text: 'Vereinszugang und Löschung' },
        {
          kind: 'p',
          text: 'Wirst Du aus einem Verein entfernt, endet Dein Zugriff auf dessen geschützte Informationen. Andere Vereinsmitgliedschaften und Dein eigenes Konto bleiben bestehen. Ohne weitere Mitgliedschaft können Spieler und Trainer das unabhängige Portal nutzen. Ein Vereinsadmin muss die Löschung Deines Kontos nicht genehmigen.',
        },
        {
          kind: 'p',
          text: 'Du kannst Suchprofile und einzelne Medien separat entfernen oder Dein gesamtes Konto unter Mehr → Daten → Konto löschen löschen. Die Kontolöschung entfernt oder anonymisiert Profil, Erfahrungen, Probetrainings- und Mitgliedschaftsdaten und beendet den Kontozugang. Dateien werden zur Löschung vorgemerkt; fehlgeschlagene Speicherlöschungen werden erneut versucht. Kurzzeitig gültige Upload-Links werden dabei abgewartet. Erledigte Löschaufträge werden entfernt. Nach einer Löschanfrage löschen oder anonymisieren wir personenbezogene Daten innerhalb von 30 Tagen; erforderliche gesetzliche Nachweise sind davon ausgenommen und werden nicht für die Kandidatensuche verwendet. Ohne App-Zugriff erreichst Du uns über https://anstoss.io/account-deletion.',
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
        { kind: 'h', text: 'Vereinssuche und eigene Medien' },
        {
          kind: 'p',
          text: 'Suchprofile, Gesuche und Probetrainings dienen der Kontaktaufnahme, nicht als Zusage einer Aufnahme, Beschäftigung oder Spielberechtigung. Stelle Deine Erfahrung wahrheitsgemäß dar. Lade Fotos und Clips nur mit den erforderlichen Rechten und Erlaubnissen der erkennbaren Personen hoch. Eine Profilangabe oder Einladung verleiht keine Trainer- oder Administratorrechte. Vereinszugang und eigenes Anstoss-Konto sind getrennt; ein Verein kann Deinen Zugang zu seinen Informationen beenden, aber nicht über die Löschung Deines persönlichen Kontos entscheiden.',
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
          text: 'You can remove your recruitment profile and individual media separately, or delete your whole account under More → Data → Delete account. Account deletion removes or anonymises your profile, experience, trial and membership data and ends account access. Files are queued for erasure; failed storage deletions are retried after short-lived upload links expire. Completed deletion jobs are removed. Following an erasure request, we delete or anonymise personal data within 30 days; necessary statutory records are excepted and are not used for candidate discovery. Without app access, use https://anstoss.io/account-deletion.',
        },
        {
          kind: 'p',
          text: 'Raw bank-import files are deleted within 24 hours. Unaccepted expired or revoked invitations are deleted after 90 days. Resolved authority-claim evidence is deleted after 180 days unless an open dispute requires preservation. Short-lived ownership verification challenges are deleted after use or expiry. Operational membership and contribution records remain available to the club while needed for club administration; accounting and security audit records may be retained for applicable statutory limitation or bookkeeping periods. Account deletion anonymises the member identity while preserving only records that the club or Anstoss must retain for legal, accounting, fraud-prevention, or security purposes.',
        },
        { kind: 'h', text: 'Independent profiles, club discovery and trials' },
        {
          kind: 'p',
          text: 'If you create a recruitment profile, we process the details you choose to provide: the player or coach role you are seeking, position, preferred foot, experience, availability, biography, town, postal code, search area, photos and videos. You control search status and visibility in your profile. A profile is not listed in candidate search unless search is active and visibility permits it. Removal from a club does not publish a profile.',
        },
        {
          kind: 'p',
          text: 'Club discovery currently uses approximate postal-code regions, not GPS tracking or reliable kilometre distances. A vacancy or invitation does not automatically enrol you. You choose whether to request or accept an invitation; authorised club staff decide admission. Your full postal code is not shown to other searchers.',
        },
        {
          kind: 'p',
          text: 'For a request or invitation, the participating club processes relevant profile and session details, responses and, where applicable, feedback and application information. Participating clubs can view the profile to handle an open trial and for up to 14 days after closure. Hiding a profile does not delete ongoing requests. Uploaded media may remain accessible through previously known file URLs; visibility controls are not copy protection. Only upload content you are entitled to share.',
        },
        { kind: 'h', text: 'Club access and your own account' },
        {
          kind: 'p',
          text: 'Removal from a club ends access to its protected information. Other club memberships and your own account remain. Players and coaches without another membership can use the independent portal. A club administrator does not have to approve deletion of your personal account.',
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
        { kind: 'h', text: 'Recruitment and your own media' },
        {
          kind: 'p',
          text: 'Recruitment profiles, vacancies and trials facilitate contact; they do not promise admission, employment or eligibility to play. Describe your experience honestly. Upload photos and clips only with the necessary rights and permissions from identifiable people. A profile statement or invitation does not grant coach or administrator permissions. Club access and your personal Anstoss account are separate: a club can end access to its information but cannot decide whether you may delete your personal account.',
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
