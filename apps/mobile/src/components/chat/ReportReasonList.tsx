import { Pressable, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { REPORT_REASONS, PLATFORM_ONLY_REPORT_REASONS, type ReportReason } from '@anstoss/shared'
import { useClubColors } from '../../context/ClubThemeContext'
import { hairline, radius, space } from '../../theme/tokens'
import * as Haptics from '../../utils/haptics'
import { Icon, Text } from '../ui'

type Props = {
  value: ReportReason | null
  onChange: (reason: ReportReason) => void
}

/**
 * The report reasons as radio rows (never an Alert: Android drops buttons).
 * Kinderschutz (SAFEGUARDING) says where it goes: straight to the platform
 * team, not to the club's moderators.
 */
export function ReportReasonList({ value, onChange }: Props) {
  const { t } = useTranslation()
  const c = useClubColors()
  return (
    <View
      style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderDefault }]}
      accessibilityRole="radiogroup"
    >
      {REPORT_REASONS.map((key, index) => {
        const selected = value === key
        const platformOnly = PLATFORM_ONLY_REPORT_REASONS.includes(key)
        return (
          <Pressable
            key={key}
            onPress={() => {
              Haptics.select()
              onChange(key)
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={t(`chatThread.report.reasons.${key}`)}
            accessibilityHint={platformOnly ? t('chatThread.report.safeguardingHint') : undefined}
            android_ripple={{ color: c.borderSubtle }}
            testID={`chat-report-reason-${key}`}
            style={({ pressed }) => [
              styles.reason,
              index > 0 && { borderTopWidth: hairline, borderTopColor: c.borderSubtle },
              pressed && { backgroundColor: c.surfaceSunken },
            ]}
          >
            <View style={styles.text}>
              <Text variant="body" color="primary">
                {t(`chatThread.report.reasons.${key}`)}
              </Text>
              {platformOnly ? (
                <Text variant="footnote" color="secondary">
                  {t('chatThread.report.safeguardingHint')}
                </Text>
              ) : null}
            </View>
            <Icon
              name={selected ? 'checkmark.circle.fill' : 'circle'}
              size={22}
              color={selected ? c.primary : c.textTertiary}
            />
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    overflow: 'hidden',
  },
  reason: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  text: { flex: 1, minWidth: 0, gap: space['2xs'] },
})
