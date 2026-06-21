import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Image, StyleSheet, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { api } from '../../src/api/client'
import { apiErrorKey } from '../../src/lib/apiErrorKey'
import { useAuth } from '../../src/context/AuthContext'
import { ModalHeader } from '../../src/components/ModalHeader'
import { ErrorState } from '../../src/components/ErrorState'
import { Screen, Card, Button, Text } from '../../src/components/ui'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { hairline, radius, space } from '../../src/theme/tokens'

type ClubPublic = {
  id: string
  activeClubId?: string | null
  directoryEntryId?: string | null
  name: string
  slug: string
  badgeUrl: string | null
  primaryColor: string
  city: string | null
  state?: string | null
  association?: string | null
  source?: string
  isActive?: boolean
  memberCount: number
  teamCount: number
}

export default function ClubPreview() {
  const { t } = useTranslation()
  const { slug: slugParam } = useLocalSearchParams<{ slug?: string | string[] }>()
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam
  const { memberships } = useAuth()
  const c = useClubColors()

  const [club, setClub] = useState<ClubPublic | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const loadClub = useCallback(() => {
    if (!slug) {
      setError(t('common.error'))
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    let cancelled = false
    ;(async () => {
      try {
        const res = await api<ClubPublic>(`/public/clubs/${slug}`)
        if (!cancelled) setClub(res)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : t('common.error'))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // `t` is stable in production (i18next); excluding it avoids a refetch loop
    // when a fresh `t` identity is created each render (e.g. in tests).
  }, [slug])

  useEffect(() => {
    loadClub()
  }, [loadClub])

  const activeClubId = club?.isActive === true ? club.activeClubId : null
  const canRequestToJoin = Boolean(activeClubId)
  const alreadyMember =
    !!club &&
    memberships.some((m) => {
      const membershipClubId = m.club?.id
      return membershipClubId === club.id || membershipClubId === activeClubId
    })

  const handleRequest = async () => {
    if (!club) return
    if (!activeClubId) {
      Alert.alert(
        t('errors.api.title'),
        t('clubPreview.requestUnavailable', {
          defaultValue: "Couldn't send the request. Try again.",
        }),
      )
      return
    }
    setSubmitting(true)
    try {
      await api(`/clubs/${activeClubId}/join-requests`, {
        method: 'POST',
        body: { role: 'PLAYER' },
      })
      router.replace('/pending-approval')
    } catch (e) {
      Alert.alert(t('errors.api.title'), t(apiErrorKey(e)))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <Screen header={<ModalHeader title={t('clubPreview.title')} />}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={c.textSecondary} />
        </View>
      </Screen>
    )
  }

  if (error || !club) {
    return (
      <Screen header={<ModalHeader title={t('clubPreview.title')} />}>
        <ErrorState
          message={error ?? t('common.error')}
          onRetry={loadClub}
          fillContainer
        />
      </Screen>
    )
  }

  return (
    <Screen header={<ModalHeader title={t('clubPreview.title')} />} padded={false} scroll>
      <View style={styles.content}>
        <Card padding="card" style={{ gap: space.md }}>
          <View style={styles.hero}>
            {club.badgeUrl ? (
              <Image
                source={{ uri: club.badgeUrl }}
                style={[styles.badge, { backgroundColor: c.background, borderColor: c.borderDefault }]}
                resizeMode="contain"
              />
            ) : (
              <View
                style={[
                  styles.badgeFallback,
                  { backgroundColor: club.primaryColor, borderColor: c.borderDefault },
                ]}
              >
                <Text variant="title3" color="inverse">
                  {club.name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={{ flex: 1, gap: space.xs }}>
              <Text variant="title2" color="primary">{club.name}</Text>
              {club.city ? (
                <Text variant="footnote" color="secondary">{club.city}</Text>
              ) : null}
              {club.association ? (
                <Text variant="footnote" color="tertiary">{club.association}</Text>
              ) : null}
            </View>
          </View>

          <View style={styles.stats}>
            <Text variant="footnote" color="secondary">
              {t('clubPreview.memberCount', { count: club.memberCount })}
            </Text>
            <Text variant="footnote" color="tertiary"> · </Text>
            <Text variant="footnote" color="secondary">
              {t('clubPreview.teamCount', { count: club.teamCount })}
            </Text>
          </View>
        </Card>

        {!canRequestToJoin ? (
          <View style={styles.directoryNotice}>
            <Text variant="headline" color="primary" align="center">
              {t('clubPreview.directoryTitle', { defaultValue: 'Club found' })}
            </Text>
            <Text variant="body" color="secondary" align="center">
              {t('clubPreview.directoryBody', {
                defaultValue:
                  'This club is in the German football directory but has not set up Anstoss yet.',
              })}
            </Text>
            <Button
              label={t('clubPreview.setupDirectoryClub', {
                defaultValue: 'Set up this club',
              })}
              variant="filled"
              size="lg"
              fullWidth
              onPress={() =>
                router.push({
                  pathname: '/club-setup',
                  params: {
                    clubName: club.name,
                    directoryEntryId: club.directoryEntryId ?? club.id,
                  },
                })
              }
              style={{ marginTop: space.md }}
              testID="club-preview-setup-directory"
            />
          </View>
        ) : alreadyMember ? (
          <Text variant="body" color="secondary" align="center" style={{ marginTop: space.md }}>
            {t('clubPreview.alreadyMember')}
          </Text>
        ) : (
          <Button
            label={t('clubPreview.requestToJoin')}
            variant="filled"
            size="lg"
            fullWidth
            loading={submitting}
            onPress={() => void handleRequest()}
            style={{ marginTop: space.md }}
            testID="club-preview-request-to-join"
          />
        )}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  content: { padding: space.lg, gap: space.md },
  hero: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  badge: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    borderWidth: hairline,
  },
  badgeFallback: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stats: { flexDirection: 'row', alignItems: 'center' },
  directoryNotice: { marginTop: space.md, gap: space.sm },
})
