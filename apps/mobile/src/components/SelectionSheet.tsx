import { Dimensions, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useClubColors } from '../context/ClubThemeContext'
import { BottomSheet, Icon } from './ui'
import { Text } from './ui/Text'
import {
  hairline,
  SPACING_LG,
  SPACING_MD,
  SPACING_SM,
  RADIUS_CARD,
  SPACING_XXS,
} from '../theme/tokens'

const SCREEN_HEIGHT = Dimensions.get('window').height

export type SelectionSheetOption<T extends string> = {
  label: string
  value: T
  description?: string
}

type SelectionSheetProps<T extends string> = {
  visible: boolean
  title: string
  description?: string
  options: SelectionSheetOption<T>[]
  selectedValue: T
  onSelect: (value: T) => void
  onClose: () => void
}

export function SelectionSheet<T extends string>({
  visible,
  title,
  description,
  options,
  selectedValue,
  onSelect,
  onClose,
}: SelectionSheetProps<T>) {
  const c = useClubColors()

  return (
    <BottomSheet visible={visible} onClose={onClose} heightPct="auto">
      <View style={styles.body}>
        <Text variant="title3" weight="bold" color="primary">
          {title}
        </Text>
        {description ? (
          <Text variant="footnote" color="secondary" style={styles.description}>
            {description}
          </Text>
        ) : null}

        <ScrollView
          style={[
            styles.card,
            { maxHeight: SCREEN_HEIGHT * 0.5, backgroundColor: c.surface, borderColor: c.borderSubtle },
          ]}
          bounces={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.options}
        >
          {options.map((option, index) => {
            const isSelected = option.value === selectedValue

            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                style={[
                  styles.option,
                  index > 0 && { borderTopWidth: hairline, borderTopColor: c.borderSubtle },
                  isSelected && { backgroundColor: c.surfaceSunken },
                ]}
                onPress={() => {
                  onSelect(option.value)
                  onClose()
                }}
              >
                <View style={styles.optionCopy}>
                  <Text variant="body" color="primary">
                    {option.label}
                  </Text>
                  {option.description ? (
                    <Text variant="footnote" color="secondary">
                      {option.description}
                    </Text>
                  ) : null}
                </View>

                <Icon
                  name={isSelected ? 'checkmark.circle.fill' : 'circle'}
                  size="lg"
                  color={isSelected ? c.primary : c.textTertiary}
                />
              </Pressable>
            )
          })}
        </ScrollView>
      </View>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  body: {
    paddingTop: SPACING_SM,
    paddingBottom: SPACING_SM,
  },
  description: {
    marginTop: SPACING_SM,
  },
  card: {
    marginTop: SPACING_LG,
    borderWidth: hairline,
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  options: {},
  option: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_MD,
    paddingVertical: SPACING_MD,
    paddingHorizontal: SPACING_LG,
  },
  optionCopy: {
    flex: 1,
    gap: SPACING_XXS,
  },
})
