import { useCallback, useEffect, useState } from 'react'
import { View, TextInput, Pressable, StyleSheet, Alert, Image } from 'react-native'
import { useTranslation } from 'react-i18next'
import { router, useLocalSearchParams } from 'expo-router'
import { api, ApiError } from '../src/api/client'
import { useAuth } from '../src/context/AuthContext'
import { ModalHeader } from '../src/components/ModalHeader'
import { Screen, Card, Button, Text, Icon } from '../src/components/ui'
import { useClubColors } from '../src/context/ClubThemeContext'
import { fontSize, fonts, lineHeight, radius, space, hairline } from '../src/theme/tokens'

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
  const c = useClubColors()
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

  const [selectedRole, setSelectedRole] = useState<RoleOption>(lockedRole || 'PLAYER')
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
    if (!canRequestJoin) return
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
      const msg = error instanceof ApiError && error.message ? error.message : t('common.error')
      Alert.alert(t('common.error'), msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!canRequestJoin) {
    return (
      <Screen header={<ModalHeader title={t('joinClub.title')} />} padded={false}>
        <View style={styles.center}>
          <Card padding="card" style={{ gap: space.sm }}>
            <Text style={[styles.title, { color: c.textPrimary }]}>
              {user ? t('joinClub.accessDeniedTitle') : t('auth.loginModeTitle')}
            </Text>
            <Text style={[styles.body, { color: c.textSecondary }]}>
              {user ? t('joinClub.accessDeniedBody') : t('auth.loginModeBody')}
            </Text>
            <Button
              label={user ? t('common.back') : t('auth.login')}
              variant="filled"
              size="lg"
              fullWidth
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
              style={{ marginTop: space.sm }}
            />
          </Card>
        </View>
      </Screen>
    )
  }

  if (submitted) {
    return (
      <Screen header={<ModalHeader />} padded={false}>
        <View style={styles.center}>
          <Card padding="card" style={{ gap: space.sm, alignItems: 'center' }}>
            <View
              style={[styles.successIcon, { backgroundColor: club?.primaryColor || c.clubPrimary }]}
            >
              <Icon name="checkmark" size="xl" color={c.textInverse} />
            </View>
            <Text style={[styles.title, { color: c.textPrimary, textAlign: 'center' }]}>
              {t('joinClub.successTitle')}
            </Text>
            <Text style={[styles.body, { color: c.textSecondary, textAlign: 'center' }]}>
              {t('joinClub.successBody', { club: club?.name })}
            </Text>
            <Button
              label={t('common.done')}
              variant="filled"
              size="lg"
              fullWidth
              onPress={() => router.back()}
              style={{ marginTop: space.sm }}
            />
          </Card>
        </View>
      </Screen>
    )
  }

  return (
    <Screen header={<ModalHeader title={t('joinClub.title')} />} scroll padded={false}>
      <View style={{ padding: space.lg, gap: space.md }}>
        <Card padding="card" style={{ gap: space.md }}>
          <View>
            <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>
              {t('joinClub.findClub')}
            </Text>
            <Text style={[styles.sectionHint, { color: c.textSecondary }]}>
              {t('joinClub.findClubHint')}
            </Text>
          </View>

          <View style={styles.searchRow}>
            <TextInput
              testID="join-club-slug-input"
              style={[
                styles.searchInput,
                {
                  backgroundColor: c.surface,
                  borderColor: c.border,
                  color: c.textPrimary,
                },
              ]}
              value={slug}
              onChangeText={setSlug}
              placeholder={t('joinClub.slugPlaceholder')}
              placeholderTextColor={c.textTertiary}
              accessibilityLabel={t('joinClub.slugPlaceholder')}
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={handleLookup}
              returnKeyType="search"
            />
            <Pressable
              testID="join-club-lookup"
              style={[
                styles.searchButton,
                {
                  backgroundColor: c.clubPrimary,
                  opacity: isSearching || !slug.trim() ? 0.5 : 1,
                },
              ]}
              onPress={handleLookup}
              disabled={isSearching || !slug.trim()}
              accessibilityRole="button"
              accessibilityLabel={t('joinClub.findClub')}
            >
              <Icon name="magnifyingglass" size="md" color={c.textInverse} />
            </Pressable>
          </View>

          {lookupError && <Text style={[styles.errorText, { color: c.error }]}>{lookupError}</Text>}
        </Card>

        {club && (
          <Card padding="card" style={{ gap: space.md }}>
            <View
              style={[
                styles.clubRow,
                { backgroundColor: c.surface, borderColor: club.primaryColor },
              ]}
            >
              {club.badgeUrl ? (
                <Image source={{ uri: club.badgeUrl }} style={styles.clubBadge} />
              ) : (
                <View style={[styles.clubBadgePlaceholder, { backgroundColor: club.primaryColor }]}>
                  <Text style={[styles.clubBadgeInitial, { color: c.textInverse }]}>
                    {club.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <Text style={[styles.clubName, { color: c.textPrimary }]}>{club.name}</Text>
            </View>

            {!lockedRole ? (
              <View style={{ gap: space.sm }}>
                <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>
                  {t('joinClub.selectRole')}
                </Text>
                <View style={styles.roleRow}>
                  {(['PLAYER', 'PARENT'] as const).map((role) => {
                    const selected = selectedRole === role
                    return (
                      <Pressable
                        testID={`join-club-role-${role}`}
                        key={role}
                        style={[
                          styles.roleChip,
                          {
                            backgroundColor: selected ? club.primaryColor : c.surface,
                            borderColor: selected ? club.primaryColor : c.border,
                          },
                        ]}
                        onPress={() => setSelectedRole(role)}
                        accessibilityRole="button"
                        accessibilityLabel={t(`roles.${role}`)}
                      >
                        <Icon
                          name={role === 'PLAYER' ? 'figure.soccer' : 'person.2.fill'}
                          size="md"
                          color={selected ? c.textInverse : c.textSecondary}
                        />
                        <Text
                          style={[
                            styles.roleChipText,
                            { color: selected ? c.textInverse : c.textPrimary },
                          ]}
                        >
                          {t(`roles.${role}`)}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
              </View>
            ) : (
              <View style={{ gap: space.sm }}>
                <Text style={[styles.sectionHint, { color: c.textSecondary }]}>
                  {t('joinClub.selectRole')}
                </Text>
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

            {club.teams.length > 0 && (
              <View style={{ gap: space.sm }}>
                <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>
                  {t('joinClub.selectTeam')}
                </Text>
                <Text style={[styles.sectionHint, { color: c.textSecondary }]}>
                  {t('joinClub.selectTeamHint')}
                </Text>
                <View style={styles.teamList}>
                  {club.teams.map((team) => {
                    const selected = selectedTeamId === team.id
                    return (
                      <Pressable
                        testID={`join-club-team-${team.id}`}
                        key={team.id}
                        style={[
                          styles.teamChip,
                          {
                            backgroundColor: selected ? club.primaryColor : c.surface,
                            borderColor: selected ? club.primaryColor : c.border,
                          },
                        ]}
                        onPress={() => setSelectedTeamId(selected ? null : team.id)}
                        accessibilityRole="button"
                        accessibilityLabel={team.displayName || team.name}
                      >
                        <Text
                          style={[
                            styles.teamChipText,
                            { color: selected ? c.textInverse : c.textPrimary },
                          ]}
                        >
                          {team.displayName || team.name}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
              </View>
            )}

            <View style={{ gap: space.sm }}>
              <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>
                {t('joinClub.messageLabel')}
              </Text>
              <TextInput
                style={[
                  styles.messageInput,
                  {
                    backgroundColor: c.surface,
                    borderColor: c.border,
                    color: c.textPrimary,
                  },
                ]}
                value={message}
                onChangeText={setMessage}
                placeholder={t('joinClub.messagePlaceholder')}
                placeholderTextColor={c.textTertiary}
                multiline
                maxLength={500}
                numberOfLines={3}
              />
            </View>

            <Button
              testID="join-club-submit"
              label={t('joinClub.submitRequest')}
              variant="filled"
              size="lg"
              fullWidth
              loading={isSubmitting}
              onPress={handleSubmit}
              style={{ marginTop: space.sm }}
            />
          </Card>
        )}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    padding: space.lg,
  },
  title: {
    fontSize: fontSize.xl,
    fontFamily: fonts.heading,
  },
  body: {
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    lineHeight: lineHeight.md,
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontFamily: fonts.heading,
    marginBottom: space.xs,
  },
  sectionHint: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
  },
  searchRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  searchInput: {
    flex: 1,
    height: 52,
    borderWidth: hairline,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
  },
  searchButton: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
  },
  clubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md + space.xs,
    borderRadius: radius.lg,
    borderWidth: 2,
  },
  clubBadge: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
  },
  clubBadgePlaceholder: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clubBadgeInitial: {
    fontSize: fontSize.xl,
    fontFamily: fonts.heading,
  },
  clubName: {
    fontSize: fontSize.md,
    flex: 1,
    fontFamily: fonts.heading,
  },
  roleRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    borderWidth: hairline,
    minHeight: 44,
  },
  roleChipText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.label,
  },
  lockedRoleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    borderWidth: hairline,
  },
  lockedRoleText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.label,
  },
  teamList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  teamChip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    borderWidth: hairline,
    minHeight: 44,
    justifyContent: 'center',
  },
  teamChipText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.label,
  },
  messageInput: {
    borderWidth: hairline,
    borderRadius: radius.lg,
    padding: space.md,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  successIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: space.sm,
  },
})
