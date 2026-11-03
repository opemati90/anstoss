import { useCallback, useState } from 'react'
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { Redirect, router, useFocusEffect } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { LAUNCH_FEATURES, type MemberExportResult } from '@anstoss/shared'
import { COMPLIANCE_FEATURE_ENABLED, OPTIONAL_CLUB_FEATURES } from '../../../src/launchFeatures'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import { api } from '../../../src/api/client'
import { useAuth } from '../../../src/context/AuthContext'
import { useClubColors } from '../../../src/context/ClubThemeContext'
import { useEntitlements } from '../../../src/hooks/useEntitlements'
import { AnnounceSheet } from '../../../src/components/home/AnnounceSheet'
import { PaywallSheet } from '../../../src/components/billing/PaywallSheet'
import {
  Badge,
  ListRow,
  SectionGroup,
  SoftIcon,
  Text,
} from '../../../src/components/ui'
import { TabScreenHeader } from '../../../src/components/TabScreenHeader'
import { useAdminInbox } from '../../../src/components/admin/useAdminInbox'
import { ChatRetentionRow } from '../../../src/components/admin/ChatRetentionRow'
import { useOpenReportsSummary } from '../../../src/components/admin/useModerationReports'
import {
  adminRoleLabelKey,
  clubCountsLabel,
  formatMoney,
} from '../../../src/components/admin/adminFormat'
import { space, TAB_BAR_CLEARANCE } from '../../../src/theme/tokens'

/**
 * Verein — the club admin's workspace (OWNER / ADMIN only). An iOS
 * Settings-style inset grouped list: who is in the club, how the teams are
 * staffed, the money, safeguarding, communication and club settings. Every
 * screen it opens is a normal push with a back button.
 */
export default function VereinScreen() {
  const { t } = useTranslation()
  const c = useClubColors()
  const { activeClub, activeRoleMode } = useAuth()
  const entitlements = useEntitlements()
  const clubId = activeClub?.club.id ?? null
  const role = activeClub?.role
  const isOwner = role === 'OWNER'
  const isAdmin = role === 'OWNER' || role === 'ADMIN'
  const { inbox, refreshing, refresh, reload } = useAdminInbox(isAdmin ? clubId : null)
  const reports = useOpenReportsSummary(isAdmin ? clubId : null)
  const reloadReports = reports.reload
  const [announceVisible, setAnnounceVisible] = useState(false)
  const [paywallVisible, setPaywallVisible] = useState(false)
  const [exporting, setExporting] = useState(false)

  useFocusEffect(
    useCallback(() => {
      if (isAdmin && clubId) {
        void reload()
        void reloadReports()
      }
    }, [clubId, isAdmin, reload, reloadReports]),
  )

  // M5: the tab is hidden outside admin mode; if it is still focused (mode
  // switched from the header), send the admin home instead of leaving them
  // on a hidden tab. Redirect only fires while this screen is focused.
  const inAdminMode = activeRoleMode == null || activeRoleMode === 'ADMIN'
  if (!activeClub || !isAdmin || !inAdminMode) {
    return <Redirect href="/(tabs)" />
  }

  const roleLabel = t(adminRoleLabelKey(role, activeClub.operationalRoles))
  const counts = inbox
    ? clubCountsLabel(t, inbox.memberCount, inbox.teamCount)
    : null

  // H1/H2: the CSV is built and audited on the server (ADMIN only, formula
  // cells neutralised). Emails are opt-in behind a second confirmation. The
  // file only lives in the cache while the share sheet is open.
  const runExport = async (includeEmails: boolean) => {
    if (!clubId || exporting) return
    setExporting(true)
    let uri: string | null = null
    try {
      if (!FileSystem.cacheDirectory || !(await Sharing.isAvailableAsync())) {
        Alert.alert(t('common.errorTitle'), t('verein.export.shareUnavailable'))
        return
      }
      const result = await api<MemberExportResult>(
        `/clubs/${clubId}/members/export${includeEmails ? '?includeEmails=true' : ''}`,
      )
      if (!result || typeof result.csv !== 'string') throw new Error('invalid export')
      uri = `${FileSystem.cacheDirectory}${result.fileName.replace(/[^\w.-]/g, '_')}`
      await FileSystem.writeAsStringAsync(uri, result.csv, {
        encoding: FileSystem.EncodingType.UTF8,
      })
      await Sharing.shareAsync(uri, {
        mimeType: 'text/csv',
        UTI: 'public.comma-separated-values-text',
        dialogTitle: t('verein.settings.export'),
      })
    } catch {
      Alert.alert(t('common.errorTitle'), t('verein.export.error'))
    } finally {
      if (uri) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined)
      setExporting(false)
    }
  }

  const confirmEmailExport = () => {
    Alert.alert(t('verein.export.emailsConfirmTitle'), t('verein.export.emailsConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('verein.export.emailsConfirm'), onPress: () => void runExport(true) },
    ])
  }

  const exportMembers = () => {
    if (!clubId || exporting) return
    Alert.alert(t('verein.export.confirmTitle'), t('verein.export.confirmBody'), [
      { text: t('verein.export.withoutEmails'), onPress: () => void runExport(false) },
      { text: t('verein.export.withEmails'), onPress: confirmEmailExport },
      { text: t('common.cancel'), style: 'cancel' },
    ])
  }

  const overdue = inbox?.overdueDues
  const planLabel =
    entitlements.plan === 'PREMIUM' ? t('verein.settings.planPremium') : t('verein.settings.planBasic')

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void refresh()
              void reloadReports()
            }}
            tintColor={c.textTertiary}
          />
        }
        testID="verein-tab"
      >
        <TabScreenHeader
          title={t('verein.tabTitle')}
          subtitle={[roleLabel, counts].filter(Boolean).join(' · ')}
        />

        {/* Mitglieder */}
        <SectionGroup header={t('verein.sections.members')}>
          <ListRow
            left={<SoftIcon name="person.2.fill" />}
            title={t('verein.members.list')}
            right={inbox ? <CountValue value={inbox.memberCount} /> : undefined}
            showChevron
            onPress={() => router.push('/admin-members' as never)}
          />
          <ListRow
            left={<SoftIcon name="tray.full" />}
            title={t('verein.members.joinRequests')}
            right={inbox && inbox.joinRequests.count > 0 ? <AttentionBadge value={inbox.joinRequests.count} /> : undefined}
            accessibilityLabel={withCount(t('verein.members.joinRequests'), inbox?.joinRequests.count)}
            showChevron
            onPress={() => router.push('/pending-requests' as never)}
          />
          {/* Wechselbörse: Gesuche, Spielersuche, Probetraining, Vereinswechsel */}
          {OPTIONAL_CLUB_FEATURES.marketplace ? <ListRow
            left={<SoftIcon name="arrow.left.arrow.right" />}
            title={t('wechsel.title')}
            subtitle={t('wechsel.entryHint')}
            showChevron
            onPress={() => router.push('/wechselboerse' as never)}
          /> : null}
          {LAUNCH_FEATURES.youthParticipation ? <ListRow
            left={<SoftIcon name="figure.and.child.holdinghands" />}
            title={t('verein.members.families')}
            showChevron
            onPress={() => router.push('/team-families' as never)}
          /> : null}
          <ListRow
            left={<SoftIcon name="person.badge.plus" />}
            title={t('verein.members.invite')}
            subtitle={t('verein.members.inviteHint')}
            showChevron
            onPress={() =>
              router.push({ pathname: '/invite', params: { returnTo: '/(tabs)/verein' } } as never)
            }
          />
        </SectionGroup>

        {/* Mannschaften */}
        <SectionGroup header={t('verein.sections.teams')}>
          <ListRow
            left={<SoftIcon name="person.3.fill" />}
            title={t('verein.teams.manage')}
            subtitle={
              inbox && inbox.teamsWithoutHeadCoach.count > 0
                ? t('verein.teams.withoutCoach', { count: inbox.teamsWithoutHeadCoach.count })
                : undefined
            }
            right={
              inbox && inbox.teamsWithoutHeadCoach.count > 0 ? (
                <AttentionBadge value={inbox.teamsWithoutHeadCoach.count} />
              ) : inbox ? (
                <CountValue value={inbox.teamCount} />
              ) : undefined
            }
            showChevron
            onPress={() => router.push('/team-management' as never)}
          />
          {OPTIONAL_CLUB_FEATURES.statistics ? <ListRow
            left={<SoftIcon name="chart.bar.fill" />}
            title={t('verein.teams.stats')}
            showChevron
            onPress={() => router.push('/club-stats' as never)}
          /> : null}
        </SectionGroup>

        {/* Finanzen */}
        <SectionGroup header={t('verein.sections.finance')}>
          <ListRow
            left={<SoftIcon name="banknote" />}
            title={t('verein.finance.dues')}
            subtitle={
              overdue && overdue.count > 0
                ? t('verein.finance.overdueSummary', {
                    count: overdue.count,
                    amount: formatMoney(overdue.amount, overdue.currency),
                  })
                : t('verein.finance.duesHint')
            }
            right={overdue && overdue.count > 0 ? <AttentionBadge value={overdue.count} /> : undefined}
            showChevron
            onPress={() => router.push('/admin-billing' as never)}
          />
          <ListRow
            left={<SoftIcon name="building.2" />}
            title={t('verein.finance.bank')}
            showChevron
            onPress={() => router.push('/admin-contribution-bank' as never)}
          />
          <ListRow
            left={<SoftIcon name="arrow.left.arrow.right" />}
            title={t('verein.finance.reconciliation')}
            showChevron
            onPress={() => router.push('/admin-contribution-reconciliation' as never)}
          />
          {OPTIONAL_CLUB_FEATURES.sponsorship ? <ListRow
            left={<SoftIcon name="star" />}
            title={t('verein.finance.sponsors')}
            showChevron
            onPress={() => router.push('/admin-sponsors' as never)}
          /> : null}
        </SectionGroup>

        {/* Ehrenamt & Kinderschutz */}
        <SectionGroup header={t('verein.sections.safeguarding')}>
          <ListRow
            left={<SoftIcon name="person.badge.key" />}
            title={t('verein.safeguarding.offices')}
            subtitle={
              inbox && inbox.unfilledOffices.count > 0
                ? t('verein.safeguarding.officesOpen', {
                    offices: inbox.unfilledOffices.items
                      .map((item) => t(`verein.office.${item.office}`))
                      .join(', '),
                  })
                : undefined
            }
            right={
              inbox && inbox.unfilledOffices.count + inbox.staffAccessRequests.count > 0 ? (
                <AttentionBadge value={inbox.unfilledOffices.count + inbox.staffAccessRequests.count} />
              ) : undefined
            }
            showChevron
            onPress={() => router.push('/club-staff' as never)}
          />
          {COMPLIANCE_FEATURE_ENABLED ? <ListRow
            left={<SoftIcon name="checkmark.shield" />}
            title={t('verein.safeguarding.certificates')}
            subtitle={
              inbox && inbox.safeguarding.count > 0
                ? t('verein.safeguarding.certificatesOpen', { count: inbox.safeguarding.count })
                : t('verein.safeguarding.certificatesHint')
            }
            right={
              inbox && inbox.safeguarding.count > 0 ? (
                <AttentionBadge value={inbox.safeguarding.count} />
              ) : undefined
            }
            showChevron
            onPress={() => router.push('/compliance' as never)}
          /> : null}
        </SectionGroup>

        {/* Kommunikation */}
        <SectionGroup header={t('verein.sections.communication')}>
          <ListRow
            left={<SoftIcon name="megaphone" />}
            title={t('verein.communication.broadcast')}
            subtitle={t('verein.communication.broadcastHint')}
            showChevron
            onPress={() => setAnnounceVisible(true)}
          />
          <ListRow
            left={<SoftIcon name="flag" />}
            title={t('verein.reports.title')}
            subtitle={
              reports.overdue > 0
                ? t('aufgaben.reportsOverdue', { count: reports.overdue })
                : t('verein.reports.rowHint')
            }
            right={
              reports.count > 0 ? (
                <Badge label={String(reports.count)} variant={reports.overdue > 0 ? 'error' : 'club'} />
              ) : undefined
            }
            accessibilityLabel={withCount(t('verein.reports.title'), reports.count)}
            showChevron
            onPress={() => router.push('/admin-reports' as never)}
          />
          {clubId ? <ChatRetentionRow clubId={clubId} /> : null}
        </SectionGroup>

        {/* Einstellungen */}
        <SectionGroup header={t('verein.sections.settings')}>
          <ListRow
            left={<SoftIcon name="paintbrush" />}
            title={t('verein.settings.profile')}
            showChevron
            onPress={() => router.push('/admin-club-profile' as never)}
          />
          <ListRow
            left={<SoftIcon name="square.and.arrow.up" />}
            title={t('verein.settings.export')}
            subtitle={t('verein.settings.exportHint')}
            disabled={exporting}
            onPress={exportMembers}
          />
          {isOwner ? (
            <ListRow
              left={<SoftIcon name="person.badge.key" />}
              title={t('verein.settings.handover')}
              subtitle={t('verein.settings.handoverHint')}
              showChevron
              onPress={() => router.push('/ownership-transfers' as never)}
            />
          ) : null}
          <ListRow
            left={<SoftIcon name="creditcard" />}
            title={t('verein.settings.plan')}
            right={
              <Text variant="body" color="secondary">
                {planLabel}
              </Text>
            }
            showChevron
            onPress={() => setPaywallVisible(true)}
          />
        </SectionGroup>
      </ScrollView>

      {clubId ? (
        <AnnounceSheet
          clubId={clubId}
          visible={announceVisible}
          onClose={() => setAnnounceVisible(false)}
        />
      ) : null}
      <PaywallSheet visible={paywallVisible} onClose={() => setPaywallVisible(false)} />
    </View>
  )
}

function withCount(label: string, count: number | undefined) {
  return count && count > 0 ? `${label}, ${count}` : label
}

function CountValue({ value }: { value: number }) {
  return (
    <Text variant="body" color="secondary" tabular>
      {String(value)}
    </Text>
  )
}

/** A count that asks for something: pending, missing, overdue. */
function AttentionBadge({ value }: { value: number }) {
  return <Badge label={String(value)} variant="club" />
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: TAB_BAR_CLEARANCE + space.xl,
    gap: space.md,
  },
})
