import { useEffect, useState } from 'react'
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import { useClubColors } from '../context/ClubThemeContext'
import { BottomSheet, Icon } from './ui'
import { Text } from './ui/Text'
import {
  hairline,
  RADIUS_LG,
  SPACING_LG,
  SPACING_MD,
  SPACING_SM,
  RADIUS_CARD,
  SPACING_XXS,
} from '../theme/tokens'

const SCREEN_HEIGHT = Dimensions.get('window').height

export type MultiSelectSheetOption<T extends string> = {
  label: string
  value: T
  description?: string
  disabled?: boolean
}

type MultiSelectSheetProps<T extends string> = {
  visible: boolean
  title: string
  description?: string
  options: MultiSelectSheetOption<T>[]
  selectedValues: T[]
  onSave: (values: T[]) => void
  onClose: () => void
  saveLabel?: string
}

export function MultiSelectSheet<T extends string>({
  visible,
  title,
  description,
  options,
  selectedValues,
  onSave,
  onClose,
  saveLabel = 'Save',
}: MultiSelectSheetProps<T>) {
  const c = useClubColors()
  const [draftValues, setDraftValues] = useState<T[]>(selectedValues)

  useEffect(() => {
    if (visible) setDraftValues(selectedValues)
  }, [visible, selectedValues])

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
            const isSelected = draftValues.includes(option.value)

            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                style={[
                  styles.option,
                  index > 0 && { borderTopWidth: hairline, borderTopColor: c.borderSubtle },
                  isSelected && { backgroundColor: c.surfaceSunken },
                  option.disabled && styles.optionDisabled,
                ]}
                onPress={() => {
                  if (option.disabled) return
                  setDraftValues((current) =>
                    current.includes(option.value)
                      ? current.filter((value) => value !== option.value)
                      : [...current, option.value],
                  )
                }}
              >
                <View style={styles.optionCopy}>
                  <Text
                    variant="body"
                    color={option.disabled ? 'secondary' : 'primary'}
                  >
                    {option.label}
                  </Text>
                  {option.description ? (
                    <Text variant="footnote" color="secondary">
                      {option.description}
                    </Text>
                  ) : null}
                </View>

                <Icon
                  name={
                    isSelected
                      ? 'checkmark.circle.fill'
                      : option.disabled
                        ? 'minus.circle'
                        : 'circle'
                  }
                  size="lg"
                  color={
                    option.disabled
                      ? c.textTertiary
                      : isSelected
                        ? c.primary
                        : c.textTertiary
                  }
                />
              </Pressable>
            )
          })}
        </ScrollView>

        <Pressable
          style={[styles.saveButton, { backgroundColor: c.primary }]}
          onPress={() => {
            onSave(draftValues)
            onClose()
          }}
          accessibilityRole="button"
          accessibilityLabel={saveLabel}
        >
          <Text variant="headline" color="inverse" weight="bold">
            {saveLabel}
          </Text>
        </Pressable>
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
  optionDisabled: {
    opacity: 0.65,
  },
  optionCopy: {
    flex: 1,
    gap: SPACING_XXS,
  },
  saveButton: {
    marginTop: SPACING_LG,
    minHeight: 48,
    borderRadius: RADIUS_LG,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
