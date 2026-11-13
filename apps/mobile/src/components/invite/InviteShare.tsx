import { Pressable, StyleSheet, View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import { useTranslation } from 'react-i18next'
import { Button, Icon, SoftIcon, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { HeaderTextButton, OnboardingScreen } from '../../onboarding/ui'
import type { OnboardingProgress } from '../../onboarding/steps'
import { QR_BACKGROUND, QR_FOREGROUND } from '../../theme/colors'
import { RADIUS_CARD, SPACING_MD, SPACING_XS, hairline, space } from '../../theme/tokens'

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
        <Button
          label={t('invite.board.share')}
          variant="accent"
          size="lg"
          disabled={!code}
          leftIcon={<Icon name="square.and.arrow.up" size={18} color={c.onAccent} />}
          onPress={onShare}
          style={styles.action}
          testID="invite-share-button"
        />
        <Button
          label={copied ? t('invite.board.copied') : t('invite.board.copy')}
          variant="bordered"
          size="lg"
          disabled={!code}
          leftIcon={<Icon name={copied ? 'checkmark' : 'link'} size={18} color={c.textPrimary} />}
          onPress={onCopy}
          style={styles.action}
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

const QR_SIZE = 126

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
  action: { flex: 1 },
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
