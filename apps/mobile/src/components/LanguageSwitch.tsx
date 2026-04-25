import { Modal, Pressable, StyleSheet, View } from 'react-native'
import { useClubColors } from '../context/ClubThemeContext'
import {
  BUTTON_HEIGHT_MD,
  hairline,
  RADIUS_FULL,
  RADIUS_LG,
  SPACING_LG,
  SPACING_MD,
  SPACING_SM,
} from '../theme/tokens'
import { Text } from './ui/Text'
import { Icon } from './ui'
import { getLanguageLabel, type AppLanguage } from '../i18n'
import { useState } from 'react'

type Props = {
  value: AppLanguage
  onChange: (language: AppLanguage) => void
}

const OPTIONS: Array<{ code: AppLanguage; label: string }> = [
  { code: 'de', label: 'DE' },
  { code: 'en', label: 'EN' },
  { code: 'fr', label: 'FR' },
  { code: 'pt', label: 'PT' },
  { code: 'it', label: 'IT' },
]

export function LanguageSwitch({ value, onChange }: Props) {
  const c = useClubColors()
  const [isOpen, setIsOpen] = useState(false)
  const activeOption = OPTIONS.find((option) => option.code === value) || OPTIONS[0]

  return (
    <>
      <Pressable
        style={[
          styles.trigger,
          { borderColor: c.borderDefault, backgroundColor: c.surface },
        ]}
        onPress={() => setIsOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Language: ${getLanguageLabel(activeOption.code)}`}
      >
        <Text variant="caption1" color="secondary" tracking="wide">
          {activeOption.label}
        </Text>
        <Text variant="subheadline" color="primary" weight="medium">
          {getLanguageLabel(activeOption.code)}
        </Text>
      </Pressable>

      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsOpen(false)}
      >
        <Pressable
          style={[styles.scrim, { backgroundColor: c.surfaceOverlay }]}
          onPress={() => setIsOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Close language selector"
        >
          <Pressable
            style={[
              styles.sheet,
              { borderColor: c.borderDefault, backgroundColor: c.surface },
            ]}
          >
            {OPTIONS.map((option) => {
              const isActive = option.code === value

              return (
                <Pressable
                  key={option.code}
                  onPress={() => {
                    setIsOpen(false)
                    onChange(option.code)
                  }}
                  style={[
                    styles.option,
                    isActive && { backgroundColor: c.surfaceSunken },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={getLanguageLabel(option.code)}
                >
                  <View style={styles.optionCopy}>
                    <Text
                      variant="caption1"
                      color={isActive ? 'primary' : 'secondary'}
                      tracking="wide"
                    >
                      {option.label}
                    </Text>
                    <Text variant="subheadline" color="primary" weight="medium">
                      {getLanguageLabel(option.code)}
                    </Text>
                  </View>
                  {isActive ? (
                    <Icon name="checkmark" size="sm" color={c.primary} />
                  ) : null}
                </Pressable>
              )
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  trigger: {
    minHeight: BUTTON_HEIGHT_MD,
    paddingHorizontal: SPACING_MD,
    paddingVertical: SPACING_SM,
    borderRadius: RADIUS_FULL,
    borderWidth: hairline,
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING_SM,
  },
  scrim: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 88,
    paddingRight: SPACING_LG,
  },
  sheet: {
    width: 196,
    borderRadius: RADIUS_LG,
    borderWidth: hairline,
    overflow: 'hidden',
  },
  option: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING_MD,
    paddingVertical: SPACING_SM,
  },
  optionCopy: {
    gap: 2,
  },
})
