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
import {
  hairline,
  RADIUS_FULL,
  SPACING_SM,
  SPACING_XS,
  SPACING_MD,
  SPACING_XXS,
} from '../../theme/tokens'
import { Haptics } from '../../utils/haptics'
import { Icon, type IconName } from './Icon'
import { Text } from './Text'

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
        const bg = isActive ? c.primary50 : c.surface
        const fgColor = isActive ? c.primary : c.textSecondary
        const borderColor = isActive ? c.primary : c.borderDefault
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
              pressed && styles.pressed,
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
                      ? c.primary
                      : c.textTertiary,
                  },
                ]}
              >
                <Text
                  variant="caption2"
                  weight="bold"
                  color={c.textInverse}
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

const CHIP_HEIGHT = 44

const styles = StyleSheet.create({
  content: {
    gap: SPACING_SM,
    paddingHorizontal: SPACING_XXS,
    paddingVertical: SPACING_XXS,
  },
  chip: {
    minHeight: CHIP_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_XS,
    paddingHorizontal: SPACING_MD,
    borderRadius: RADIUS_FULL,
    borderCurve: 'continuous',
    borderWidth: hairline,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
  },
  countPill: {
    minWidth: 18,
    height: 18,
    // eslint-disable-next-line no-restricted-syntax -- TODO Pass 3 spacing
    borderRadius: 9,
    paddingHorizontal: SPACING_XS,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: SPACING_XXS,
  },
})
