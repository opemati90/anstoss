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
import { useClubColors } from '../context/ClubThemeContext'
import { Icon } from './ui'
import { radius, space, fontSize, fonts, lineHeight,
  hairline } from '../theme/tokens'

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
          style={[styles.sheet, { backgroundColor: c.surface, transform: [{ translateY }] }]}
        >
          <Pressable>
            <View style={[styles.handle, { backgroundColor: c.border }]} />
            <Text style={[styles.title, { color: c.textPrimary }]}>{title}</Text>
            {description ? (
              <Text style={[styles.description, { color: c.textSecondary }]}>{description}</Text>
            ) : null}

            <ScrollView
              style={{ maxHeight: SCREEN_HEIGHT * 0.5 }}
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
                      { borderTopColor: c.border },
                      index === options.length - 1 && [styles.optionLast, { borderBottomColor: c.border }],
                      isSelected && { backgroundColor: c.background },
                    ]}
                    onPress={() => {
                      onSelect(option.value)
                      onClose()
                    }}
                  >
                    <View style={styles.optionCopy}>
                      <Text style={[styles.optionLabel, { color: c.textPrimary }]}>{option.label}</Text>
                      {option.description ? (
                        <Text style={[styles.optionDescription, { color: c.textSecondary }]}>
                          {option.description}
                        </Text>
                      ) : null}
                    </View>

                    <Icon
                      name={isSelected ? 'checkmark.circle.fill' : 'circle'}
                      size="lg"
                      color={isSelected ? c.textPrimary : c.textTertiary}
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
    backgroundColor: 'rgba(0,0,0,0.35)',
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
})
