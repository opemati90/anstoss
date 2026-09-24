import { useCallback, useEffect, useState } from 'react'
import { Alert, Image, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { MembershipRole } from '@anstoss/shared'
import { api, ApiError } from '../src/api/client'
import { MediaViewer, type ViewerMedia } from '../src/components/chat/MediaViewer'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { ModalHeader } from '../src/components/ModalHeader'
import { EmptyState } from '../src/components/EmptyState'
import { ErrorState } from '../src/components/ErrorState'
import { FormInput } from '../src/components/FormInput'
import { Skeleton } from '../src/components/Skeleton'
import type { ModerationReport } from '../src/components/admin/useModerationReports'
import { daysFromNow, formatShortDate } from '../src/components/admin/adminFormat'
import {
  BottomSheet,
  Button,
  Icon,
  ListRow,
  Screen,
  SectionGroup,
  SegmentedControl,
  SoftIcon,
  StatusPill,
  Text,
} from '../src/components/ui'
import { useSafeAreaInsetsSafe } from '../src/utils/useSafeAreaInsetsSafe'
import { hairline, RADIUS_MD, space } from '../src/theme/tokens'

type Tab = 'open' | 'resolved'
type TFn = (key: string, options?: Record<string, unknown>) => string

const KNOWN_REASONS = new Set(['SPAM', 'ABUSE', 'INAPPROPRIATE', 'OTHER'])

/**
 * Meldungen — reported chat messages (App Store 1.2 / Play UGC). Club
 * admins are first-line moderators: open reports first, overdue (>24h)
 * flagged, each with "Entfernen" or "Verwerfen" and an optional note.
 */
export default function AdminReportsScreen() {
  const { t } = useTranslation()
  const c = useClubColors()
  const { activeClub } = useAuth()
  const clubId = activeClub?.club.id
  const isAdmin =
    activeClub?.role === MembershipRole.OWNER || activeClub?.role === MembershipRole.ADMIN

  const [tab, setTab] = useState<Tab>('open')
  const [reports, setReports] = useState<ModerationReport[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [refreshing, setRefreshing] = useState(false)
  const [selected, setSelected] = useState<ModerationReport | null>(null)

  const load = useCallback(async () => {
    if (!clubId) return
    try {
      const rows = await api<ModerationReport[]>(
        `/clubs/${clubId}/moderation/reports?status=${tab}&limit=100`,
      )
      const list = Array.isArray(rows) ? rows : []
      setReports(list)
      // Keep an open sheet on the fresh row (new signed evidence URL); close
      // it if the report left the queue (resolved or escalated).
      setSelected((current) =>
        current ? (list.find((row) => row.id === current.id) ?? null) : null,
      )
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [clubId, tab])

  useEffect(() => {
    setStatus('loading')
    void load()
  }, [load])

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await load()
    } finally {
      setRefreshing(false)
    }
  }

  const header = <ModalHeader title={t('verein.reports.title')} mode="back" />

  if (!isAdmin || !clubId) {
    return (
      <Screen header={header} padded={false}>
        <EmptyState
          icon="lock.shield.fill"
          title={t('common.accessDenied')}
          description={t('common.accessDeniedDescription')}
        />
      </Screen>
    )
  }

  const overdueCount = reports.filter((report) => report.overdue).length

  return (
    <Screen
      header={header}
      scroll
      padded={false}
      contentStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <SegmentedControl
        segments={[
          { key: 'open', label: t('verein.reports.tabOpen'), testID: 'reports-tab-open' },
          { key: 'resolved', label: t('verein.reports.tabResolved'), testID: 'reports-tab-resolved' },
        ]}
        value={tab}
        onChange={(next) => setTab(next)}
        fullWidth
      />

      {status === 'loading' ? (
        <View style={styles.skeleton} testID="reports-loading">
          <Skeleton shape="card" height={96} />
          <Skeleton shape="card" height={96} />
        </View>
      ) : status === 'error' ? (
        <ErrorState
          message={t('verein.reports.loadError')}
          onRetry={() => {
            setStatus('loading')
            void load()
          }}
        />
      ) : reports.length === 0 ? (
        <EmptyState
          icon="checkmark.shield"
          title={tab === 'open' ? t('verein.reports.emptyOpenTitle') : t('verein.reports.emptyResolvedTitle')}
          description={
            tab === 'open'
              ? `${t('verein.reports.emptyOpenBody')} ${t('verein.reports.platformNote')}`
              : t('verein.reports.emptyResolvedBody')
          }
        />
      ) : (
        <SectionGroup
          header={
            tab === 'open'
              ? t('verein.reports.openHeader', { count: reports.length })
              : t('verein.reports.resolvedHeader')
          }
          footer={
            tab === 'open'
              ? `${t('verein.reports.openFooter')} ${t('verein.reports.platformNote')}`
              : undefined
          }
        >
          {reports.map((report) => (
            <ListRow
              key={report.id}
              left={
                <SoftIcon name="flag.fill" color={report.overdue ? c.error : c.textSecondary} />
              }
              title={reasonLabel(report.reason, t)}
              subtitle={`„${report.message.content}“\n${reportMeta(report, t)}`}
              subtitleNumberOfLines={3}
              right={
                report.resolvedAt ? (
                  <StatusPill
                    label={
                      report.message.removed
                        ? t('verein.reports.statusRemoved')
                        : t('verein.reports.statusDismissed')
                    }
                    tone="neutral"
                  />
                ) : report.overdue ? (
                  <StatusPill label={t('verein.reports.overdue')} tone="error" />
                ) : undefined
              }
              accessibilityLabel={[
                reasonLabel(report.reason, t),
                report.overdue ? t('verein.reports.overdue') : null,
                report.message.content,
              ]
                .filter(Boolean)
                .join(', ')}
              showChevron
              onPress={() => setSelected(report)}
              testID={`report-row-${report.id}`}
            />
          ))}
        </SectionGroup>
      )}

      {tab === 'open' && overdueCount > 0 && status === 'ready' ? (
        <Text variant="footnote" color="error" style={styles.overdueNote}>
          {t('verein.reports.overdueNote', { count: overdueCount })}
        </Text>
      ) : null}

      <ReportSheet
        clubId={clubId}
        report={selected}
        onClose={() => setSelected(null)}
        onResolved={async () => {
          setSelected(null)
          await load()
        }}
        onReload={load}
      />
    </Screen>
  )
}

function reasonLabel(reason: string, t: TFn) {
  return KNOWN_REASONS.has(reason)
    ? t(`verein.reports.reason.${reason}`)
    : t('verein.reports.reason.OTHER')
}

function reportMeta(report: ModerationReport, t: TFn) {
  const sender = report.message.sender?.name ?? t('verein.reports.unknownPerson')
  const where = report.kind === 'direct' ? t('verein.reports.kindDirect') : t('verein.reports.kindChannel')
  const days = daysFromNow(report.createdAt)
  const when =
    days !== null && Math.abs(days) >= 1
      ? t('aufgaben.daysAgo', { count: Math.abs(days) })
      : t('aufgaben.today')
  return [sender, where, when].join(' · ')
}

function ReportSheet({
  clubId,
  report,
  onClose,
  onResolved,
  onReload,
}: {
  clubId: string
  report: ModerationReport | null
  onClose: () => void
  onResolved: () => Promise<void>
  /** Re-fetch the queue: a fresh signed evidence URL, or drop a stale row. */
  onReload: () => Promise<void>
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  const insets = useSafeAreaInsetsSafe()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<'dismiss' | 'remove' | null>(null)

  useEffect(() => {
    if (report) setNote('')
  }, [report])

  if (!report) return null

  const resolve = async (action: 'dismiss' | 'remove') => {
    setBusy(action)
    try {
      await api(`/clubs/${clubId}/moderation/reports/${report.id}/resolve`, {
        method: 'POST',
        body: note.trim() ? { action, resolution: note.trim() } : { action },
      })
      await onResolved()
    } catch (error) {
      // Escalated items (child safety, staff sender, own message) are handled
      // by the platform team: the server answers 403 and moves them out of
      // the club queue. 409 means someone else resolved it first.
      if (error instanceof ApiError && error.status === 403) {
        Alert.alert(t('verein.reports.ownMessageTitle'), t('verein.reports.escalatedBody'))
        onClose()
        await onReload()
        return
      }
      if (error instanceof ApiError && (error.status === 409 || error.status === 404)) {
        Alert.alert(t('verein.reports.ownMessageTitle'), t('verein.reports.alreadyResolved'))
        onClose()
        await onReload()
        return
      }
      Alert.alert(
        t('common.errorTitle', { defaultValue: 'Something went wrong' }),
        t('aufgaben.actionError'),
      )
    } finally {
      setBusy(null)
    }
  }

  const confirmRemove = () =>
    Alert.alert(t('verein.reports.removeTitle'), t('verein.reports.removeBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('verein.reports.remove'),
        style: 'destructive',
        onPress: () => void resolve('remove'),
      },
    ])

  const isOpen = !report.resolvedAt

  return (
    <BottomSheet visible onClose={onClose} heightPct="auto" paddingBottom={space.lg + insets.bottom}>
      <ScrollView contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled">
        <View style={styles.sheetHead}>
          <Text variant="title3" weight="bold" color="primary">
            {reasonLabel(report.reason, t)}
          </Text>
          {report.overdue ? <StatusPill label={t('verein.reports.overdue')} tone="error" /> : null}
        </View>
        <View style={[styles.evidence, { backgroundColor: c.surfaceSunken, borderColor: c.borderSubtle }]}>
          {report.message.content ? (
            <Text variant="body" color="primary">
              {report.message.content}
            </Text>
          ) : null}
          {report.message.attachment ? (
            <Evidence attachment={report.message.attachment} onReload={onReload} />
          ) : null}
        </View>
        <SectionGroup>
          <ListRow
            compact
            title={t('verein.reports.sender')}
            right={
              <Text variant="body" color="secondary" numberOfLines={2}>
                {report.message.sender?.name ?? t('verein.reports.unknownPerson')}
              </Text>
            }
          />
          <ListRow
            compact
            title={t('verein.reports.reporter')}
            right={
              <Text variant="body" color="secondary" numberOfLines={2}>
                {report.reporter.name ?? t('verein.reports.unknownPerson')}
              </Text>
            }
          />
          <ListRow
            compact
            title={t('verein.reports.where')}
            right={
              <Text variant="body" color="secondary">
                {report.kind === 'direct' ? t('verein.reports.kindDirect') : t('verein.reports.kindChannel')}
              </Text>
            }
          />
          <ListRow
            compact
            title={t('verein.reports.reportedOn')}
            right={
              <Text variant="body" color="secondary" tabular>
                {formatShortDate(report.createdAt)}
              </Text>
            }
          />
        </SectionGroup>
        {isOpen ? (
          <>
            <FormInput
              label={t('verein.reports.noteLabel')}
              value={note}
              onChangeText={setNote}
              placeholder={t('verein.reports.notePlaceholder')}
              maxLength={1000}
              multiline
            />
            <Button
              label={t('verein.reports.remove')}
              variant="destructive"
              size="lg"
              fullWidth
              loading={busy === 'remove'}
              disabled={busy !== null}
              onPress={confirmRemove}
            />
            <Button
              label={t('verein.reports.dismiss')}
              variant="bordered"
              size="lg"
              fullWidth
              loading={busy === 'dismiss'}
              disabled={busy !== null}
              onPress={() => void resolve('dismiss')}
            />
          </>
        ) : report.resolution ? (
          <Text variant="footnote" color="secondary">
            {t('verein.reports.resolutionNote', { note: report.resolution })}
          </Text>
        ) : null}
      </ScrollView>
    </BottomSheet>
  )
}

type EvidenceKind = 'image' | 'video' | 'voice' | 'file'

function evidenceKind(attachment: { url: string; meta: unknown }): EvidenceKind {
  const meta = (attachment.meta ?? {}) as { mimeType?: string; durationMs?: number; width?: number; height?: number }
  const mime = typeof meta.mimeType === 'string' ? meta.mimeType : ''
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/') || typeof meta.durationMs === 'number') return 'voice'
  if (!mime && typeof meta.width === 'number' && typeof meta.height === 'number') return 'image'
  const path = attachment.url.split('?')[0].toLowerCase()
  if (/\.(jpe?g|png|webp|heic|gif)$/.test(path)) return 'image'
  if (/\.(mp4|mov|m4v)$/.test(path)) return 'video'
  return 'file'
}

/**
 * Reported attachment. Images (and videos) open full-screen; the URL is
 * signed for ~5 minutes, so a failed load offers a reload of the queue.
 */
function Evidence({
  attachment,
  onReload,
}: {
  attachment: { url: string; meta: unknown }
  onReload: () => Promise<void>
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  const [viewer, setViewer] = useState<ViewerMedia | null>(null)
  const [failed, setFailed] = useState(false)
  const kind = evidenceKind(attachment)

  useEffect(() => setFailed(false), [attachment.url])

  if (failed) {
    return (
      <View style={styles.evidenceRow}>
        <Text variant="footnote" color="secondary" style={styles.evidenceText}>
          {t('verein.reports.evidenceExpired')}
        </Text>
        <Button
          label={t('verein.reports.evidenceReload')}
          variant="plain"
          size="sm"
          onPress={() => void onReload()}
        />
      </View>
    )
  }

  if (kind === 'image') {
    const meta = (attachment.meta ?? {}) as { width?: number; height?: number }
    const ratio =
      meta.width && meta.height ? Math.min(Math.max(meta.width / meta.height, 0.5), 2) : 4 / 3
    return (
      <>
        <Pressable
          onPress={() => setViewer({ kind: 'image', url: attachment.url, width: meta.width, height: meta.height })}
          accessibilityRole="imagebutton"
          accessibilityLabel={t('verein.reports.evidenceImageA11y')}
          style={({ pressed }) => [pressed && { opacity: 0.8 }]}
          testID="report-evidence-image"
        >
          <Image
            source={{ uri: attachment.url }}
            style={[styles.evidenceImage, { aspectRatio: ratio, backgroundColor: c.surface }]}
            resizeMode="cover"
            onError={() => setFailed(true)}
          />
        </Pressable>
        <MediaViewer media={viewer} onClose={() => setViewer(null)} />
      </>
    )
  }

  const label =
    kind === 'video'
      ? t('verein.reports.evidenceVideo')
      : kind === 'voice'
        ? t('verein.reports.evidenceVoice')
        : t('verein.reports.evidenceFile')
  const icon = kind === 'video' ? 'play.circle.fill' : kind === 'voice' ? 'dot.radiowaves.left.and.right' : 'doc.text'
  const content = (
    <View style={styles.evidenceRow}>
      <Icon name={icon} size="md" color="secondary" />
      <Text variant="footnote" color="secondary" style={styles.evidenceText}>
        {`${t('verein.reports.evidence')}: ${label}`}
      </Text>
    </View>
  )
  if (kind !== 'video') return content
  return (
    <>
      <Pressable
        onPress={() => setViewer({ kind: 'video', url: attachment.url })}
        accessibilityRole="button"
        accessibilityLabel={`${t('verein.reports.evidence')}: ${label}`}
        style={({ pressed }) => [pressed && { opacity: 0.6 }]}
      >
        {content}
      </Pressable>
      <MediaViewer media={viewer} onClose={() => setViewer(null)} />
    </>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space['2xl'],
    gap: space.md,
  },
  skeleton: { gap: space.md },
  overdueNote: { paddingHorizontal: space.sm },
  sheet: { gap: space.md, paddingBottom: space.sm },
  sheetHead: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm },
  evidence: {
    gap: space.sm,
    padding: space.md,
    borderRadius: RADIUS_MD,
    borderCurve: 'continuous',
    borderWidth: hairline,
  },
  evidenceImage: {
    width: '100%',
    borderRadius: RADIUS_MD,
    borderCurve: 'continuous',
  },
  evidenceRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 },
  evidenceText: { flex: 1, minWidth: 0 },
})
