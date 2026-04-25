import { useEffect, useRef } from 'react'
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
      <Pressable
        style={[styles.backdrop, { backgroundColor: c.surfaceOverlay }]}
        onPress={onClose}
      >
        <Animated.View
          style={[styles.sheet, { backgroundColor: c.surface, transform: [{ translateY }] }]}
        >
          <Pressable>
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
                const isSelected = option.value === selectedValue

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
  optionCopy: {
    flex: 1,
    gap: 2,
  },
})
