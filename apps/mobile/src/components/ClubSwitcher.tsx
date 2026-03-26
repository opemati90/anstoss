import { useRef, useEffect } from 'react'
import {
  View,
  Text,
  Image,
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
import { neutralColors, radius, space, fontSize, fontWeight } from '../theme/tokens'

const SCREEN_HEIGHT = Dimensions.get('window').height

interface ClubSwitcherProps {
  visible: boolean
  onClose: () => void
}

export function ClubSwitcher({ visible, onClose }: ClubSwitcherProps) {
  const { t } = useTranslation()
  const { memberships, activeClub, setActiveClub } = useAuth()
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

  const handleSelect = (membership: typeof memberships[number]) => {
    setActiveClub(membership)
    onClose()
  }

  if (memberships.length <= 1) return null

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
            <Text style={styles.title}>{t('clubSwitcher.title')}</Text>

            {memberships.map((m) => {
              const isActive = m.club.id === activeClub?.club.id
              return (
                <Pressable
                  key={m.club.id}
                  style={[
                    styles.clubRow,
                    isActive && {
                      backgroundColor: theme.clubPrimaryLight,
                      borderColor: theme.clubPrimary,
                    },
                  ]}
                  onPress={() => handleSelect(m)}
                >
                  <View style={styles.clubInfo}>
                    {m.club.badgeUrl ? (
                      <Image
                        source={{ uri: m.club.badgeUrl }}
                        style={styles.badge}
                      />
                    ) : (
                      <View
                        style={[
                          styles.badgePlaceholder,
                          { backgroundColor: m.club.primaryColor },
                        ]}
                      >
                        <Text style={styles.badgeInitial}>
                          {m.club.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={styles.clubText}>
                      <Text
                        style={[
                          styles.clubName,
                          isActive && { color: theme.clubPrimary },
                        ]}
                        numberOfLines={1}
                      >
                        {m.club.name}
                      </Text>
                      <Text style={styles.clubRole}>
                        {t(`roles.${m.role}`)}
                      </Text>
                    </View>
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
                        {t('clubSwitcher.current')}
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
    paddingBottom: 40,
    paddingHorizontal: space.md,
    maxHeight: SCREEN_HEIGHT * 0.6,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: neutralColors.border,
    alignSelf: 'center',
    marginTop: space.sm,
    marginBottom: space.md,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: neutralColors.textPrimary,
    marginBottom: space.md,
  },
  clubRow: {
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
  clubInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  badge: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
  },
  badgePlaceholder: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeInitial: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: neutralColors.textInverse,
  },
  clubText: {
    flex: 1,
    gap: 2,
  },
  clubName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: neutralColors.textPrimary,
  },
  clubRole: {
    fontSize: fontSize.sm,
    color: neutralColors.textSecondary,
  },
  activeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  activeLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
})
