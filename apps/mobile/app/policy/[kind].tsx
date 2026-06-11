/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useMemo } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Screen, Text } from '../../src/components/ui'
import { ModalHeader } from '../../src/components/ModalHeader'
import { useClubColors } from '../../src/context/ClubThemeContext'
import {
  POLICIES,
  POLICY_LAST_UPDATED,
  type PolicyKind,
} from '../../src/content/policies'
import { fonts, hairline, radius, space } from '../../src/theme/tokens'

const VALID_KINDS: PolicyKind[] = ['impressum', 'privacy', 'terms', 'cookies']

function isValidKind(value: string | undefined): value is PolicyKind {
  return !!value && (VALID_KINDS as string[]).includes(value)
}

export default function PolicyScreen() {
  const { i18n } = useTranslation()
  const params = useLocalSearchParams<{ kind?: string | string[] }>()
  const c = useClubColors()

  const raw = Array.isArray(params.kind) ? params.kind[0] : params.kind
  const kind: PolicyKind = isValidKind(raw) ? raw : 'privacy'
  // German content only for German; everyone else (en/fr/it/pt) gets the
  // English policy until legally-reviewed FR/IT/PT bodies exist — never leak
  // German into a non-German UI.
  const lang = (i18n.language || 'de').slice(0, 2) === 'de' ? 'de' : 'en'
  const policy = POLICIES[lang][kind]

  const lastUpdatedLabel = useMemo(() => {
    const d = new Date(POLICY_LAST_UPDATED)
    return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'de-DE', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(d)
  }, [lang])

  return (
    <Screen
      header={<ModalHeader title={policy.title} mode="back" />}
      padded={false}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator
      >
        <Text style={[styles.eyebrow, { color: c.textTertiary }]}>
          {(lang === 'en' ? 'Last updated · ' : 'Stand · ') + lastUpdatedLabel}
        </Text>
        <Text variant="title1" color="primary" weight="semibold" style={styles.title}>
          {policy.title}
        </Text>
        <Text variant="footnote" color="secondary" style={styles.subtitle}>
          {policy.subtitle}
        </Text>

        <View
          style={[
            styles.card,
            { backgroundColor: c.surface, borderColor: c.borderDefault },
          ]}
        >
          {policy.body.map((block, i) => {
            if (block.kind === 'h') {
              return (
                <Text
                  key={i}
                  variant="callout"
                  color="primary"
                  weight="semibold"
                  style={{ ...styles.h, ...(i === 0 ? styles.hFirst : null) }}
                >
                  {block.text}
                </Text>
              )
            }
            if (block.kind === 'ul') {
              return (
                <View key={i} style={styles.ul}>
                  {block.items.map((item, idx) => (
                    <View key={idx} style={styles.li}>
                      <View
                        style={[styles.bulletDot, { backgroundColor: c.primary }]}
                      />
                      <Text variant="footnote" color="primary" style={styles.liText}>
                        {item}
                      </Text>
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

        <Text style={[styles.footer, { color: c.textTertiary }]}>
          {lang === 'en'
            ? `Questions? Email kontakt@anstoss.io.`
            : `Fragen? Schreib uns an kontakt@anstoss.io.`}
        </Text>
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  // `flex: 1` is critical so the ScrollView fills the parent View body
  // returned by Screen — without it the inner content sizes to its
  // natural height and the page can't scroll past the visible viewport.
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space['2xl'],
  },
  eyebrow: {
    fontFamily: fonts.label,
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  title: { letterSpacing: -0.3 },
  subtitle: { marginTop: 6, marginBottom: space.md, lineHeight: 20 },

  card: {
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
    gap: 8,
  },

  h: { marginTop: space.md, letterSpacing: -0.1 },
  hFirst: { marginTop: 0 },
  p: { lineHeight: 22 },
  ul: { gap: 6, paddingLeft: 2, marginTop: 4 },
  li: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  bulletDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 9,
  },
  liText: { flex: 1, lineHeight: 22 },

  footer: {
    marginTop: space.md,
    textAlign: 'center',
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 18,
  },
})