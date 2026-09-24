import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  BackHandler,
  Pressable,
  SectionList,
  StyleSheet,
  View,
} from 'react-native'
import { Stack, router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { ChatContact, ChatContactGroup } from '@anstoss/shared'
import { ApiError } from '../../src/api/client'
import { createGroupChannel, fetchChatContacts, openDirectConversation } from '../../src/api/chat'
import { useAuth } from '../../src/context/AuthContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { useSafeAreaInsetsSafe } from '../../src/utils/useSafeAreaInsetsSafe'
import { refreshInbox } from '../../src/hooks/useInbox'
import { replaceWithConversation } from '../../src/components/chat/chatRoutes'
import { contactReasonKey, groupErrorKey, normalize } from '../../src/components/chat/inboxModel'
import { EmptyState } from '../../src/components/EmptyState'
import { ErrorState } from '../../src/components/ErrorState'
import { FormInput } from '../../src/components/FormInput'
import { Skeleton } from '../../src/components/Skeleton'
import { Avatar, Button, Icon, ListRow, SearchBar, Text } from '../../src/components/ui'
import { hairline, space } from '../../src/theme/tokens'
import { RADIUS_MD, RADIUS_CARD, RADIUS_FULL } from '../../src/theme/tokens'

type Step = 'pick' | 'members' | 'name'

type Section = { key: string; title: string; data: ChatContact[] }

/**
 * Start a conversation: tap a person for a direct message, or (managers)
 * build a group in two steps: pick members, then name it. People you may
 * not message privately stay visible but disabled, with the reason.
 */
export default function NewChatScreen() {
  const { t } = useTranslation()
  const c = useClubColors()
  const insets = useSafeAreaInsetsSafe()
  const { activeClub, activeTeamId, teamsForActiveClub, ageGate } = useAuth()
  const viewerIsMinor = ageGate?.isUnder16 === true
  const clubId = activeClub?.club.id ?? null

  const [groups, setGroups] = useState<ChatContactGroup[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [query, setQuery] = useState('')
  const [step, setStep] = useState<Step>('pick')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [groupName, setGroupName] = useState('')
  const [groupDescription, setGroupDescription] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  // B1 client: safeguarding rejections from the API are shown inline.
  const [groupError, setGroupError] = useState<string | null>(null)

  const clubRole = activeClub?.role
  const managedTeams = (teamsForActiveClub ?? []).filter(
    (tm) => tm.role === 'HEAD_COACH' || tm.role === 'ASSISTANT_COACH',
  )
  const isManager =
    clubRole === 'OWNER' || clubRole === 'ADMIN' || clubRole === 'COACH' || managedTeams.length > 0
  // Groups live in a team the creator runs (the API checks the same rule).
  const groupTeamId =
    clubRole === 'OWNER' || clubRole === 'ADMIN' || clubRole === 'COACH'
      ? (activeTeamId ?? teamsForActiveClub?.[0]?.team.id ?? null)
      : (managedTeams.find((tm) => tm.team.id === activeTeamId)?.team.id ?? managedTeams[0]?.team.id ?? null)

  const load = useCallback(async () => {
    if (!clubId) return
    setLoadError(false)
    try {
      const data = await fetchChatContacts(clubId)
      setGroups(Array.isArray(data) ? data : [])
    } catch {
      setLoadError(true)
      setGroups((prev) => prev ?? [])
    }
  }, [clubId])

  useEffect(() => {
    void load()
  }, [load])

  const sections = useMemo<Section[]>(() => {
    const q = normalize(query)
    return (groups ?? [])
      // A group lives in one team: its members come from that team plus
      // club staff (the API enforces the same rule).
      .filter((group) => step !== 'members' || group.teamId === groupTeamId || group.teamId === null)
      .map((group) => ({
        key: group.teamId ?? 'club',
        title: group.teamName,
        data: group.contacts.filter((contact) => !q || normalize(contact.name).includes(q)),
      }))
      .filter((section) => section.data.length > 0)
  }, [groupTeamId, groups, query, step])

  const contactById = useMemo(() => {
    const map = new Map<string, ChatContact>()
    for (const group of groups ?? []) for (const contact of group.contacts) map.set(contact.userId, contact)
    return map
  }, [groups])

  const close = useCallback(() => {
    if (router.canGoBack()) router.back()
    else router.replace('/(tabs)/chat' as never)
  }, [])

  const startDirect = useCallback(
    async (contact: ChatContact) => {
      if (!clubId || busy || !contact.canMessage) return
      setBusy(contact.userId)
      try {
        const conversation = await openDirectConversation(clubId, contact.userId)
        void refreshInbox(clubId)
        replaceWithConversation({ kind: 'dm', id: conversation.id, title: contact.name })
      } catch (err) {
        Alert.alert(
          t('common.error'),
          err instanceof ApiError && err.status === 403 ? t('chatHub.new.restricted') : t('chatHub.errors.openFailed'),
        )
      } finally {
        setBusy(null)
      }
    },
    [busy, clubId, t],
  )

  const createGroup = useCallback(async () => {
    const name = groupName.trim()
    if (!clubId || !name || busy) return
    if (selected.size === 0) {
      setGroupError(t('chatInbox.new.needMember'))
      return
    }
    setBusy('group')
    setGroupError(null)
    try {
      const channel = await createGroupChannel(clubId, {
        name,
        description: groupDescription.trim() || undefined,
        teamId: groupTeamId ?? undefined,
        memberIds: Array.from(selected),
      })
      void refreshInbox(clubId)
      replaceWithConversation({ kind: 'channel', id: channel.id, teamId: channel.teamId, title: channel.name })
    } catch (err) {
      const key = groupErrorKey(err)
      setGroupError(t(key ?? 'chatHub.errors.createGroupFailed'))
    } finally {
      setBusy(null)
    }
  }, [busy, clubId, groupDescription, groupName, groupTeamId, selected, t])

  const toggle = useCallback((userId: string) => {
    setGroupError(null)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }, [])

  // Android back walks the group steps before closing the modal.
  useEffect(() => {
    if (step === 'pick') return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setStep(step === 'name' ? 'members' : 'pick')
      return true
    })
    return () => sub.remove()
  }, [step])

  const headerTitle =
    step === 'pick' ? t('chatHub.new.title') : step === 'members' ? t('chatHub.new.addMembersTitle') : t('chatHub.new.groupTitle')

  const header = (
    <Stack.Screen
      options={{
        headerShown: true,
        title: headerTitle,
        headerStyle: { backgroundColor: c.background },
        headerTitleStyle: { color: c.textPrimary },
        headerShadowVisible: false,
        headerLeft: () =>
          step === 'pick' ? (
            <HeaderTextButton label={t('common.cancel')} onPress={close} color={c.primary} />
          ) : (
            <HeaderTextButton
              label={t('common.back')}
              onPress={() => setStep(step === 'name' ? 'members' : 'pick')}
              color={c.primary}
            />
          ),
        headerRight: () =>
          step === 'members' ? (
            <HeaderTextButton
              label={t('chatHub.new.next')}
              onPress={() => setStep('name')}
              color={c.primary}
              bold
              disabled={selected.size === 0}
            />
          ) : step === 'name' ? (
            <HeaderTextButton
              label={t('chatHub.new.create')}
              onPress={() => void createGroup()}
              color={c.primary}
              bold
              disabled={!groupName.trim() || busy === 'group'}
            />
          ) : null,
      }}
    />
  )

  if (!clubId) {
    return (
      <View style={[styles.fill, styles.centered, { backgroundColor: c.background }]}>
        {header}
        <EmptyState
          icon="bubble"
          title={t('chatHub.freeAgent.title')}
          description={t('chatHub.freeAgent.body')}
        />
      </View>
    )
  }

  if (step === 'name') {
    const chosen = Array.from(selected)
      .map((userId) => contactById.get(userId))
      .filter((x): x is ChatContact => Boolean(x))
    return (
      <View style={[styles.fill, { backgroundColor: c.background }]}>
        {header}
        <View style={styles.nameForm}>
          <FormInput
            label={t('chatHub.new.groupName')}
            value={groupName}
            onChangeText={setGroupName}
            placeholder={t('chatHub.new.groupNamePlaceholder')}
            maxLength={60}
            autoFocus
            returnKeyType="done"
            testID="chat-new-group-name"
          />
          <FormInput
            label={t('chatHub.new.groupDescription')}
            value={groupDescription}
            onChangeText={setGroupDescription}
            placeholder={t('chatHub.new.groupDescriptionPlaceholder')}
            maxLength={280}
            multiline
          />
          <Text variant="footnote" weight="semibold" color="secondary">
            {t('chatHub.new.memberCount', { count: chosen.length })}
          </Text>
          <View style={styles.chips}>
            {chosen.map((contact) => (
              <View key={contact.userId} style={[styles.chip, { backgroundColor: c.surfaceSunken }]}>
                <Avatar size={24} src={contact.avatarUrl} fallbackText={contact.name} tone="neutral" />
                <Text variant="footnote" color="primary" numberOfLines={1}>
                  {contact.name}
                </Text>
              </View>
            ))}
          </View>
          {groupError ? (
            <View
              style={[styles.inlineError, { backgroundColor: c.errorBg }]}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              testID="chat-new-group-error"
            >
              <Icon name="exclamationmark.triangle.fill" size={16} color={c.error} />
              <Text variant="footnote" color="primary" style={styles.flex}>
                {groupError}
              </Text>
            </View>
          ) : null}
          <Button
            label={t('chatHub.new.create')}
            variant="filled"
            size="lg"
            fullWidth
            loading={busy === 'group'}
            disabled={!groupName.trim() || chosen.length === 0}
            onPress={() => void createGroup()}
            testID="chat-new-group-create"
          />
        </View>
      </View>
    )
  }

  const picking = step === 'members'

  return (
    <View style={[styles.fill, { backgroundColor: c.background }]}>
      {header}
      <SectionList
        sections={groups === null || (loadError && sections.length === 0) ? [] : sections}
        keyExtractor={(item, index) => `${item.userId}-${index}`}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <SearchBar
              value={query}
              onChangeText={setQuery}
              placeholder={t('chatHub.new.search')}
              autoCorrect={false}
              autoCapitalize="words"
              testID="chat-new-search"
            />
            {!picking && isManager && groupTeamId && !query ? (
              <View style={[styles.newGroup, { borderColor: c.borderDefault, backgroundColor: c.surface }]}>
                <ListRow
                  title={t('chatHub.new.newGroup')}
                  subtitle={t('chatHub.new.newGroupHint')}
                  left={
                    <View style={[styles.groupIcon, { backgroundColor: c.primary50 }]}>
                      <Icon name="person.2.fill" size="md" color={c.primary} />
                    </View>
                  }
                  showChevron
                  onPress={() => setStep('members')}
                  testID="chat-new-group"
                />
              </View>
            ) : null}
            {picking ? (
              <View style={styles.pickHints}>
                <Text variant="footnote" color="secondary">
                  {t('chatHub.new.pickHint')}
                </Text>
                <View style={[styles.safeguard, { backgroundColor: c.surfaceSunken }]}>
                  <Icon name="shield.lefthalf.filled" size={16} color={c.textSecondary} />
                  <Text variant="footnote" color="secondary" style={styles.flex}>
                    {t('chatInbox.new.safeguardHint')}
                  </Text>
                </View>
              </View>
            ) : null}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text variant="footnote" weight="semibold" color="secondary" style={styles.sectionHeader}>
            {section.title}
          </Text>
        )}
        renderItem={({ item }) => {
          const isSelected = selected.has(item.userId)
          // In a group, everyone can be added (it is not a private channel);
          // for direct messages the safeguarding rule applies.
          const disabled = picking ? false : !item.canMessage || busy !== null
          return (
            <Pressable
              onPress={() => (picking ? toggle(item.userId) : void startDirect(item))}
              disabled={disabled}
              accessibilityRole={picking ? 'checkbox' : 'button'}
              accessibilityState={{ disabled, checked: picking ? isSelected : undefined }}
              accessibilityLabel={[item.name, roleText(item.role, t), !picking && item.reason ? reasonText(item.reason, t, viewerIsMinor) : null]
                .filter(Boolean)
                .join(', ')}
              style={({ pressed }) => [styles.contactRow, pressed && { backgroundColor: c.surfaceSunken }]}
              testID={`chat-contact-${item.userId}`}
              android_ripple={{ color: c.borderSubtle }}
            >
              <View style={{ opacity: disabled && !picking ? 0.45 : 1 }}>
                <Avatar size={44} src={item.avatarUrl} fallbackText={item.name} tone="neutral" />
              </View>
              <View style={[styles.contactBody, { borderBottomColor: c.borderSubtle }]}>
                <View style={styles.flex}>
                  <Text variant="body" color={disabled && !picking ? 'tertiary' : 'primary'} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text variant="footnote" color={!picking && item.reason ? 'secondary' : 'tertiary'} numberOfLines={2}>
                    {!picking && item.reason ? reasonText(item.reason, t, viewerIsMinor) : roleText(item.role, t)}
                  </Text>
                </View>
                {picking ? (
                  <Icon
                    name={isSelected ? 'checkmark.circle.fill' : 'circle'}
                    size={24}
                    color={isSelected ? c.primary : c.borderStrong}
                  />
                ) : busy === item.userId ? (
                  <Text variant="footnote" color="tertiary">
                    {t('common.loading')}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          )
        }}
        ListEmptyComponent={
          groups === null ? (
            <View style={styles.skeleton}>
              {Array.from({ length: 6 }).map((_, index) => (
                <View key={index} style={styles.skeletonRow}>
                  <Skeleton shape="circle" width={44} height={44} />
                  <Skeleton width="50%" height={16} />
                </View>
              ))}
            </View>
          ) : loadError ? (
            <ErrorState
              message={t('chatHub.errors.contactsTitle')}
              hint={t('chatHub.errors.loadHint')}
              onRetry={() => void load()}
            />
          ) : query ? (
            <Text variant="body" color="secondary" style={styles.emptySearch}>
              {t('chatHub.searchEmpty', { query: query.trim() })}
            </Text>
          ) : (
            <EmptyState icon="person.2" title={t('chatHub.new.emptyTitle')} description={t('chatHub.new.emptyBody')} />
          )
        }
        testID="chat-new-list"
      />
    </View>
  )
}

function HeaderTextButton({
  label,
  onPress,
  color,
  bold,
  disabled,
}: {
  label: string
  onPress: () => void
  color: string
  bold?: boolean
  disabled?: boolean
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      hitSlop={8}
      style={({ pressed }) => [styles.headerButton, { opacity: disabled ? 0.4 : pressed ? 0.6 : 1 }]}
    >
      <Text variant="body" weight={bold ? 'semibold' : 'regular'} color={color}>
        {label}
      </Text>
    </Pressable>
  )
}

function roleText(role: string, t: (key: string) => string) {
  switch (role) {
    case 'OWNER':
    case 'ADMIN':
      return t('chatHub.role.board')
    case 'COACH':
    case 'HEAD_COACH':
      return t('chatHub.role.coach')
    case 'ASSISTANT_COACH':
      return t('chatHub.role.assistant')
    case 'PARENT':
      return t('chatHub.role.parent')
    default:
      return t('chatHub.role.player')
  }
}

function reasonText(reason: string, t: (key: string) => string, viewerIsMinor: boolean) {
  // Under-16s may only message their guardians privately; everyone else
  // may not message an under-16 privately; two under-16s use the team
  // group. Same rule, three situations (L8).
  return t(contactReasonKey(reason, viewerIsMinor))
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  centered: { justifyContent: 'center', paddingHorizontal: space.md },
  listHeader: { paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.xs, gap: space.md },
  newGroup: {
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
    borderWidth: hairline,
    overflow: 'hidden',
  },
  groupIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS_MD,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeader: {
    paddingHorizontal: space.md,
    paddingTop: space.lg,
    paddingBottom: space.xs,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: space.md,
    gap: space.sm + space.xs,
    minHeight: 64,
  },
  contactBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    alignSelf: 'stretch',
    paddingVertical: space.sm,
    paddingRight: space.md,
    borderBottomWidth: hairline,
  },
  headerButton: { minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: space.xs },
  nameForm: { padding: space.md, gap: space.md },
  pickHints: { gap: space.sm },
  safeguard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    padding: space.sm + space.xs,
    borderRadius: RADIUS_MD,
    borderCurve: 'continuous',
  },
  inlineError: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    padding: space.sm + space.xs,
    borderRadius: RADIUS_MD,
    borderCurve: 'continuous',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingLeft: space.xs,
    paddingRight: space.sm + space.xs,
    paddingVertical: space.xs,
    borderRadius: RADIUS_FULL,
    maxWidth: '100%',
  },
  skeleton: { paddingHorizontal: space.md, gap: space.md, paddingTop: space.md },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm + space.xs },
  emptySearch: { textAlign: 'center', paddingHorizontal: space.lg, paddingTop: space.xl },
})
