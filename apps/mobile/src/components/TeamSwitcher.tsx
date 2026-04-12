import { useRef, useEffect } from 'react'
import {
  View,
  Text,
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
import { radius, space, fontSize, fonts,
  hairline } from '../theme/tokens'

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
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close team switcher">
        <Animated.View
          style={[styles.sheet, { backgroundColor: c.surface, transform: [{ translateY }] }]}
        >
          <Pressable>
            <View style={[styles.handle, { backgroundColor: c.border }]} />
            <Text style={[styles.title, { color: c.textPrimary }]}>{t('teamSwitcher.title')}</Text>

            <ScrollView style={{ maxHeight: SCREEN_HEIGHT * 0.55 }} bounces={false} showsVerticalScrollIndicator={false}>
            {teamsForActiveClub.map((tm) => {
              const isActive = tm.team.id === activeTeamId
              return (
                <Pressable
                  key={tm.team.id}
                  style={[
                    styles.teamRow,
                    { borderColor: c.border },
                    isActive && {
                      backgroundColor: c.clubPrimaryLight,
                      borderColor: c.clubPrimary,
                    },
                  ]}
                  onPress={() => handleSelect(tm.team.id)}
                  accessibilityRole="button"
                  accessibilityLabel={tm.team.displayName || tm.team.name}
                >
                  <View style={styles.teamInfo}>
                    <Text
                      style={[
                        styles.teamName,
                        { color: c.textPrimary },
                        isActive && { color: c.clubPrimary },
                      ]}
                    >
                      {tm.team.displayName || tm.team.name}
                    </Text>
                    {tm.team.ageGroup ? (
                      <Text style={[styles.teamMeta, { color: c.textTertiary }]}>{tm.team.ageGroup}</Text>
                    ) : null}
                    <Text style={[styles.teamRole, { color: c.textSecondary }]}>
                      {t(`teamRoles.${tm.role}`)}
                    </Text>
                  </View>

                  {isActive ? (
                    <View style={styles.activeIndicator}>
                      <Icon
                        name="checkmark.circle.fill"
                        size="lg"
                        color={c.clubPrimary}
                      />
                      <Text
                        style={[
                          styles.activeLabel,
                          { color: c.clubPrimary },
                        ]}
                      >
                        {t('teamSwitcher.current')}
                      </Text>
                    </View>
                  ) : (
                    <Icon
                      name="chevron.right"
                      size="md"
                      color={c.textTertiary}
                    />
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
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingBottom: space['2xl'],
    paddingHorizontal: space.lg,
    maxHeight: SCREEN_HEIGHT * 0.75,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: space['2xs'],
    alignSelf: 'center',
    marginTop: space.sm,
    marginBottom: space.lg,
  },
  title: {
    fontSize: fontSize.lg,
    fontFamily: fonts.heading,
    marginBottom: space.md,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 72,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
    marginBottom: space.md,
  },
  teamInfo: {
    flex: 1,
    gap: space['2xs'],
  },
  teamName: {
    fontSize: fontSize.md,
    fontFamily: fonts.heading,
  },
  teamMeta: {
    fontSize: fontSize.xs,
    fontFamily: fonts.label,
    letterSpacing: 0.2,
  },
  teamRole: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
  },
  activeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  activeLabel: {
    fontSize: fontSize.xs,
    fontFamily: fonts.label,
  },
})
