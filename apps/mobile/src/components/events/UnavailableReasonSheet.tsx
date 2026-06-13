import { Pressable, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { BottomSheet } from '../ui/BottomSheet'
import { Icon, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { hairline, radius, space } from '../../theme/tokens'

export interface UnavailableReasonSheetProps {
  visible: boolean
  onSelect: (reason: string) => void
  onSkip: () => void
  onClose: () => void
}

export function UnavailableReasonSheet({
  visible,
  onSelect,
  onSkip,
  onClose,
}: UnavailableReasonSheetProps) {
  const { t } = useTranslation()
  const c = useClubColors()

  const reasons = [
    { key: 'injury', label: t('event.rsvpReasons.injury') },
    { key: 'work', label: t('event.rsvpReasons.work') },
    { key: 'personal', label: t('event.rsvpReasons.personal') },
    { key: 'other', label: t('event.rsvpReasons.other') },
  ]

  return (
    <BottomSheet visible={visible} onClose={onClose} heightPct="auto">
      <View style={styles.container}>
        <Text variant="title2" weight="semibold" color="primary" style={styles.title}>
          {t('event.rsvpReasons.whyUnavailable')}
        </Text>

        <View
          style={[
            styles.listCard,
            { backgroundColor: c.surface, borderColor: c.borderDefault },
          ]}
        >
          {reasons.map((reason, idx) => (
            <Pressable
              key={reason.key}
              accessibilityRole="radio"
              accessibilityLabel={reason.label}
              onPress={() => onSelect(reason.label)}
              style={({ pressed }) => [
                styles.row,
                idx < reasons.length - 1 && {
                  borderBottomColor: c.borderDefault,
                  borderBottomWidth: hairline,
                },
                pressed && { opacity: 0.75 },
              ]}
            >
              <Text variant="body" color="primary" style={{ flex: 1 }}>
                {reason.label}
              </Text>
              <Icon name="chevron.right" size="sm" color="tertiary" />
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={onSkip}
          accessibilityRole="button"
          accessibilityLabel={t('event.rsvpReasons.skip')}
          style={({ pressed }) => [styles.skipButton, pressed && { opacity: 0.7 }]}
        >
          <Text variant="subheadline" weight="semibold" color="tertiary">
            {t('event.rsvpReasons.skip')}
          </Text>
        </Pressable>
      </View>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: space.md,
    paddingBottom: space.lg,
    gap: space.md,
  },
  title: {
    paddingBottom: space.xs,
  },
  listCard: {
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderWidth: hairline,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    minHeight: 52,
    gap: space.sm,
  },
  skipButton: {
    alignSelf: 'center',
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
  },
})
