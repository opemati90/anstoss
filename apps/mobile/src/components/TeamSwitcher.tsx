import { useRef, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Animated,
  Dimensions,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { useClubColors } from '../context/ClubThemeContext'
import { neutralColors, radius, space, fontSize, fonts } from '../theme/tokens'

const SCREEN_HEIGHT = Dimensions.get('window').height

interface TeamSwitcherProps {
  visible: boolean
  onClose: () => void
}

export function TeamSwitcher({ visible, onClose }: TeamSwitcherProps) {
  const { t } = useTranslation()
  const { activeTeamId, teamsForActiveClub, setActiveTeam } = useAuth()
  const theme = useClubColors()
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
          style={[styles.sheet, { transform: [{ translateY }] }]}
        >
          <Pressable>
            <View style={styles.handle} />
            <Text style={styles.title}>{t('teamSwitcher.title')}</Text>

            {teamsForActiveClub.map((tm) => {
              const isActive = tm.team.id === activeTeamId
              return (
                <Pressable
                  key={tm.team.id}
                  style={[
                    styles.teamRow,
                    isActive && {
                      backgroundColor: theme.clubPrimaryLight,
                      borderColor: theme.clubPrimary,
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
                        isActive && { color: theme.clubPrimary },
                      ]}
                    >
                      {tm.team.displayName || tm.team.name}
                    </Text>
                    {tm.team.ageGroup ? (
                      <Text style={styles.teamMeta}>{tm.team.ageGroup}</Text>
                    ) : null}
                    <Text style={styles.teamRole}>
                      {t(`teamRoles.${tm.role}`)}
                    </Text>
                  </View>

                  {isActive ? (
                    <View style={styles.activeIndicator}>
                      <Ionicons
                        name="checkmark-circle"
                        size={22}
                        color={theme.clubPrimary}
                      />
                      <Text
                        style={[
                          styles.activeLabel,
                          { color: theme.clubPrimary },
                        ]}
                      >
                        {t('teamSwitcher.current')}
                      </Text>
                    </View>
                  ) : (
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={neutralColors.textTertiary}
                    />
                  )}
                </Pressable>
              )
            })}
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
    backgroundColor: neutralColors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingBottom: space['2xl'],
    paddingHorizontal: space.md,
    maxHeight: SCREEN_HEIGHT * 0.6,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: space['2xs'],
    backgroundColor: neutralColors.border,
    alignSelf: 'center',
    marginTop: space.sm,
    marginBottom: space.md,
  },
  title: {
    fontSize: fontSize.lg,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
    marginBottom: space.md,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 64,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: neutralColors.border,
    marginBottom: space.sm,
  },
  teamInfo: {
    flex: 1,
    gap: space['2xs'],
  },
  teamName: {
    fontSize: fontSize.md,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
  },
  teamMeta: {
    fontSize: fontSize.xs,
    fontFamily: fonts.label,
    color: neutralColors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  teamRole: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    color: neutralColors.textSecondary,
  },
  activeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  activeLabel: {
    fontSize: fontSize.xs,
    fontFamily: fonts.heading,
  },
})
