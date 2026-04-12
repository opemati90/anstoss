import { useEffect, useRef, useState } from 'react'
import {
  Animated,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useClubColors } from '../context/ClubThemeContext'
import { Icon } from './ui'
import {
  fontSize,
  fonts,
  lineHeight,
  radius,
  space,
  hairline,
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
      <Pressable
        style={[styles.backdrop, { backgroundColor: `${c.textPrimary}59` }]}
        onPress={onClose}
      >
        <Animated.View
          style={[
            styles.sheet,
            { backgroundColor: c.surface, transform: [{ translateY }] },
          ]}
        >
          <Pressable>
            <View
              style={[styles.handle, { backgroundColor: c.border }]}
            />
            <Text
              style={[
                styles.title,
                { color: c.textPrimary },
              ]}
            >
              {title}
            </Text>
            {description ? (
              <Text
                style={[
                  styles.description,
                  { color: c.textSecondary },
                ]}
              >
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
                      { borderTopColor: c.border },
                      index === options.length - 1 && [
                        styles.optionLast,
                        { borderBottomColor: c.border },
                      ],
                      isSelected && { backgroundColor: c.background },
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
                          { color: c.textPrimary },
                          option.disabled && { color: c.textSecondary },
                        ]}
                      >
                        {option.label}
                      </Text>
                      {option.description ? (
                        <Text
                          style={[
                            styles.optionDescription,
                            { color: c.textSecondary },
                          ]}
                        >
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
                            ? c.textPrimary
                            : c.textTertiary
                      }
                    />
                  </Pressable>
                )
              })}
            </ScrollView>

            <Pressable
              style={[
                styles.saveButton,
                { backgroundColor: c.textPrimary },
              ]}
              onPress={() => {
                onSave(draftValues)
                onClose()
              }}
            >
              <Text
                style={[
                  styles.saveButtonText,
                  { color: c.textInverse },
                ]}
              >
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
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: space.lg,
    paddingBottom: space.xl,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    marginTop: space.sm,
    marginBottom: space.lg,
    borderRadius: radius.full,
  },
  title: {
    fontSize: fontSize.lg,
    fontFamily: fonts.heading,
  },
  description: {
    marginTop: space.xs,
    marginBottom: space.lg,
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
  },
  options: {
    paddingBottom: space.sm,
  },
  option: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderTopWidth: hairline,
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
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
  optionLabel: {
    fontSize: fontSize.md,
    fontFamily: fonts.label,
  },
  optionDescription: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
  },
  saveButton: {
    marginTop: space.md,
    minHeight: 48,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    fontSize: fontSize.md,
    fontFamily: fonts.label,
  },
})
