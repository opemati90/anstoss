import { useRef, useEffect } from 'react'
import {
  View,
  ScrollView,
  StyleSheet,
  Modal,
  Pressable,
  Animated,
  Dimensions,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
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

interface TeamSwitcherProps {
  visible: boolean
  onClose: () => void
}

export function TeamSwitcher({ visible, onClose }: TeamSwitcherProps) {
  const { t } = useTranslation()
  const { activeTeamId, teamsForActiveClub, setActiveTeam } = useAuth()
  const c = useClubColors()
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current

  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200,
      }).start()
    } else {
      Animated.timing(translateY, {
        toValue: SCREEN_HEIGHT,
        duration: 200,
        useNativeDriver: true,
      }).start()
    }
  }, [visible, translateY])

  const handleSelect = (teamId: string) => {
    setActiveTeam(teamId)
    onClose()
  }

  if (teamsForActiveClub.length <= 1) return null

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
        accessibilityLabel="Close team switcher"
      >
        <Animated.View
          style={[
            styles.sheet,
            { backgroundColor: c.surface, transform: [{ translateY }] },
          ]}
        >
          <Pressable>
            <View style={[styles.handle, { backgroundColor: c.borderStrong }]} />
            <Text variant="title3" color="primary" style={styles.title}>
              {t('teamSwitcher.title')}
            </Text>

            <ScrollView
              style={{ maxHeight: SCREEN_HEIGHT * 0.55 }}
              bounces={false}
              showsVerticalScrollIndicator={false}
            >
              {teamsForActiveClub.map((tm) => {
                const isActive = tm.team.id === activeTeamId
                return (
                  <Pressable
                    key={tm.team.id}
                    style={[
                      styles.teamRow,
                      { borderColor: c.borderDefault },
                      isActive && {
                        backgroundColor: c.primary50,
                        borderColor: c.primary,
                      },
                    ]}
                    onPress={() => handleSelect(tm.team.id)}
                    accessibilityRole="button"
                    accessibilityLabel={tm.team.displayName || tm.team.name}
                  >
                    <View style={styles.teamInfo}>
                      <Text
                        variant="headline"
                        weight="bold"
                        style={{ color: isActive ? c.primary : c.textPrimary }}
                      >
                        {tm.team.displayName || tm.team.name}
                      </Text>
                      {tm.team.ageGroup ? (
                        <Text variant="caption1" color="tertiary" tracking="wide">
                          {tm.team.ageGroup}
                        </Text>
                      ) : null}
                      <Text variant="footnote" color="secondary">
                        {t(`teamRoles.${tm.role}`)}
                      </Text>
                    </View>

                    {isActive ? (
                      <View style={styles.activeIndicator}>
                        <Icon
                          name="checkmark.circle.fill"
                          size="lg"
                          color={c.primary}
                        />
                        <Text
                          variant="caption1"
                          weight="medium"
                          style={{ color: c.primary }}
                        >
                          {t('teamSwitcher.current')}
                        </Text>
                      </View>
                    ) : (
                      <Icon name="chevron.right" size="md" color={c.textTertiary} />
                    )}
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
    borderTopLeftRadius: RADIUS_LG,
    borderTopRightRadius: RADIUS_LG,
    paddingBottom: SPACING_XL,
    paddingHorizontal: SPACING_LG,
    maxHeight: SCREEN_HEIGHT * 0.75,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: RADIUS_FULL,
    alignSelf: 'center',
    marginTop: SPACING_SM,
    marginBottom: SPACING_LG,
  },
  title: {
    marginBottom: SPACING_MD,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 72,
    paddingHorizontal: SPACING_LG,
    paddingVertical: SPACING_MD,
    borderRadius: RADIUS_LG,
    borderWidth: hairline,
    marginBottom: SPACING_SM,
  },
  teamInfo: {
    flex: 1,
    gap: 2,
  },
  activeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_XS,
  },
})
