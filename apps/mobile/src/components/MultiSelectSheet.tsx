import { useEffect, useRef, useState } from 'react'
import {
  Animated,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import {
  fontSize,
  fontWeight,
  neutralColors,
  radius,
  space,
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
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current
  const [draftValues, setDraftValues] = useState<T[]>(selectedValues)

  useEffect(() => {
    if (!visible) {
      translateY.stopAnimation()
      translateY.setValue(SCREEN_HEIGHT)
      return
    }

    setDraftValues(selectedValues)
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      damping: 20,
      stiffness: 220,
    }).start()
  }, [selectedValues, translateY, visible])

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
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Animated.View
          style={[styles.sheet, { transform: [{ translateY }] }]}
        >
          <Pressable>
            <View style={styles.handle} />
            <Text style={styles.title}>{title}</Text>
            {description ? (
              <Text style={styles.description}>{description}</Text>
            ) : null}

            <ScrollView
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
                      index === options.length - 1 && styles.optionLast,
                      isSelected && styles.optionSelected,
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
                        style={[
                          styles.optionLabel,
                          option.disabled && styles.optionLabelDisabled,
                        ]}
                      >
                        {option.label}
                      </Text>
                      {option.description ? (
                        <Text style={styles.optionDescription}>
                          {option.description}
                        </Text>
                      ) : null}
                    </View>

                    <Ionicons
                      name={
                        isSelected
                          ? 'checkmark-circle'
                          : option.disabled
                            ? 'remove-circle-outline'
                            : 'ellipse-outline'
                      }
                      size={22}
                      color={
                        option.disabled
                          ? neutralColors.textTertiary
                          : isSelected
                            ? neutralColors.textPrimary
                            : neutralColors.textTertiary
                      }
                    />
                  </Pressable>
                )
              })}
            </ScrollView>

            <TouchableOpacity
              style={styles.saveButton}
              onPress={() => {
                onSave(draftValues)
                onClose()
              }}
            >
              <Text style={styles.saveButtonText}>{saveLabel}</Text>
            </TouchableOpacity>
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
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    maxHeight: SCREEN_HEIGHT * 0.72,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    backgroundColor: neutralColors.surface,
    paddingHorizontal: space.md,
    paddingBottom: space.xl,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    marginTop: space.sm,
    marginBottom: space.md,
    borderRadius: radius.full,
    backgroundColor: neutralColors.border,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: neutralColors.textPrimary,
  },
  description: {
    marginTop: space.xs,
    marginBottom: space.md,
    fontSize: fontSize.sm,
    lineHeight: 20,
    color: neutralColors.textSecondary,
  },
  options: {
    paddingBottom: space.sm,
  },
  option: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderTopWidth: 1,
    borderTopColor: neutralColors.border,
    paddingVertical: space.md,
  },
  optionLast: {
    borderBottomWidth: 1,
    borderBottomColor: neutralColors.border,
  },
  optionSelected: {
    backgroundColor: '#F7F7F4',
  },
  optionDisabled: {
    opacity: 0.65,
  },
  optionCopy: {
    flex: 1,
    gap: 2,
  },
  optionLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: neutralColors.textPrimary,
  },
  optionLabelDisabled: {
    color: neutralColors.textSecondary,
  },
  optionDescription: {
    fontSize: fontSize.sm,
    lineHeight: 20,
    color: neutralColors.textSecondary,
  },
  saveButton: {
    marginTop: space.md,
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: neutralColors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: neutralColors.textInverse,
  },
})
