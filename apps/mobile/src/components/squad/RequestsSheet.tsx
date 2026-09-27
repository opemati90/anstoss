import { useState } from 'react'
import { Alert, ScrollView, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useClubColors } from '../../context/ClubThemeContext'
import { getAppLanguage, getAppLocale } from '../../i18n'
import { EmptyState } from '../EmptyState'
import { Avatar, BottomSheet, Button, Text } from '../ui'
import { hairline, radius, space } from '../../theme/tokens'
import { formatDayMonth } from './format'
import { SheetHeader } from './SheetHeader'
import { decideTeamAccess } from './rosterApi'
import type { KaderMember } from './squadModel'

type RequestsSheetProps = {
  visible: boolean
  onClose: () => void
  onChanged: () => void
  onOpenExchange: () => void
  clubId: string
  requests: KaderMember[]
}

/**
 * Open team-access decisions: trial players (Probetraining) and coaches who
 * joined with a code. Accept moves them into the Kader; decline removes the
 * request. Uses the real team-access decision endpoint.
 */
export function RequestsSheet({
  visible,
  onClose,
  onChanged,
  onOpenExchange,
  clubId,
  requests,
}: RequestsSheetProps) {
  const { t } = useTranslation()
  const c = useClubColors()
  const locale = getAppLocale(getAppLanguage())
  const [pendingId, setPendingId] = useState<string | null>(null)

  const decide = async (member: KaderMember, decision: 'ACCEPT' | 'REJECT') => {
    setPendingId(member.id)
    try {
      await decideTeamAccess(clubId, member.id, decision)
      onChanged()
    } catch {
      Alert.alert(t('kader.errors.title'), t('kader.errors.saveFailed'))
    } finally {
      setPendingId(null)
    }
  }

  const confirmReject = (member: KaderMember) => {
    Alert.alert(
      t('kader.requests.rejectTitle', { name: member.name }),
      t('kader.requests.rejectBody'),
      [
        { text: t('kader.actions.cancel'), style: 'cancel' },
        {
          text: t('kader.requests.reject'),
          style: 'destructive',
          onPress: () => void decide(member, 'REJECT'),
        },
      ],
    )
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} heightPct={80}>
      <SheetHeader
        title={t('kader.requests.title')}
        cancelLabel={t('kader.actions.close')}
        onCancel={onClose}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {requests.length === 0 ? (
          <EmptyState
            icon="person.badge.plus"
            title={t('kader.requests.emptyTitle')}
            description={t('kader.requests.emptyBody')}
            compact
          />
        ) : (
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
            {requests.map((member, index) => {
              const busy = pendingId === member.id
              const kind = member.isCoach
                ? t('kader.requests.kindCoach')
                : member.status === 'PENDING'
                  ? t('kader.requests.kindTrialRequest')
                  : t('kader.requests.kindTrialRunning')
              return (
                <View
                  key={member.id}
                  style={[
                    styles.row,
                    index > 0 && { borderTopWidth: hairline, borderTopColor: c.borderSubtle },
                  ]}
                >
                  <View style={styles.head}>
                    <Avatar size="md" src={member.avatarUrl} fallbackText={member.name} />
                    <View style={styles.copy}>
                      <Text variant="body" weight="semibold" color="primary" numberOfLines={1}>
                        {member.name}
                      </Text>
                      <Text variant="footnote" color="secondary">
                        {[kind, member.position, t('kader.requests.since', {
                          date: formatDayMonth(member.createdAt, locale),
                        })]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.actions}>
                    {member.isCoach ? (
                      <Button
                        label={t('kader.requests.accept')}
                        variant="filled"
                        size="sm"
                        loading={busy}
                        disabled={busy}
                        onPress={() => void decide(member, 'ACCEPT')}
                        style={styles.action}
                        accessibilityLabel={t('kader.requests.acceptA11y', { name: member.name })}
                      />
                    ) : (
                      // Probetraining players join through the Aufnahmeantrag
                      // in the Wechselbörse (membership + seat check); the
                      // roster decision endpoint refuses them.
                      <Button
                        label={t('kader.requests.openApplication')}
                        variant="filled"
                        size="sm"
                        disabled={busy}
                        onPress={() => {
                          onClose()
                          setTimeout(onOpenExchange, 250)
                        }}
                        style={styles.action}
                        accessibilityLabel={t('kader.requests.openApplicationA11y', { name: member.name })}
                      />
                    )}
                    <Button
                      label={t('kader.requests.reject')}
                      variant="bordered"
                      size="sm"
                      disabled={busy}
                      onPress={() => confirmReject(member)}
                      style={styles.action}
                      accessibilityLabel={t('kader.requests.rejectA11y', { name: member.name })}
                    />
                  </View>
                </View>
              )
            })}
          </View>
        )}
        <Button
          label={t('kader.requests.openExchange')}
          variant="plain"
          size="md"
          onPress={() => {
            onClose()
            // Let the sheet's modal finish closing before pushing a route.
            setTimeout(onOpenExchange, 250)
          }}
        />
      </ScrollView>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingTop: space.md,
    paddingBottom: space.xl,
    gap: space.md,
  },
  card: {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    overflow: 'hidden',
  },
  row: { padding: space.md, gap: space.sm + 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 4 },
  copy: { flex: 1, minWidth: 0, gap: space['2xs'] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  action: { flexGrow: 1, flexBasis: 120 },
})
