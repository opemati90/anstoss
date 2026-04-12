import React from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { useClubColors } from '../../context/ClubThemeContext'
import { hairline, space } from '../../theme/tokens'
import { Haptics } from '../../utils/haptics'
import { Icon, type IconName } from './Icon'
import { Text } from './Text'

/**
 * Horizontally scrollable pill-chip row for multi-select filter UIs.
 * Use when the filter set is 3+ and a SegmentedControl doesn't fit, or
 * when multi-select is required. Each chip uses the `tinted` variant
 * when selected (club-primary-light background, club-primary label).
 *
 * Example:
 *   <FilterChipRow
 *     chips={[
 *       { key: 'training', label: 'Training', icon: 'figure.soccer' },
 *       { key: 'match',    label: 'Match',    icon: 'flag.fill'     },
 *       { key: 'other',    label: 'Other'                           },
 *     ]}
 *     selected={selectedKeys}
 *     onToggle={toggle}
 *   />
 */
export interface FilterChip<T extends string = string> {
  key: T
  label: string
  icon?: IconName
  count?: number
  testID?: string
}

export interface FilterChipRowProps<T extends string = string> {
  chips: FilterChip<T>[]
  selected: T[] | T | null
  onToggle: (key: T) => void
  /**
   * When true, only a single chip can be selected at a time — acts like
   * a wrapped SegmentedControl for cases where the set is too wide.
   */
  singleSelect?: boolean
  style?: StyleProp<ViewStyle>
  contentStyle?: StyleProp<ViewStyle>
  testID?: string
}

export function FilterChipRow<T extends string = string>({
  chips,
  selected,
  onToggle,
  singleSelect,
  style,
  contentStyle,
  testID,
}: FilterChipRowProps<T>) {
  const c = useClubColors()
  const selectedSet = React.useMemo(() => {
    if (selected == null) return new Set<T>()
    if (Array.isArray(selected)) return new Set(selected)
    return new Set<T>([selected])
  }, [selected])

  const handlePress = (key: T) => {
    Haptics.select()
    onToggle(key)
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.content, contentStyle]}
      style={style}
      testID={testID}
      accessibilityRole={singleSelect ? 'tablist' : undefined}
    >
      {chips.map((chip) => {
        const isActive = selectedSet.has(chip.key)
        const bg = isActive ? c.clubPrimaryLight : 'transparent'
        const fgColor = isActive ? c.clubPrimary : c.textSecondary
        const borderColor = isActive ? 'transparent' : c.border
        return (
          <Pressable
            key={chip.key}
            onPress={() => handlePress(chip.key)}
            testID={chip.testID}
            accessibilityRole={singleSelect ? 'tab' : 'button'}
            accessibilityState={{ selected: isActive }}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: bg,
                borderColor,
              },
              pressed && { opacity: 0.75 },
            ]}
          >
            {chip.icon ? (
              <Icon name={chip.icon} size="sm" color={fgColor} />
            ) : null}
            <Text
              variant="subheadline"
              weight={isActive ? 'semibold' : 'medium'}
              color={fgColor}
              numberOfLines={1}
            >
              {chip.label}
            </Text>
            {typeof chip.count === 'number' ? (
              <View
                style={[
                  styles.countPill,
                  {
                    backgroundColor: isActive
                      ? c.clubPrimary
                      : c.textTertiary,
                  },
                ]}
              >
                <Text
                  variant="caption2"
                  weight="bold"
                  color="inverse"
                  tabular
                >
                  {chip.count}
                </Text>
              </View>
            ) : null}
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

const CHIP_HEIGHT = 34

const styles = StyleSheet.create({
  content: {
    gap: space.xs,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  chip: {
    height: CHIP_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    borderRadius: CHIP_HEIGHT / 2,
    borderWidth: hairline,
  },
  countPill: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
})
