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
  SPACING_XS,
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
        <Text variant="title3" color="primary">
          {title}
        </Text>
        {description ? (
          <Text variant="footnote" color="secondary" style={styles.description}>
            {description}
          </Text>
        ) : null}

        <ScrollView
          style={{ maxHeight: SCREEN_HEIGHT * 0.5 }}
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
                  { borderTopColor: c.borderSubtle },
                  index === options.length - 1 && [
                    styles.optionLast,
                    { borderBottomColor: c.borderSubtle },
                  ],
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
    paddingHorizontal: SPACING_LG,
    paddingTop: SPACING_SM,
  },
  description: {
    marginTop: SPACING_XS,
    marginBottom: SPACING_LG,
  },
  options: {
    paddingBottom: SPACING_SM,
  },
  option: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_MD,
    borderTopWidth: hairline,
    paddingVertical: SPACING_MD,
    paddingHorizontal: SPACING_SM,
  },
  optionLast: {
    borderBottomWidth: hairline,
  },
  optionDisabled: {
    opacity: 0.65,
  },
  optionCopy: {
    flex: 1,
    gap: SPACING_XXS,
  },
  saveButton: {
    marginTop: SPACING_MD,
    minHeight: 48,
    borderRadius: RADIUS_LG,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
