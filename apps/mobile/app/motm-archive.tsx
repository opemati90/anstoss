/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import {
  Avatar,
  ListRow,
  Screen,
  SectionGroup,
  Text,
} from '../src/components/ui'
import { fonts, radius, space } from '../src/theme/tokens'

type ArchiveResponse = {
  season: string
  topByPlayer: Array<{
    userId: string
    name: string
    avatarUrl: string | null
    count: number
  }>
  byMatch: Array<{
    matchId: string
    kickoffAt: string
    opponentName: string
    motmUserId: string | null
    motmName: string | null
  }>
}

function formatDate(iso: string, locale: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export default function MotmArchiveScreen() {
  const { t, i18n } = useTranslation()
  const { activeClub } = useAuth()
  const c = useClubColors()
  const clubId = activeClub?.club.id ?? null

  const [data, setData] = useState<ArchiveResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!clubId) {
      setLoading(false)
      return
    }
    try {
      const result = await api<ArchiveResponse>(
        `/clubs/${clubId}/motm/archive`,
      )
      setData(result ?? null)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [clubId])

  useEffect(() => {
    void load()
  }, [load])

  const isEmpty =
    !!data && data.topByPlayer.length === 0 && data.byMatch.length === 0

  return (
    <Screen
      header={
        <ModalHeader
          title={t('motmArchive.title', { defaultValue: 'MOTM archive' })}
          mode="back"
          onClose={() => router.back()}
        />
      }
      scroll
      padded
    >
      {data?.season ? (
        <Text
          variant="caption2"
          color="secondary"
          style={[styles.eyebrow, { color: c.textTertiary }]}
        >
          {t('motmArchive.seasonLabel', {
            defaultValue: 'Season {{season}}',
            season: data.season,
          }).toUpperCase()}
        </Text>
      ) : null}

      {loading ? (
        <View style={styles.empty}>
          <Text variant="footnote" color="secondary">
            {t('common.loading', { defaultValue: 'Loading…' })}
          </Text>
        </View>
      ) : isEmpty || !data ? (
        <View
          style={[
            styles.emptyCard,
            { backgroundColor: c.surface, borderColor: c.borderDefault },
          ]}
        >
          <Text variant="body" color="primary" weight="semibold">
            {t('motmArchive.empty', {
              defaultValue: 'No MOTM picks yet this season.',
            })}
          </Text>
          <Text variant="footnote" color="secondary" style={styles.emptyBody}>
            {t('motmArchive.emptyBody', {
              defaultValue:
                'After the final whistle, the squad votes for Man of the Match. Winners show up here.',
            })}
          </Text>
        </View>
      ) : (
        <View style={styles.body}>
          {data.topByPlayer.length > 0 ? (
            <SectionGroup
              header={t('motmArchive.topPlayers', {
                defaultValue: 'Top players this season',
              })}
            >
              {data.topByPlayer.map((p) => (
                <ListRow
                  key={p.userId}
                  title={p.name}
                  left={
                    <Avatar
                      size="md"
                      src={p.avatarUrl}
                      fallbackText={p.name}
                    />
                  }
                  right={
                    <View
                      style={[
                        styles.countBadge,
                        { backgroundColor: c.surfaceSunken ?? c.background },
                      ]}
                    >
                      <Text
                        variant="caption1"
                        color="primary"
                        weight="semibold"
                        tabular
                      >
                        {String(p.count)}
                      </Text>
                    </View>
                  }
                />
              ))}
            </SectionGroup>
          ) : null}

          {data.byMatch.length > 0 ? (
            <SectionGroup
              header={t('motmArchive.byMatch', {
                defaultValue: 'Match by match',
              })}
            >
              {data.byMatch.map((m) => (
                <ListRow
                  key={m.matchId}
                  title={t('motmArchive.matchRowTitle', {
                    defaultValue: 'vs {{opponent}}',
                    opponent: m.opponentName,
                  })}
                  subtitle={formatDate(m.kickoffAt, i18n.language)}
                  right={
                    <Text
                      variant="footnote"
                      color={m.motmName ? 'primary' : 'tertiary'}
                      numberOfLines={1}
                      style={styles.motmName}
                    >
                      {m.motmName ??
                        t('motmArchive.noWinner', { defaultValue: '—' })}
                    </Text>
                  }
                />
              ))}
            </SectionGroup>
          ) : null}
        </View>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  eyebrow: {
    fontFamily: fonts.label,
    letterSpacing: 1.4,
    marginBottom: space.sm,
  },
  body: { gap: space.lg },
  empty: { paddingVertical: space.xl, alignItems: 'center' },
  emptyCard: {
    padding: space.md + 2,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 4,
  },
  emptyBody: { lineHeight: 18 },
  countBadge: {
    minWidth: 28,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  motmName: { maxWidth: 140, textAlign: 'right' },
})
