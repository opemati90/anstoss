import { Pressable, StyleSheet, View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import { useTranslation } from 'react-i18next'
import { Button, Icon, SoftIcon, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { HeaderTextButton, OnboardingScreen } from '../../onboarding/ui'
import type { OnboardingProgress } from '../../onboarding/steps'
import { QR_BACKGROUND, QR_FOREGROUND } from '../../theme/colors'
import { RADIUS_CARD, RADIUS_FULL, SPACING_MD, SPACING_XS, hairline, space } from '../../theme/tokens'

export type InviteShareCode = {
  code: string
  link: string
  /** "1. Herren · gültig 14 Tage" */
  meta: string
}

export type InviteShareRow = {
  key: string
  icon: string
  title: string
  body?: string
  onPress: () => void
  testID?: string
}

/**
 * "Hol dein Team rein" (board 07): QR + team code card, Teilen (accent) and
 * Link kopieren, the optional ways to fill the squad, and Fertig.
 */
export function InviteShare({
  code,
  loading,
  emptyAction,
  progress,
  onBack,
  onLater,
  onShare,
  onCopy,
  copied,
  rows,
  onDone,
}: {
  code: InviteShareCode | null
  loading: boolean
  /** No code yet (admin without an active link): create one. */
  emptyAction?: { label: string; onPress: () => void; busy?: boolean } | null
  progress?: OnboardingProgress | null
  onBack: () => void
  onLater?: (() => void) | null
  onShare: () => void
  onCopy: () => void
  copied: boolean
  rows: InviteShareRow[]
  onDone: () => void
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  return (
    <OnboardingScreen
      title={t('invite.board.title')}
      subtitle={t('invite.board.subtitle')}
      progress={progress}
      onBack={onBack}
      headerRight={onLater ? <HeaderTextButton label={t('invite.board.later')} onPress={onLater} /> : undefined}
      primary={{ label: t('invite.board.done'), onPress: onDone, testID: 'invite-done' }}
      testID="invite-share"
    >
      <View style={[styles.card, { backgroundColor: c.surface }]} testID="invite-code-card">
        {code ? (
          <>
            <View
              accessible
              accessibilityRole="image"
              accessibilityLabel={t('invite.board.qrA11y')}
            >
              <QRCode
                value={code.link}
                size={QR_SIZE}
                color={QR_FOREGROUND}
                backgroundColor={QR_BACKGROUND}
              />
            </View>
            <Text variant="dataLarge" style={styles.code} selectable testID="invite-code">
              {code.code}
            </Text>
            <Text variant="footnote" color="secondary" align="center">
              {code.meta}
            </Text>
          </>
        ) : loading ? (
          <View style={styles.placeholder} />
        ) : emptyAction ? (
          <Button
            label={emptyAction.label}
            onPress={emptyAction.onPress}
            loading={emptyAction.busy}
            variant="bordered"
            testID="invite-create-code"
          />
        ) : (
          <Text variant="footnote" color="secondary" align="center">
            {t('invite.board.noCode')}
          </Text>
        )}
      </View>

      <View style={styles.actions}>
        <ActionPill
          label={t('invite.board.share')}
          icon="square.and.arrow.up"
          tone="accent"
          disabled={!code}
          onPress={onShare}
          testID="invite-share-button"
        />
        <ActionPill
          label={copied ? t('invite.board.copied') : t('invite.board.copy')}
          icon={copied ? 'checkmark' : 'link'}
          tone="outline"
          disabled={!code}
          onPress={onCopy}
          testID="invite-copy-link"
        />
      </View>

      <View style={[styles.group, { backgroundColor: c.surface }]}>
        {rows.map((row, index) => (
          <Pressable
            key={row.key}
            onPress={row.onPress}
            accessibilityRole="button"
            accessibilityLabel={row.body ? `${row.title}. ${row.body}` : row.title}
            android_ripple={{ color: c.borderDefault }}
            style={[
              styles.row,
              index < rows.length - 1 && {
                borderBottomColor: c.borderSubtle,
                borderBottomWidth: hairline,
              },
            ]}
            testID={row.testID}
          >
            <SoftIcon name={row.icon} />
            <View style={styles.rowCopy}>
              <Text variant="body" weight="semibold">
                {row.title}
              </Text>
              {row.body ? (
                <Text variant="caption1" weight="regular" color="secondary">
                  {row.body}
                </Text>
              ) : null}
            </View>
            <Icon name="chevron.right" size={18} color={c.textSecondary} />
          </Pressable>
        ))}
      </View>
    </OnboardingScreen>
  )
}

/** Board 07's half-width 52pt pills (Teilen / Link kopieren), 15/700. */
function ActionPill({
  label,
  icon,
  tone,
  disabled,
  onPress,
  testID,
}: {
  label: string
  icon: string
  tone: 'accent' | 'outline'
  disabled?: boolean
  onPress: () => void
  testID?: string
}) {
  const c = useClubColors()
  const fg = disabled ? c.textTertiary : tone === 'accent' ? c.onAccent : c.textPrimary
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.pill,
        tone === 'accent'
          ? { backgroundColor: disabled ? c.surfaceSunken : c.accent }
          : { borderWidth: 1, borderColor: c.borderStrong },
        pressed && styles.pressed,
      ]}
      testID={testID}
    >
      <Icon name={icon} size={18} color={fg} />
      <Text variant="body" weight="bold" color={fg} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  )
}

const QR_SIZE = 126
const PILL_HEIGHT = 52

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS_CARD + 4,
    borderCurve: 'continuous',
    padding: space.lg - 2,
    alignItems: 'center',
    gap: space.md,
  },
  placeholder: { width: QR_SIZE, height: QR_SIZE },
  code: { fontSize: 36, lineHeight: 40, letterSpacing: 5.8 },
  actions: { flexDirection: 'row', gap: SPACING_MD - 2 },
  pill: {
    flex: 1,
    height: PILL_HEIGHT,
    borderRadius: RADIUS_FULL,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING_XS * 2,
    paddingHorizontal: SPACING_MD,
  },
  pressed: { opacity: 0.85 },
  group: {
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
    paddingHorizontal: space.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_MD + 2,
    minHeight: 60,
    paddingVertical: SPACING_MD,
  },
  rowCopy: { flex: 1, minWidth: 0, gap: SPACING_XS / 2 },
})
