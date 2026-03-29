import { useEffect, useRef } from 'react'
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
import { Ionicons } from '@expo/vector-icons'
import { neutralColors, radius, space, fontSize, fontWeight } from '../theme/tokens'

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
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current

  useEffect(() => {
    if (!visible) {
      translateY.stopAnimation()
      translateY.setValue(SCREEN_HEIGHT)
      return
    }

    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      damping: 20,
      stiffness: 220,
    }).start()
  }, [translateY, visible])

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
                const isSelected = option.value === selectedValue

                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="button"
                    style={[
                      styles.option,
                      index === options.length - 1 && styles.optionLast,
                      isSelected && styles.optionSelected,
                    ]}
                    onPress={() => {
                      onSelect(option.value)
                      onClose()
                    }}
                  >
                    <View style={styles.optionCopy}>
                      <Text style={styles.optionLabel}>{option.label}</Text>
                      {option.description ? (
                        <Text style={styles.optionDescription}>
                          {option.description}
                        </Text>
                      ) : null}
                    </View>

                    <Ionicons
                      name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                      size={22}
                      color={isSelected ? neutralColors.textPrimary : neutralColors.textTertiary}
                    />
                  </Pressable>
                )
              })}
            </ScrollView>
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
    maxHeight: SCREEN_HEIGHT * 0.62,
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
  optionCopy: {
    flex: 1,
    gap: 2,
  },
  optionLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: neutralColors.textPrimary,
  },
  optionDescription: {
    fontSize: fontSize.sm,
    lineHeight: 20,
    color: neutralColors.textSecondary,
  },
})
