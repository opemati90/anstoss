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
  /** Lay chips out in wrapping rows instead of one horizontal scroller. */
  wrap?: boolean
  style?: StyleProp<ViewStyle>
  contentStyle?: StyleProp<ViewStyle>
  testID?: string
}

export function FilterChipRow<T extends string = string>({
  chips,
  selected,
  onToggle,
  singleSelect,
  wrap,
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

  const Container = wrap ? WrapContainer : ScrollContainer
  return (
    <Container
      style={style}
      contentStyle={contentStyle}
      testID={testID}
      accessibilityRole={singleSelect ? 'tablist' : undefined}
    >
      {chips.map((chip) => {
        const isActive = selectedSet.has(chip.key)
        // Selected chips are solid ink; the rest are outlined on the page.
        const bg = isActive ? c.ink : 'transparent'
        const fgColor = isActive ? c.onInk : c.textPrimary
        const borderColor = isActive ? c.ink : c.borderStrong
        return (
          <Pressable
            key={chip.key}
            onPress={() => handlePress(chip.key)}
            hitSlop={4}
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
              weight="semibold"
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
                    backgroundColor: c.accent,
                  },
                ]}
              >
                <Text
                  variant="caption2"
                  weight="bold"
                  color={c.onAccent}
                  tabular
                >
                  {chip.count}
                </Text>
              </View>
            ) : null}
          </Pressable>
        )
      })}
    </Container>
  )
}

type ContainerProps = {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
  contentStyle?: StyleProp<ViewStyle>
  testID?: string
  accessibilityRole?: 'tablist'
}

function ScrollContainer({ children, style, contentStyle, testID, accessibilityRole }: ContainerProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.content, contentStyle]}
      style={style}
      testID={testID}
      accessibilityRole={accessibilityRole}
    >
      {children}
    </ScrollView>
  )
}

function WrapContainer({ children, style, contentStyle, testID, accessibilityRole }: ContainerProps) {
  return (
    <View
      style={[styles.content, styles.wrap, style, contentStyle]}
      testID={testID}
      accessibilityRole={accessibilityRole}
    >
      {children}
    </View>
  )
}

// 36pt visual pill; hitSlop on each chip brings the touch target to 44pt.
const CHIP_HEIGHT = 36

const styles = StyleSheet.create({
  content: {
    gap: SPACING_SM,
    paddingHorizontal: SPACING_XXS,
    paddingVertical: SPACING_XXS,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    minHeight: CHIP_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_XS,
    paddingHorizontal: SPACING_MD + 2,
    borderRadius: RADIUS_FULL,
    borderCurve: 'continuous',
    borderWidth: 1,
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
