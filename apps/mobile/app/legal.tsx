import { useMemo, useRef } from 'react'
import { ScrollView, StyleSheet, View, type LayoutChangeEvent } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Screen, Text } from '../src/components/ui'
import { ModalHeader } from '../src/components/ModalHeader'
import { useClubColors } from '../src/context/ClubThemeContext'
import { fonts, hairline, radius, space } from '../src/theme/tokens'

type Section = {
  key: string
  title: string
  body: Block[]
}

type Block =
  | { kind: 'p'; text: string }
  | { kind: 'h'; text: string }
  | { kind: 'ul'; items: string[] }

const STAND = 'Stand: 31. März 2026 · Last updated: 31 March 2026'

const SECTIONS_DE: Section[] = [
  {
    key: 'impressum',
    title: 'Impressum',
    body: [
      { kind: 'p', text: 'Angaben gemäß § 5 DDG (ehemals TMG):' },
      { kind: 'h', text: 'Verantwortlich' },
      { kind: 'p', text: 'Yemi\nHönower Wiesenweg 57\n12623 Berlin\nDeutschland' },
      { kind: 'h', text: 'Kontakt' },
      { kind: 'p', text: 'E-Mail: kontakt@anstoss.io' },
      { kind: 'h', text: 'Inhaltlich Verantwortlicher gemäß § 18 Abs. 2 MStV' },
      { kind: 'p', text: 'Yemi\nHönower Wiesenweg 57\n12623 Berlin' },
      { kind: 'h', text: 'EU-Streitschlichtung' },
      {
        kind: 'p',
        text: 'Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit: https://ec.europa.eu/consumers/odr/. Wir sind nicht verpflichtet und nicht bereit, an einem Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.',
      },
    ],
  },
  {
    key: 'datenschutz',
    title: 'Datenschutz',
    body: [
      {
        kind: 'p',
        text: 'Anstoss respektiert Deine Privatsphäre. Diese Erklärung beschreibt, welche Daten wir verarbeiten und warum.',
      },
      { kind: 'h', text: 'Verantwortlicher' },
      { kind: 'p', text: 'Yemi · Hönower Wiesenweg 57 · 12623 Berlin · kontakt@anstoss.io' },
      { kind: 'h', text: 'Welche Daten verarbeiten wir' },
      {
        kind: 'ul',
        items: [
          'Telefonnummer für die Anmeldung (über Clerk).',
          'Name, Geburtsdatum und Rolle für die Vereinszuordnung.',
          'RSVP-Antworten, Chat-Nachrichten und Aufstellungen für die Vereinsverwaltung.',
          'Geräte-Token (Expo) für Push-Benachrichtigungen.',
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
        text: 'Anfragen richte bitte an kontakt@anstoss.io. Beschwerden können Sie zudem bei der zuständigen Aufsichtsbehörde einreichen.',
      },
      { kind: 'h', text: 'Auftragsverarbeiter' },
      {
        kind: 'ul',
        items: [
          'Clerk (Authentifizierung)',
          'Neon (Datenbank, EU-Region)',
          'Cloudflare R2 (Bilder)',
          'Upstash Redis (Cache)',
          'Resend (Transaktionsmails)',
          'Expo (Push-Benachrichtigungen)',
        ],
      },
    ],
  },
  {
    key: 'nutzungsbedingungen',
    title: 'Nutzungsbedingungen',
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
  {
    key: 'cookies',
    title: 'Cookies',
    body: [
      {
        kind: 'p',
        text: 'Die Anstoss-App verwendet keine Tracking-Cookies. Auf der Website setzen wir nur funktionale Cookies, die für die Sprachwahl und den Login nötig sind. Es findet kein Profiling und kein Drittanbieter-Tracking statt.',
      },
    ],
  },
]

const SECTIONS_EN: Section[] = [
  {
    key: 'impressum',
    title: 'Imprint',
    body: [
      { kind: 'p', text: 'Information pursuant to § 5 DDG (formerly TMG):' },
      { kind: 'h', text: 'Responsible person' },
      { kind: 'p', text: 'Yemi\nHönower Wiesenweg 57\n12623 Berlin\nGermany' },
      { kind: 'h', text: 'Contact' },
      { kind: 'p', text: 'Email: kontakt@anstoss.io' },
      { kind: 'h', text: 'Responsible for content per § 18 (2) MStV' },
      { kind: 'p', text: 'Yemi\nHönower Wiesenweg 57\n12623 Berlin' },
      { kind: 'h', text: 'EU dispute resolution' },
      {
        kind: 'p',
        text: 'The European Commission provides an online dispute resolution platform: https://ec.europa.eu/consumers/odr/. We are neither obligated nor willing to participate in dispute resolution proceedings before a consumer arbitration board.',
      },
    ],
  },
  {
    key: 'datenschutz',
    title: 'Privacy',
    body: [
      {
        kind: 'p',
        text: 'Anstoss respects your privacy. This statement describes which data we process and why.',
      },
      { kind: 'h', text: 'Controller' },
      { kind: 'p', text: 'Yemi · Hönower Wiesenweg 57 · 12623 Berlin · kontakt@anstoss.io' },
      { kind: 'h', text: 'What we process' },
      {
        kind: 'ul',
        items: [
          'Phone number for sign-in (via Clerk).',
          'Name, date of birth, and role for club membership.',
          'RSVP responses, chat messages, and lineups for club operations.',
          'Device tokens (Expo) for push notifications.',
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
        text: 'We retain data only as long as necessary for the agreed purpose or as required by statutory retention periods.',
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
        text: 'Send requests to kontakt@anstoss.io. You may also lodge a complaint with the competent supervisory authority.',
      },
      { kind: 'h', text: 'Processors' },
      {
        kind: 'ul',
        items: [
          'Clerk (authentication)',
          'Neon (database, EU region)',
          'Cloudflare R2 (images)',
          'Upstash Redis (cache)',
          'Resend (transactional email)',
          'Expo (push notifications)',
        ],
      },
    ],
  },
  {
    key: 'nutzungsbedingungen',
    title: 'Terms of service',
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
  {
    key: 'cookies',
    title: 'Cookies',
    body: [
      {
        kind: 'p',
        text: 'The Anstoss app uses no tracking cookies. On the website we only set functional cookies needed for language preference and sign-in. There is no profiling or third-party tracking.',
      },
    ],
  },
]

export default function LegalScreen() {
  const { t, i18n } = useTranslation()
  const params = useLocalSearchParams<{ section?: string | string[] }>()
  const c = useClubColors()
  const scrollRef = useRef<ScrollView>(null)
  const offsetsRef = useRef<Record<string, number>>({})

  const language = (i18n.language || 'de').slice(0, 2)
  const isEnglish = language === 'en'
  const sections = isEnglish ? SECTIONS_EN : SECTIONS_DE

  const requested = useMemo(() => {
    const raw = Array.isArray(params.section) ? params.section[0] : params.section
    if (!raw) return null
    return sections.find((s) => s.key === raw) ?? null
  }, [params.section, sections])

  const handleLayout = (key: string) => (e: LayoutChangeEvent) => {
    offsetsRef.current[key] = e.nativeEvent.layout.y
    if (requested && key === requested.key) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: e.nativeEvent.layout.y, animated: false })
      })
    }
  }

  const handleNavTap = (key: string) => {
    const y = offsetsRef.current[key]
    if (typeof y === 'number') {
      scrollRef.current?.scrollTo({ y, animated: true })
    }
  }

  return (
    <Screen header={<ModalHeader title={t('more.legal', { defaultValue: 'Legal' })} mode="back" />} padded={false}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.eyebrow, { color: c.textTertiary }]}>{STAND}</Text>
        <Text variant="title1" color="primary" weight="semibold" style={styles.heading}>
          {t('more.legalTitle', { defaultValue: isEnglish ? 'Legal' : 'Rechtliches' })}
        </Text>
        <Text variant="footnote" color="secondary" style={styles.subhead}>
          {isEnglish
            ? 'All legal information for using Anstoss. Tap a section to jump in.'
            : 'Alle rechtlichen Informationen zur Nutzung von Anstoss. Tippe einen Abschnitt an, um zu ihm zu springen.'}
        </Text>

        <View style={styles.navRow}>
          {sections.map((s) => (
            <Text
              key={s.key}
              accessibilityRole="link"
              onPress={() => handleNavTap(s.key)}
              style={[styles.navChip, { borderColor: c.borderDefault, color: c.textPrimary }]}
            >
              {s.title}
            </Text>
          ))}
        </View>

        {sections.map((s) => (
          <View key={s.key} onLayout={handleLayout(s.key)} style={styles.section}>
            <Text variant="title3" color="primary" weight="semibold" style={styles.sectionTitle}>
              {s.title}
            </Text>
            <View style={[styles.sectionCard, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
              {s.body.map((block, i) => {
                if (block.kind === 'h') {
                  return (
                    <Text key={i} variant="callout" color="primary" weight="semibold" style={styles.h}>
                      {block.text}
                    </Text>
                  )
                }
                if (block.kind === 'ul') {
                  return (
                    <View key={i} style={styles.ul}>
                      {block.items.map((item, idx) => (
                        <View key={idx} style={styles.li}>
                          <Text variant="footnote" color="primary" style={styles.bullet}>·</Text>
                          <Text variant="footnote" color="primary" style={styles.liText}>{item}</Text>
                        </View>
                      ))}
                    </View>
                  )
                }
                return (
                  <Text key={i} variant="footnote" color="primary" style={styles.p}>
                    {block.text}
                  </Text>
                )
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space['2xl'],
  },
  eyebrow: {
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  heading: { letterSpacing: -0.3 },
  subhead: { marginTop: 6, marginBottom: space.md, lineHeight: 20 },

  navRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: space.md,
  },
  navChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: hairline,
    fontFamily: fonts.label,
    fontSize: 13,
  },

  section: { marginTop: space.md, gap: space.xs },
  sectionTitle: { letterSpacing: -0.2, marginLeft: 4 },
  sectionCard: {
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
    gap: 6,
  },

  h: { marginTop: space.sm, letterSpacing: -0.1 },
  p: { lineHeight: 21 },
  ul: { gap: 4, paddingLeft: 4 },
  li: { flexDirection: 'row', gap: 8 },
  bullet: { width: 8, lineHeight: 21 },
  liText: { flex: 1, lineHeight: 21 },
})
