import React from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native'
import { useClubColors } from '../../context/ClubThemeContext'
import { Icon } from './Icon'
import { Text } from './Text'
import {
  BUTTON_HEIGHT_MD,
  FONT_FAMILY_REGULAR,
  FONT_SIZE_BODY,
  hairline,
  RADIUS_FULL,
  RADIUS_SM,
  SPACING_LG,
  SPACING_MD,
  SPACING_XS,
} from '../../theme/tokens'

export interface SearchChip {
  id: string
  label: string
}

export interface SearchBarProps
  extends Omit<TextInputProps, 'style' | 'placeholderTextColor' | 'value' | 'onChangeText'> {
  value?: string
  onChangeText?: (text: string) => void
  placeholder?: string
  onFilterPress?: () => void
  containerStyle?: StyleProp<ViewStyle>
  chips?: SearchChip[]
  onRemoveChip?: (id: string) => void
  testID?: string
}

export function SearchBar({
  value,
  onChangeText,
  placeholder = 'Search',
  onFilterPress,
  containerStyle,
  chips,
  onRemoveChip,
  editable = true,
  testID,
  ...rest
}: SearchBarProps) {
  const c = useClubColors()
  const hasChips = !!chips && chips.length > 0

  return (
    <View
      style={[
        styles.inputContainer,
        {
          backgroundColor: c.surface,
          borderColor: c.borderDefault,
        },
        containerStyle,
      ]}
      accessibilityRole="search"
      testID={testID}
    >
      <Icon name="magnifyingglass" size="sm" color={c.textTertiary} />

      {hasChips ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsInnerContainer}
          style={styles.chipsScroll}
        >
          {chips!.map((chip) => (
            <Pressable
              key={chip.id}
              style={[styles.chip, { borderColor: c.primary }]}
              onPress={() => onRemoveChip?.(chip.id)}
              accessibilityRole="button"
              accessibilityLabel={`Remove filter ${chip.label}`}
            >
              <Text variant="footnote" color="tint" weight="medium">
                {chip.label}
              </Text>
              <Icon name="xmark" size="sm" color={c.primary} />
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <TextInput
        style={[styles.input, { color: c.textPrimary }]}
        placeholder={hasChips ? '' : placeholder}
        placeholderTextColor={c.textTertiary}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        accessibilityLabel={placeholder}
        {...rest}
      />

      {onFilterPress ? (
        <Pressable
          onPress={onFilterPress}
          accessibilityRole="button"
          accessibilityLabel="Open filters"
          hitSlop={8}
        >
          <Icon name="line.3.horizontal.decrease" size="md" color={c.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: hairline,
    borderRadius: RADIUS_FULL,
    paddingHorizontal: SPACING_LG,
    height: BUTTON_HEIGHT_MD,
    gap: SPACING_MD,
  },
  input: {
    flex: 1,
    fontSize: FONT_SIZE_BODY,
    fontFamily: FONT_FAMILY_REGULAR,
  },
  chipsScroll: {
    flexShrink: 1,
    flexGrow: 0,
  },
  chipsInnerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: RADIUS_SM - 3,
    borderWidth: 0.6,
    gap: SPACING_XS,
  },
})
