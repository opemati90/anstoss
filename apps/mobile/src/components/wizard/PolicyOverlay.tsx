/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useMemo } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { Icon, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import {
  POLICIES,
  POLICY_LAST_UPDATED,
  type PolicyKind,
} from '../../content/policies'
import { fonts, hairline, radius, space } from '../../theme/tokens'

export type PolicyOverlayProps = {
  visible: boolean
  kind: PolicyKind
  onClose: () => void
}

/**
 * In-onboarding policy reader. Renders the same content as the
 * `/policy/[kind]` screen but inside a modal so users can read it
 * before they've finished onboarding (the more-tab route requires an
 * authenticated session, which doesn't exist yet during signup).
 */
export function PolicyOverlay({ visible, kind, onClose }: PolicyOverlayProps) {
  const { i18n } = useTranslation()
  const insets = useSafeAreaInsets()
  const colors = useClubColors()
  const lang = (i18n.language || 'de').slice(0, 2) === 'en' ? 'en' : 'de'
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
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View
          style={[
            styles.header,
            { paddingTop: insets.top + space.sm, borderBottomColor: colors.borderDefault },
          ]}
        >
          <Text variant="title3" color="primary" weight="semibold" style={styles.headerTitle}>
            {policy.title}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            hitSlop={12}
            style={[styles.closeBtn, { backgroundColor: colors.surfaceSunken }]}
          >
            <Icon name="xmark" size={18} color={colors.textPrimary} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]}
          showsVerticalScrollIndicator
        >
          <Text style={[styles.eyebrow, { color: colors.textTertiary }]}>
            {(lang === 'en' ? 'Last updated · ' : 'Stand · ') + lastUpdatedLabel}
          </Text>
          <Text variant="footnote" color="secondary" style={styles.subtitle}>
            {policy.subtitle}
          </Text>

          <View
            style={[
              styles.card,
              { backgroundColor: colors.surface, borderColor: colors.borderDefault },
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
                        <View style={[styles.bulletDot, { backgroundColor: colors.primary }]} />
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
        </ScrollView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
    borderBottomWidth: hairline,
  },
  headerTitle: { flex: 1, letterSpacing: -0.2 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
  },
  eyebrow: {
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  subtitle: { marginBottom: space.md, lineHeight: 20 },
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
})
