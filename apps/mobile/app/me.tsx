import { useMemo } from 'react'
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ModalHeader } from '../src/components/ModalHeader'
import { SectionGroup, ListRow, SoftIcon } from '../src/components/ui'
import { VerifiedPlayerCard } from '../src/components/profile/VerifiedPlayerCard'
import { useStreaks } from '../src/hooks/useStreaks'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { space } from '../src/theme/tokens'

/**
 * "Me" — the club member's own hub. Leads with the verified gamified player
 * card (attendance + MOTM streaks, leaderboard rank), then routine account
 * actions. Reached from More → Profile; free agents keep their marketplace
 * profile tab instead.
 */
export default function MeScreen() {
  const { t } = useTranslation()
  const { user, activeClub } = useAuth()
  const c = useClubColors()
  const insets = useSafeAreaInsets()
  const { data, refreshing, refresh } = useStreaks()

  const me = data?.me ?? {
    attendanceWeeks: 0,
    attendanceLongest: 0,
    motmWeeks: 0,
    motmLongest: 0,
    lastActivityAt: '',
  }

  // Rank = the member's slot in the streak leaderboard, when present.
  const { rank, totalRanked } = useMemo(() => {
    const board = data?.leaderboard ?? []
    if (!user || board.length === 0) return { rank: null, totalRanked: 0 }
    const idx = board.findIndex((entry) => entry.userId === user.id)
    return { rank: idx >= 0 ? idx + 1 : null, totalRanked: board.length }
  }, [data?.leaderboard, user])

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <ModalHeader
        title={t('me.title', { defaultValue: 'Me' })}
        mode="back"
        onClose={() => router.back()}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + space.xl },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={c.primary}
          />
        }
      >
        <VerifiedPlayerCard
          name={user?.name ?? ''}
          avatarUrl={user?.avatarUrl}
          subtitle={activeClub?.club?.name ?? user?.email ?? null}
          streaks={me}
          rank={rank}
          totalRanked={totalRanked}
        />

        <SectionGroup header={t('me.sectionAccount', { defaultValue: 'Account' })}>
          <ListRow
            title={t('more.profile')}
            subtitle={user?.email ?? undefined}
            left={<SoftIcon name="person.fill" />}
            onPress={() => router.push('/edit-profile')}
            showChevron
          />
          <ListRow
            title={t('contributions.myTitle')}
            left={<SoftIcon name="creditcard.fill" />}
            onPress={() => router.push('/my-contributions')}
            showChevron
          />
        </SectionGroup>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
    gap: space.lg,
  },
})
