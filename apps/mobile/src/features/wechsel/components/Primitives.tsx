import { Image, Pressable, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { TrialStage } from '@anstoss/shared'
import { useClubColors } from '../../../context/ClubThemeContext'
import { Icon, Text } from '../../../components/ui'
import { Skeleton } from '../../../components/Skeleton'
import {
  hairline,
  RADIUS_CARD,
  RADIUS_FULL,
  RADIUS_SM,
  SPACING_LG,
  SPACING_MD,
  SPACING_SM,
  SPACING_XS,
} from '../../../theme/tokens'
import { STAGES, stageLabel } from '../format'

/** Club crest, or initials on the club colour when no crest is uploaded. */
export function ClubBadge({
  name,
  badgeUrl,
  color,
  size = 40,
}: {
  name: string
  badgeUrl?: string | null
  color?: string | null
  size?: number
}) {
  const c = useClubColors()
  const initials = name
    .split(/\s+/)
    .filter((part) => part.length > 2 || /\d/.test(part))
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || name.slice(0, 2).toUpperCase()
  if (badgeUrl) {
    return (
      <Image
        source={{ uri: badgeUrl }}
        accessibilityIgnoresInvertColors
        style={[
          styles.badge,
          { width: size, height: size, borderColor: c.borderSubtle, backgroundColor: c.surface },
        ]}
      />
    )
  }
  return (
    <View
      style={[
        styles.badge,
        {
          width: size,
          height: size,
          backgroundColor: color || c.primary,
          borderColor: c.borderSubtle,
        },
      ]}
    >
      <Text variant="caption1" weight="bold" color="inverse">
        {initials}
      </Text>
    </View>
  )
}

/**
 * The trial pipeline as five tappable tiles with counts. Reads left to
 * right like the process itself; the selected stage carries the accent.
 */
export function StageStrip({
  counts,
  value,
  onChange,
}: {
  counts: Record<TrialStage, number>
  value: TrialStage
  onChange: (stage: TrialStage) => void
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  return (
    <View style={styles.strip} accessibilityRole="tablist">
      {STAGES.map((stage) => {
        const selected = stage === value
        const label = stageLabel(t, stage)
        return (
          <Pressable
            key={stage}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={t('probetraining.stageA11y', { stage: label, count: counts[stage] })}
            onPress={() => onChange(stage)}
            android_ripple={{ color: c.borderSubtle, foreground: true }}
            style={({ pressed }) => [
              styles.stageTile,
              {
                backgroundColor: selected ? c.primary50 : c.surface,
                borderColor: selected ? c.primary : c.borderDefault,
              },
              pressed && styles.pressed,
            ]}
          >
            <Text
              variant="title2"
              tabular
              color={selected ? c.primary : counts[stage] > 0 ? 'primary' : 'tertiary'}
            >
              {counts[stage]}
            </Text>
            <Text
              variant="footnote"
              weight={selected ? 'semibold' : 'medium'}
              color={selected ? c.primary : 'secondary'}
              numberOfLines={1}
            >
              {label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export function RatingStars({
  value,
  onChange,
  size = 28,
}: {
  value: number | null
  onChange?: (value: number) => void
  size?: number
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  return (
    <View style={styles.stars} accessibilityRole={onChange ? 'adjustable' : undefined}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = value != null && n <= value
        const star = (
          <Icon
            name={filled ? 'star.fill' : 'star'}
            size={size}
            color={filled ? c.primary : c.textTertiary}
          />
        )
        if (!onChange) return <View key={n}>{star}</View>
        return (
          <Pressable
            key={n}
            accessibilityRole="button"
            accessibilityLabel={t('probetraining.ratingA11y', { count: n })}
            accessibilityState={{ selected: value === n }}
            onPress={() => onChange(n)}
            android_ripple={{ color: c.borderSubtle, borderless: true }}
            hitSlop={4}
            style={styles.starButton}
          >
            {star}
          </Pressable>
        )
      })}
    </View>
  )
}

/** A skeleton that matches a list of cards, so loading never jumps. */
export function CardListSkeleton({ rows = 3 }: { rows?: number }) {
  const c = useClubColors()
  return (
    <View style={styles.skeletonList} accessibilityRole="progressbar">
      {Array.from({ length: rows }).map((_, index) => (
        <View
          key={index}
          style={[styles.skeletonCard, { backgroundColor: c.surface, borderColor: c.borderSubtle }]}
        >
          <View style={styles.skeletonRow}>
            <Skeleton shape="circle" width={40} height={40} />
            <View style={styles.skeletonText}>
              <Skeleton width="60%" height={16} />
              <Skeleton width="40%" height={12} />
            </View>
          </View>
          <Skeleton width="85%" height={12} />
        </View>
      ))}
    </View>
  )
}

/** Small uppercase-free section label with an optional count. */
export function SectionLabel({ title, count }: { title: string; count?: number }) {
  return (
    <View style={styles.sectionLabel}>
      <Text variant="headline" color="primary">
        {title}
      </Text>
      {typeof count === 'number' ? (
        <Text variant="subheadline" color="tertiary" tabular>
          {count}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: RADIUS_SM,
    borderCurve: 'continuous',
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  strip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING_SM,
  },
  stageTile: {
    flexGrow: 1,
    flexBasis: 96,
    minHeight: 64,
    overflow: 'hidden',
    paddingHorizontal: SPACING_MD,
    paddingVertical: SPACING_SM,
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
    borderWidth: hairline,
    justifyContent: 'center',
  },
  pressed: { transform: [{ scale: 0.97 }] },
  stars: { flexDirection: 'row', gap: SPACING_XS },
  starButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS_FULL,
  },
  skeletonList: { gap: SPACING_MD },
  skeletonCard: {
    padding: SPACING_LG,
    gap: SPACING_MD,
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
    borderWidth: hairline,
  },
  skeletonRow: { flexDirection: 'row', gap: SPACING_MD, alignItems: 'center' },
  skeletonText: { flex: 1, gap: SPACING_XS },
  sectionLabel: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: SPACING_SM,
    paddingTop: SPACING_SM,
  },
})
