import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  Share,
  StyleSheet,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { ClubSearchResult } from '@anstoss/shared'
import { SearchBar, Text } from '../../src/components/ui'
import { WizardStep } from '../../src/components/wizard/WizardStep'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { useOnboardingFlow } from '../../src/context/OnboardingFlowContext'
import { ApiError, api } from '../../src/api/client'
import { fontSize, fonts, hairline, radius, space } from '../../src/theme/tokens'

type SearchResponse = { results: ClubSearchResult[]; nextCursor: string | null }

export default function ClubSearchScreen() {
  const router = useRouter()
  const { t } = useTranslation()
  const colors = useClubColors()
  const { state, markStep } = useOnboardingFlow()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ClubSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [requestingClubId, setRequestingClubId] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const trimmed = query.trim()
  const canSearch = trimmed.length >= 2

  useEffect(() => markStep('/(auth)/club-search'), [markStep])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!canSearch) {
      setResults([])
      setError(null)
      setLoading(false)
      return
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await api<SearchResponse>(
          `/clubs/search?q=${encodeURIComponent(trimmed)}&limit=20`,
        )
        setResults(data?.results ?? [])
      } catch (e) {
        if (e instanceof ApiError && e.status === 400) {
          setError(t('clubSearch.queryTooShort', { defaultValue: 'Type at least 2 characters' }))
        } else {
          setError(t('clubSearch.error', { defaultValue: "Couldn't search. Try again." }))
        }
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [trimmed, canSearch, t])

  const handleRequest = (club: ClubSearchResult) => {
    if (!club.isActive || !club.activeClubId) {
      Alert.alert(
        t('clubSearch.directoryTitle', {
          defaultValue: '{{name}} is not on Anstoss yet',
          name: club.name,
        }),
        t('clubSearch.directoryBody', {
          defaultValue:
            'We found the club in the German football directory, but a coach or club admin still needs to activate it on Anstoss.',
        }),
        [
          { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
          {
            text: t('clubSearch.shareWithCoach', { defaultValue: 'Share with coach' }),
            onPress: () => {
              void Share.share({
                message: t('clubSearch.shareMessage', {
                  defaultValue:
                    'I found {{name}} in Anstoss. Can a coach or club admin activate the club so players can join?',
                  name: club.name,
                }),
              })
            },
          },
        ],
      )
      return
    }

    Alert.alert(
      t('clubSearch.confirmTitle', {
        defaultValue: 'Request to join {{name}}?',
        name: club.name,
      }),
      t('clubSearch.confirmBody', {
        defaultValue:
          "We'll send your details to the coaches. You'll get a push when they approve.",
      }),
      [
        { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        {
          text: t('clubSearch.confirmCta', { defaultValue: 'Send request' }),
          onPress: () => void submitRequest(club),
        },
      ],
    )
  }

  const submitRequest = async (club: ClubSearchResult) => {
    const clubId = club.activeClubId
    if (!clubId) {
      Alert.alert(
        t('common.error', { defaultValue: 'Error' }),
        t('clubSearch.requestError', {
          defaultValue: "Couldn't send the request. Try again.",
        }),
      )
      return
    }
    setRequestingClubId(clubId)
    try {
      const profilePatch = {
        ...(state.firstName ? { name: state.firstName } : {}),
        ...(state.dateOfBirth ? { dateOfBirth: state.dateOfBirth } : {}),
        ...(state.role ? { registrationRole: state.role } : {}),
      }
      if (Object.keys(profilePatch).length > 0) {
        await api('/me', {
          method: 'PATCH',
          body: profilePatch,
        })
      }
      await api(`/clubs/${clubId}/join-requests`, {
        method: 'POST',
        body: { role: 'PLAYER' },
      })
      router.replace('/pending-approval')
    } catch (e) {
      const message =
        e instanceof ApiError && e.status === 409
          ? t('clubSearch.alreadyRequested', {
              defaultValue: "You've already requested this club. Sit tight.",
            })
          : t('clubSearch.requestError', {
              defaultValue: "Couldn't send the request. Try again.",
            })
      Alert.alert(t('common.error', { defaultValue: 'Error' }), message)
    } finally {
      setRequestingClubId(null)
    }
  }

  const emptyHint = useMemo(() => {
    if (!canSearch) {
      return t('clubSearch.startTyping', {
        defaultValue: 'Search by club name or city.',
      })
    }
    if (loading) return null
    if (results.length === 0) {
      return t('clubSearch.noResults', {
        defaultValue: 'No clubs match that. Try a different spelling or city.',
      })
    }
    return null
  }, [canSearch, loading, results.length, t])

  return (
    <WizardStep
      title={t('clubSearch.title', { defaultValue: 'Find your club' })}
      hint={t('clubSearch.hint', {
        defaultValue:
          'Request to join active Anstoss clubs. Directory matches need a coach or admin to activate them first.',
      })}
      scrollable
    >
      <SearchBar
        value={query}
        onChangeText={setQuery}
        placeholder={t('clubSearch.placeholder', {
          defaultValue: 'Club name or city',
        })}
        autoCorrect={false}
        autoCapitalize="words"
        returnKeyType="search"
        containerStyle={styles.searchBar}
      />

      {loading ? (
        <ActivityIndicator
          size="small"
          color={colors.primary}
          style={styles.searchLoading}
        />
      ) : null}

      {error ? (
        <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
      ) : null}

      {emptyHint ? (
        <Text style={[styles.hint, { color: colors.textSecondary }]}>{emptyHint}</Text>
      ) : null}

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const activeClubId = item.activeClubId
          const isRequesting = activeClubId ? requestingClubId === activeClubId : false
          const isDirectoryOnly = !item.isActive || !activeClubId
          return (
            <Pressable
              onPress={() => handleRequest(item)}
              disabled={isRequesting}
              accessibilityRole="button"
              accessibilityLabel={
                isDirectoryOnly
                  ? t('clubSearch.directoryCtaA11y', {
                      defaultValue: 'Ask a coach to activate {{name}}',
                      name: item.name,
                    })
                  : t('clubSearch.joinCta', {
                      defaultValue: 'Request to join {{name}}',
                      name: item.name,
                    })
              }
              style={({ pressed }) => [
                styles.row,
                {
                  borderColor: colors.borderDefault,
                  backgroundColor: pressed ? colors.surfaceSunken : colors.surface,
                  opacity: isRequesting ? 0.6 : 1,
                },
              ]}
            >
              <View
                style={[
                  styles.badge,
                  { backgroundColor: item.primaryColor || colors.surfaceSunken },
                ]}
              >
                {item.badgeUrl ? (
                  <Image source={{ uri: item.badgeUrl }} style={styles.badgeImage} />
                ) : (
                  <Text style={styles.badgeFallback} weight="bold" color="inverse">
                    {item.name.slice(0, 2).toUpperCase()}
                  </Text>
                )}
              </View>
              <View style={styles.rowBody}>
                <Text variant="callout" weight="semibold" color="primary" numberOfLines={1}>
                  {item.name}
                </Text>
                <Text variant="caption1" color="secondary" numberOfLines={1}>
                  {[item.city, item.state, item.association]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                {isDirectoryOnly ? (
                  <Text variant="caption2" color="secondary" numberOfLines={1}>
                    {t('clubSearch.directorySource', {
                      defaultValue: 'Directory match - coach/admin activation needed',
                    })}
                  </Text>
                ) : (
                  <Text variant="caption2" color="secondary" numberOfLines={1}>
                    {t('clubSearch.memberCount', {
                      defaultValue: '{{count}} members',
                      count: item.memberCount,
                    })}
                  </Text>
                )}
              </View>
              {isRequesting ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={[styles.cta, { color: colors.primary }]}>
                  {isDirectoryOnly
                    ? t('clubSearch.directoryCta', { defaultValue: 'Share' })
                    : t('clubSearch.joinCta', { defaultValue: 'Request' })}
                </Text>
              )}
            </Pressable>
          )
        }}
      />
    </WizardStep>
  )
}

const styles = StyleSheet.create({
  searchBar: {
    marginTop: space.md,
  },
  searchLoading: {
    marginTop: space.lg,
    alignSelf: 'center',
  },
  errorText: {
    marginTop: space.sm,
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
  },
  hint: {
    marginTop: space.lg,
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  list: {
    marginTop: space.lg,
    gap: space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderWidth: hairline,
    borderRadius: radius.md,
  },
  badge: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  badgeImage: { width: 44, height: 44, resizeMode: 'cover' },
  badgeFallback: { fontFamily: fonts.heading, fontSize: fontSize.sm },
  rowBody: { flex: 1, gap: space['2xs'] },
  cta: { fontFamily: fonts.body, fontSize: fontSize.sm, fontWeight: '700' },
})
