import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { router, useLocalSearchParams } from 'expo-router'
import { api, ApiError } from '../src/api/client'
import { useAuth } from '../src/context/AuthContext'
import { ModalHeader } from '../src/components/ModalHeader'
import {
  neutralColors,
  semanticColors,
  space,
  radius,
  fontSize,
  fontWeight,
} from '../src/theme/tokens'

type ClubLookupResult = {
  id: string
  name: string
  slug: string
  badgeUrl: string | null
  primaryColor: string
  teams: { id: string; name: string; displayName: string }[]
}

type RoleOption = 'PLAYER' | 'PARENT'

export default function JoinClubScreen() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const params = useLocalSearchParams<{ role?: string; slug?: string }>()
  const prefilledSlug = Array.isArray(params.slug) ? params.slug[0] : params.slug
  const normalizedPrefilledSlug = prefilledSlug?.trim().toLowerCase() || null
  const lockedRole =
    params.role === 'PLAYER' || params.role === 'PARENT'
      ? params.role
      : user?.registrationRole === 'PLAYER' || user?.registrationRole === 'PARENT'
        ? user.registrationRole
        : null

  const [slug, setSlug] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [club, setClub] = useState<ClubLookupResult | null>(null)
  const [lookupError, setLookupError] = useState<string | null>(null)

  const [selectedRole, setSelectedRole] = useState<RoleOption>(
    lockedRole || 'PLAYER',
  )
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const canRequestJoin =
    !!user &&
    (lockedRole !== null ||
      user.registrationRole === 'PLAYER' ||
      user.registrationRole === 'PARENT')

  const handleLookup = useCallback(async () => {
    if (!canRequestJoin) {
      return
    }

    const trimmed = slug.trim().toLowerCase()
    if (!trimmed) return

    setIsSearching(true)
    setLookupError(null)
    setClub(null)
    try {
      const result = await api<ClubLookupResult>(
        `/clubs/lookup?slug=${encodeURIComponent(trimmed)}`,
      )
      setClub(result)
      if (result.teams.length === 1) {
        setSelectedTeamId(result.teams[0].id)
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setLookupError(t('joinClub.notFound'))
      } else {
        setLookupError(t('joinClub.lookupError'))
      }
    } finally {
      setIsSearching(false)
    }
  }, [canRequestJoin, slug, t])

  useEffect(() => {
    if (
      !canRequestJoin ||
      !normalizedPrefilledSlug ||
      club ||
      isSearching ||
      slug.trim().toLowerCase() === normalizedPrefilledSlug
    ) {
      return
    }

    setSlug(normalizedPrefilledSlug)
  }, [canRequestJoin, club, isSearching, normalizedPrefilledSlug, slug])

  useEffect(() => {
    if (
      !canRequestJoin ||
      !normalizedPrefilledSlug ||
      club ||
      isSearching ||
      slug.trim().toLowerCase() !== normalizedPrefilledSlug
    ) {
      return
    }

    void handleLookup()
  }, [canRequestJoin, club, handleLookup, isSearching, normalizedPrefilledSlug, slug])

  const handleSubmit = async () => {
    if (!club) return

    setIsSubmitting(true)
    try {
      await api(`/clubs/${club.id}/join-requests`, {
        method: 'POST',
        body: {
          role: selectedRole,
          teamId: selectedTeamId || undefined,
          message: message.trim() || undefined,
        },
      })
      setSubmitted(true)
    } catch (error) {
      const msg =
        error instanceof ApiError && error.message
          ? error.message
          : t('common.error')
      Alert.alert(t('common.error'), msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!canRequestJoin) {
    return (
      <View style={styles.outer}>
        <ModalHeader title={t('joinClub.title')} />
        <View style={styles.successContainer}>
          <Text style={styles.successTitle}>
            {user ? t('joinClub.accessDeniedTitle') : t('auth.loginModeTitle')}
          </Text>
          <Text style={styles.successBody}>
            {user ? t('joinClub.accessDeniedBody') : t('auth.loginModeBody')}
          </Text>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: neutralColors.textPrimary }]}
            onPress={() => {
              if (user) {
                router.back()
                return
              }

              router.replace({
                pathname: '/(auth)/sign-in',
                params: normalizedPrefilledSlug
                  ? { joinClubSlug: normalizedPrefilledSlug }
                  : undefined,
              })
            }}
          >
            <Text style={styles.buttonText}>
              {user ? t('common.back') : t('auth.login')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  if (submitted) {
    return (
      <View style={styles.outer}>
        <ModalHeader />
        <View style={styles.successContainer}>
          <View style={[styles.successIcon, { backgroundColor: club?.primaryColor || neutralColors.textPrimary }]}>
            <Ionicons name="checkmark" size={32} color={neutralColors.textInverse} />
          </View>
          <Text style={styles.successTitle}>{t('joinClub.successTitle')}</Text>
          <Text style={styles.successBody}>
            {t('joinClub.successBody', { club: club?.name })}
          </Text>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: club?.primaryColor || neutralColors.textPrimary }]}
            onPress={() => router.back()}
          >
            <Text style={styles.buttonText}>{t('common.done')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.outer}>
      <ModalHeader title={t('joinClub.title')} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Step 1: Club lookup */}
        <Text style={styles.sectionTitle}>{t('joinClub.findClub')}</Text>
        <Text style={styles.sectionHint}>{t('joinClub.findClubHint')}</Text>

        <View style={styles.searchRow}>
          <TextInput
            testID="join-club-slug-input"
            style={styles.searchInput}
            value={slug}
            onChangeText={setSlug}
            placeholder={t('joinClub.slugPlaceholder')}
            placeholderTextColor={neutralColors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={handleLookup}
            returnKeyType="search"
          />
          <TouchableOpacity
            testID="join-club-lookup"
            style={[styles.searchButton, isSearching && styles.buttonDisabled]}
            onPress={handleLookup}
            disabled={isSearching || !slug.trim()}
          >
            {isSearching ? (
              <ActivityIndicator color={neutralColors.textInverse} size="small" />
            ) : (
              <Ionicons name="search" size={20} color={neutralColors.textInverse} />
            )}
          </TouchableOpacity>
        </View>

        {lookupError && (
          <Text style={styles.errorText}>{lookupError}</Text>
        )}

        {/* Club found — show details */}
        {club && (
          <>
            <View style={[styles.clubCard, { borderColor: club.primaryColor }]}>
              {club.badgeUrl ? (
                <Image source={{ uri: club.badgeUrl }} style={styles.clubBadge} />
              ) : (
                <View style={[styles.clubBadgePlaceholder, { backgroundColor: club.primaryColor }]}>
                  <Text style={styles.clubBadgeInitial}>
                    {club.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <Text style={styles.clubName}>{club.name}</Text>
            </View>

            {/* Role selection */}
            {!lockedRole ? (
              <>
                <Text style={[styles.sectionTitle, { marginTop: space.lg }]}>
                  {t('joinClub.selectRole')}
                </Text>
                <View style={styles.roleRow}>
                  {(['PLAYER', 'PARENT'] as const).map((role) => (
                    <TouchableOpacity
                      testID={`join-club-role-${role}`}
                      key={role}
                      style={[
                        styles.roleChip,
                        selectedRole === role && {
                          backgroundColor: club.primaryColor,
                          borderColor: club.primaryColor,
                        },
                      ]}
                      onPress={() => setSelectedRole(role)}
                    >
                      <Ionicons
                        name={role === 'PLAYER' ? 'football' : 'people'}
                        size={18}
                        color={
                          selectedRole === role
                            ? neutralColors.textInverse
                            : neutralColors.textSecondary
                        }
                      />
                      <Text
                        style={[
                          styles.roleChipText,
                          selectedRole === role && { color: neutralColors.textInverse },
                        ]}
                      >
                        {t(`roles.${role}`)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : (
              <View style={[styles.lockedRoleRow, { marginTop: space.lg }]}>
                <Text style={styles.lockedRoleLabel}>{t('joinClub.selectRole')}</Text>
                <View
                  style={[
                    styles.lockedRoleBadge,
                    {
                      borderColor: club.primaryColor,
                      backgroundColor: `${club.primaryColor}12`,
                    },
                  ]}
                >
                  <Text style={[styles.lockedRoleText, { color: club.primaryColor }]}>
                    {t(`roles.${selectedRole}`)}
                  </Text>
                </View>
              </View>
            )}

            {/* Team selection */}
            {club.teams.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { marginTop: space.lg }]}>
                  {t('joinClub.selectTeam')}
                </Text>
                <Text style={styles.sectionHint}>{t('joinClub.selectTeamHint')}</Text>
                <View style={styles.teamList}>
                  {club.teams.map((team) => (
                    <TouchableOpacity
                      testID={`join-club-team-${team.id}`}
                      key={team.id}
                      style={[
                        styles.teamChip,
                        selectedTeamId === team.id && { backgroundColor: club.primaryColor, borderColor: club.primaryColor },
                      ]}
                      onPress={() => setSelectedTeamId(selectedTeamId === team.id ? null : team.id)}
                    >
                      <Text
                        style={[
                          styles.teamChipText,
                          selectedTeamId === team.id && { color: neutralColors.textInverse },
                        ]}
                      >
                        {team.displayName || team.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* Optional message */}
            <Text style={[styles.sectionTitle, { marginTop: space.lg }]}>
              {t('joinClub.messageLabel')}
            </Text>
            <TextInput
              style={styles.messageInput}
              value={message}
              onChangeText={setMessage}
              placeholder={t('joinClub.messagePlaceholder')}
              placeholderTextColor={neutralColors.textTertiary}
              multiline
              maxLength={500}
              numberOfLines={3}
            />

            {/* Submit */}
            <TouchableOpacity
              testID="join-club-submit"
              style={[
                styles.button,
                { backgroundColor: club.primaryColor },
                isSubmitting && styles.buttonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color={neutralColors.textInverse} />
              ) : (
                <Text style={styles.buttonText}>{t('joinClub.submitRequest')}</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: neutralColors.background },
  scroll: { flex: 1 },
  content: { padding: space.lg },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: neutralColors.textPrimary,
    marginBottom: 4,
  },
  sectionHint: {
    fontSize: fontSize.sm,
    color: neutralColors.textSecondary,
    marginBottom: space.md,
    lineHeight: 20,
  },
  searchRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginBottom: space.md,
  },
  searchInput: {
    flex: 1,
    height: 52,
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    fontSize: fontSize.md,
    color: neutralColors.textPrimary,
    backgroundColor: neutralColors.surface,
  },
  searchButton: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: neutralColors.textPrimary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: fontSize.sm,
    color: semanticColors.error,
    marginBottom: space.md,
  },
  clubCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 2,
    backgroundColor: neutralColors.surface,
  },
  clubBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  clubBadgePlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clubBadgeInitial: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: neutralColors.textInverse,
  },
  clubName: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: neutralColors.textPrimary,
    flex: 1,
  },
  roleRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.sm,
  },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
  },
  roleChipText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: neutralColors.textPrimary,
  },
  lockedRoleRow: {
    gap: space.sm,
  },
  lockedRoleLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: neutralColors.textSecondary,
  },
  lockedRoleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.md,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  lockedRoleText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  teamList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.sm,
  },
  teamChip: {
    paddingHorizontal: space.md,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
  },
  teamChipText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: neutralColors.textPrimary,
  },
  messageInput: {
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: radius.md,
    padding: space.md,
    fontSize: fontSize.md,
    color: neutralColors.textPrimary,
    backgroundColor: neutralColors.surface,
    minHeight: 80,
    textAlignVertical: 'top',
    marginTop: space.sm,
  },
  button: {
    height: 52,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: space.lg,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: neutralColors.textInverse,
  },
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: space.lg,
  },
  successIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: space.lg,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: fontWeight.bold,
    color: neutralColors.textPrimary,
    textAlign: 'center',
    marginBottom: space.sm,
  },
  successBody: {
    fontSize: fontSize.md,
    color: neutralColors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: space.xl,
    paddingHorizontal: space.lg,
  },
})
