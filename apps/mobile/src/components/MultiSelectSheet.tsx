import { useEffect, useRef, useState } from 'react'
import {
  Animated,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import { useClubColors } from '../context/ClubThemeContext'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { Icon } from './ui'
import { Text } from './ui/Text'
import {
  hairline,
  RADIUS_FULL,
  RADIUS_LG,
  SPACING_LG,
  SPACING_MD,
  SPACING_SM,
  SPACING_XL,
  SPACING_XS,
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
  const reduceMotion = useReducedMotion()
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current
  const [draftValues, setDraftValues] = useState<T[]>(selectedValues)

  useEffect(() => {
    if (!visible) {
      translateY.stopAnimation()
      translateY.setValue(SCREEN_HEIGHT)
      return
    }

    setDraftValues(selectedValues)

    if (reduceMotion) {
      translateY.setValue(0)
      return
    }

    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      damping: 20,
      stiffness: 220,
    }).start()
  }, [reduceMotion, selectedValues, translateY, visible])

  if (!visible) {
    return null
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        style={[styles.backdrop, { backgroundColor: c.surfaceOverlay }]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        <Animated.View
          style={[
            styles.sheet,
            { backgroundColor: c.surface, transform: [{ translateY }] },
          ]}
        >
          <Pressable accessible={false}>
            <View style={[styles.handle, { backgroundColor: c.borderStrong }]} />
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
                      if (option.disabled) {
                        return
                      }

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
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: SCREEN_HEIGHT * 0.75,
    borderTopLeftRadius: RADIUS_LG,
    borderTopRightRadius: RADIUS_LG,
    paddingHorizontal: SPACING_LG,
    paddingBottom: SPACING_XL,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    marginTop: SPACING_SM,
    marginBottom: SPACING_LG,
    borderRadius: RADIUS_FULL,
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
    gap: 2,
  },
  saveButton: {
    marginTop: SPACING_MD,
    minHeight: 48,
    borderRadius: RADIUS_LG,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
