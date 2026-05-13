import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  RefreshControl,
  Image,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { router } from 'expo-router'
import { MembershipRole } from '@anstoss/shared'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { RosterSkeleton } from '../src/components/Skeleton'
import { ErrorState } from '../src/components/ErrorState'
import { EmptyState } from '../src/components/EmptyState'
import { LoadingBoundary } from '../src/components/LoadingBoundary'
import { ErrorBoundary } from '../src/components/ErrorBoundary'
import { ModalHeader } from '../src/components/ModalHeader'
import {
  Icon,
  ListRow,
  Screen,
  SectionGroup,
  Text,
} from '../src/components/ui'
import {
  fonts,
  fontSize,
  hairline,
  radius,
  space,
} from '../src/theme/tokens'

type AdminMember = {
  id: string
  role: string
  user: {
    id: string
    name: string
    email: string
    avatarUrl: string | null
  }
  teamAccess: {
    teamId: string
    teamName: string
    role: string
  }[]
}

export default function AdminMembersScreen() {
  const { t } = useTranslation()
  const { activeClub } = useAuth()
  const c = useClubColors()
  const [members, setMembers] = useState<AdminMember[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clubId = activeClub?.club.id
  const isAdmin =
    activeClub?.role === MembershipRole.OWNER ||
    activeClub?.role === MembershipRole.ADMIN

  const fetchMembers = useCallback(async () => {
    if (!clubId) return
    try {
      const data = await api<AdminMember[]>(`/clubs/${clubId}/members`)
      setMembers(data || [])
      setError(null)
    } catch {
      setError(t('errors.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [clubId, t])

  useEffect(() => {
    fetchMembers()
  }, [fetchMembers])

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await fetchMembers()
    } finally {
      setRefreshing(false)
    }
  }

  const safeMembers = useMemo(
    () =>
      members.filter(
        (m): m is AdminMember =>
          !!m && !!m.id && !!m.user?.name && typeof m.role === 'string',
      ),
    [members],
  )

  const filtered = useMemo(() => {
    if (!search.trim()) return safeMembers
    const q = search.toLowerCase()
    return safeMembers.filter(
      (m) =>
        m.user.name.toLowerCase().includes(q) ||
        (m.user.email ?? '').toLowerCase().includes(q) ||
        m.role.toLowerCase().includes(q),
    )
  }, [safeMembers, search])

  if (!isAdmin) {
    return (
      <Screen
        header={<ModalHeader title={t('adminMembers.title')} mode="back" />}
        padded={false}
        style={{ backgroundColor: c.surfaceSunken }}
      >
        <EmptyState
          icon="lock.shield.fill"
          title={t('common.accessDenied')}
          description={t('common.accessDeniedDescription')}
        />
      </Screen>
    )
  }

  return (
    <Screen
      header={<ModalHeader title={t('adminMembers.title')} mode="back" />}
      scroll={false}
      padded={false}
      style={{ backgroundColor: c.surfaceSunken }}
    >
      {/* iOS-native search field — rounded surface with leading magnifier */}
      <View style={styles.searchWrap}>
        <View
          style={[
            styles.searchField,
            { backgroundColor: c.surface, borderColor: c.borderSubtle },
          ]}
        >
          <Icon name="search" size="sm" color="tertiary" />
          <TextInput
            style={[styles.searchInput, { color: c.textPrimary }]}
            placeholder={t('adminMembers.searchPlaceholder')}
            placeholderTextColor={c.textTertiary}
            accessibilityLabel={t('adminMembers.searchPlaceholder')}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {search.length > 0 ? (
            <Pressable
              onPress={() => setSearch('')}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('common.clearSearch')}
            >
              <Icon name="xmark.circle.fill" size="sm" color="tertiary" />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ErrorBoundary
        onRetry={fetchMembers}
        fallbackTitleKey="states.admin_members.error.title"
        fallbackBodyKey="states.admin_members.error.body"
        fallbackRetryKey="states.common.retry"
      >
        <LoadingBoundary
          isLoading={loading}
          skeleton={<RosterSkeleton />}
          testID="admin-members-loading-boundary"
        >
          {error ? (
            <ErrorState
              message={t('states.admin_members.error.title')}
              hint={t('states.admin_members.error.hint')}
              onRetry={fetchMembers}
              retryLabel={t('states.common.retry')}
              fillContainer
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon="person.2"
              title={t('states.admin_members.empty.title')}
              description={t('states.admin_members.empty.body')}
              actionLabel={t('states.admin_members.empty.cta')}
              onAction={() => router.push('/invite')}
            />
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              renderItem={({ item, index }) => (
                <MemberItem
                  member={item}
                  isFirst={index === 0}
                  isLast={index === filtered.length - 1}
                />
              )}
              contentContainerStyle={styles.list}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
              }
              ListHeaderComponent={
                <Text variant="caption2" color="tertiary" tabular style={styles.count}>
                  {t('adminMembers.count', { count: filtered.length }).toUpperCase()}
                </Text>
              }
              ItemSeparatorComponent={() => (
                <View
                  style={[styles.divider, { backgroundColor: c.borderSubtle }]}
                />
              )}
            />
          )}
        </LoadingBoundary>
      </ErrorBoundary>
    </Screen>
  )
}

function MemberItem({
  member,
  isFirst,
  isLast,
}: {
  member: AdminMember
  isFirst: boolean
  isLast: boolean
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  const initials = (member.user.name || '')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
  const teamLabels = (member.teamAccess ?? [])
    .filter((ta) => ta && ta.teamId && ta.teamName)
    .map((ta) => ta.teamName)
    .join(', ')

  return (
    <View
      style={[
        styles.memberWrap,
        { backgroundColor: c.surface },
        isFirst && styles.memberFirst,
        isLast && styles.memberLast,
      ]}
    >
      <ListRow
        left={
          member.user.avatarUrl ? (
            <Image
              source={{ uri: member.user.avatarUrl }}
              style={styles.avatar}
            />
          ) : (
            <View style={[styles.avatarFallback, { backgroundColor: c.primary50 }]}>
              <Text style={[styles.avatarInitials, { color: c.primary }]}>
                {initials}
              </Text>
            </View>
          )
        }
        title={member.user.name}
        subtitle={
          teamLabels
            ? `${t(`roles.${member.role}`)} · ${teamLabels}`
            : t(`roles.${member.role}`)
        }
        showChevron
      />
    </View>
  )
}

const styles = StyleSheet.create({
  searchWrap: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    paddingHorizontal: space.sm,
    gap: space.xs,
    borderRadius: 10,
    borderWidth: hairline,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    paddingVertical: 0,
  },
  list: {
    paddingHorizontal: space.md,
    paddingBottom: space['3xl'] + space.lg,
  },
  count: {
    marginBottom: space.xs,
    paddingLeft: space.md,
    letterSpacing: 0.4,
  },
  divider: {
    height: hairline,
    marginLeft: space.md + 30 + space.md,
  },
  memberWrap: {
    overflow: 'hidden',
  },
  memberFirst: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  memberLast: {
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  avatar: { width: 30, height: 30, borderRadius: 15 },
  avatarFallback: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: fontSize.xs,
    fontFamily: fonts.heading,
  },
})
