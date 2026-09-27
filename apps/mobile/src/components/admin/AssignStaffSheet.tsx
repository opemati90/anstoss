import { useEffect, useMemo, useState } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsetsSafe } from '../../utils/useSafeAreaInsetsSafe'
import { useClubColors } from '../../context/ClubThemeContext'
import {
  Avatar,
  BottomSheet,
  Button,
  Icon,
  SectionGroup,
  StatusPill,
  type StatusPillTone,
  Text,
} from '../ui'
import { RADIUS_FULL, space } from '../../theme/tokens'
import { formatShortDate } from './adminFormat'
import { COMPLIANCE_FEATURE_ENABLED } from '../../launchFeatures'

export type StaffCandidate = { userId: string; name: string; avatarUrl: string | null }

export type FzInfo = { status: 'VALID' | 'EXPIRING' | 'EXPIRED' | 'MISSING'; expiresAt: string | null }

export type AssignStaffSheetProps = {
  visible: boolean
  teamName: string
  isYouthTeam: boolean
  candidates: StaffCandidate[]
  headCoachUserId: string | null
  assistantUserIds: string[]
  /** Führungszeugnis status per userId (youth teams only). */
  fzByUserId: Record<string, FzInfo>
  saving: boolean
  onClose: () => void
  onSave: (next: { headCoachUserId: string | null; assistantCoachUserIds: string[] }) => void
}

/**
 * Assign Trainer and Co-Trainer for one team. For youth teams every
 * candidate shows their Führungszeugnis status, because a coach without one
 * must not work with children.
 */
export function AssignStaffSheet({
  visible,
  teamName,
  isYouthTeam,
  candidates,
  headCoachUserId,
  assistantUserIds,
  fzByUserId,
  saving,
  onClose,
  onSave,
}: AssignStaffSheetProps) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsetsSafe()
  const [head, setHead] = useState<string | null>(headCoachUserId)
  const [assistants, setAssistants] = useState<string[]>(assistantUserIds)

  useEffect(() => {
    if (visible) {
      setHead(headCoachUserId)
      setAssistants(assistantUserIds)
    }
  }, [assistantUserIds, headCoachUserId, visible])

  const sorted = useMemo(
    () => [...candidates].sort((a, b) => a.name.localeCompare(b.name)),
    [candidates],
  )

  const toggleAssistant = (userId: string) =>
    setAssistants((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
    )

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      heightPct={88}
      paddingBottom={space.lg + insets.bottom}
    >
      <View style={styles.header}>
        <Text variant="title3" weight="bold" color="primary" numberOfLines={2}>
          {teamName}
        </Text>
        <Text variant="subheadline" color="secondary">
          {isYouthTeam && COMPLIANCE_FEATURE_ENABLED ? t('verein.teams.assignHintYouth') : t('verein.teams.assignHint')}
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {sorted.length === 0 ? (
          <Text variant="body" color="secondary">
            {t('teamManagement.noStaffBody')}
          </Text>
        ) : (
          <>
            <SectionGroup header={t('verein.teams.headCoach')}>
              <CandidateRow
                label={t('verein.teams.noCoachOption')}
                selected={head === null}
                onPress={() => setHead(null)}
              />
              {sorted.map((candidate) => (
                <CandidateRow
                  key={`head-${candidate.userId}`}
                  candidate={candidate}
                  label={candidate.name}
                  selected={head === candidate.userId}
                  fz={isYouthTeam && COMPLIANCE_FEATURE_ENABLED ? (fzByUserId[candidate.userId] ?? { status: 'MISSING', expiresAt: null }) : undefined}
                  onPress={() => {
                    setHead(candidate.userId)
                    setAssistants((current) => current.filter((id) => id !== candidate.userId))
                  }}
                />
              ))}
            </SectionGroup>
            <SectionGroup header={t('verein.teams.assistants')} footer={t('verein.teams.assistantsHint')}>
              {sorted
                .filter((candidate) => candidate.userId !== head)
                .map((candidate) => (
                  <CandidateRow
                    key={`assistant-${candidate.userId}`}
                    candidate={candidate}
                    label={candidate.name}
                    multi
                    selected={assistants.includes(candidate.userId)}
                    fz={isYouthTeam && COMPLIANCE_FEATURE_ENABLED ? (fzByUserId[candidate.userId] ?? { status: 'MISSING', expiresAt: null }) : undefined}
                    onPress={() => toggleAssistant(candidate.userId)}
                  />
                ))}
            </SectionGroup>
          </>
        )}
      </ScrollView>
      <View style={styles.footer}>
        <Button
          label={t('common.save')}
          variant="filled"
          size="lg"
          fullWidth
          loading={saving}
          disabled={saving}
          onPress={() => onSave({ headCoachUserId: head, assistantCoachUserIds: assistants })}
        />
      </View>
    </BottomSheet>
  )
}

function CandidateRow({
  candidate,
  label,
  selected,
  multi,
  fz,
  onPress,
}: {
  candidate?: StaffCandidate
  label: string
  selected: boolean
  multi?: boolean
  fz?: FzInfo
  onPress: () => void
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  const fzLabel = fz ? fzText(fz, t) : null
  return (
    <Pressable
      accessibilityRole={multi ? 'checkbox' : 'radio'}
      accessibilityState={multi ? { checked: selected } : { selected }}
      accessibilityLabel={[label, fzLabel].filter(Boolean).join(', ')}
      onPress={onPress}
      android_ripple={{ color: c.borderSubtle }}
      style={({ pressed }) => [
        styles.row,
        pressed && Platform.OS === 'ios' && { backgroundColor: c.surfaceSunken },
      ]}
    >
      {candidate ? (
        <Avatar size="md" src={candidate.avatarUrl} fallbackText={candidate.name} />
      ) : (
        <View style={[styles.emptyAvatar, { borderColor: c.borderDefault }]}>
          <Icon name="minus" size="sm" color="tertiary" />
        </View>
      )}
      <View style={styles.rowText}>
        <Text variant="body" color="primary" numberOfLines={1}>
          {label}
        </Text>
        {fz && fzLabel ? (
          <StatusPill label={fzLabel} tone={fzTone(fz.status)} style={styles.pill} />
        ) : null}
      </View>
      <Icon
        name={
          multi
            ? selected
              ? 'checkmark.circle.fill'
              : 'circle'
            : selected
              ? 'checkmark'
              : 'circle'
        }
        size="md"
        color={selected ? 'tint' : c.borderDefault}
      />
    </Pressable>
  )
}

function fzText(fz: FzInfo, t: (key: string, options?: Record<string, unknown>) => string) {
  if (fz.status === 'MISSING') return t('verein.fz.missing')
  if (fz.status === 'EXPIRED') return t('verein.fz.expiredOn', { date: formatShortDate(fz.expiresAt) })
  if (fz.status === 'EXPIRING') return t('verein.fz.expiresOn', { date: formatShortDate(fz.expiresAt) })
  return t('verein.fz.valid')
}

function fzTone(status: FzInfo['status']): StatusPillTone {
  if (status === 'VALID') return 'success'
  if (status === 'EXPIRING') return 'warning'
  return 'error'
}

const styles = StyleSheet.create({
  header: { gap: space.sm, paddingBottom: space.md },
  body: { gap: space.md, paddingBottom: space.md },
  footer: { paddingTop: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 60,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  rowText: { flex: 1, minWidth: 0, gap: space.xs, alignItems: 'flex-start' },
  pill: { alignSelf: 'flex-start' },
  emptyAvatar: {
    width: 40,
    height: 40,
    borderRadius: RADIUS_FULL,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
})
