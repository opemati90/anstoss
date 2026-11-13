import { useEffect, useMemo, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import {
  ACTING_SESSION_DURATIONS,
  type ActingCandidateDto,
  type ActingSessionDuration,
} from '@anstoss/shared'
import { useAuth } from '../../context/AuthContext'
import { useClubColors, useIsDark } from '../../context/ClubThemeContext'
import { BottomSheet, Button, Icon, Text } from '../ui'
import { fetchActingCandidates, startActingSession } from '../../features/acting/api'
import { startPreview, type PreviewMode, type ViewAsTeam } from '../../features/acting/store'
import {
  hairline,
  RADIUS_CARD,
  RADIUS_FULL,
  SPACING_LG,
  SPACING_MD,
  SPACING_SM,
  SPACING_XS,
  SPACING_XXS,
} from '../../theme/tokens'

/** Board 29 measures (RoleSwitch.dc.html). */
const SHEET_GAP = 18
const SECTION_GAP = 10
const TITLE_SIZE = 22
const TITLE_LINE = 28
const TITLE_TRACKING = -0.44
const BODY_SIZE = 14
const BODY_LINE = 20
const ROW_MIN_HEIGHT = 58
const ROW_GAP = 14
// The board sets row copy at line-height normal (~1.2), tighter than body text.
const ROW_TITLE_LINE = 18
const ROW_SUB_LINE = 16
const RADIO_SIZE = 22
const RADIO_ON_BORDER = 7
const RADIO_OFF_BORDER = 2
const CHIP_HEIGHT = 36
const CHIP_PAD_X = 14
const CARD_PAD_Y = 14
const SHEET_PAD_BOTTOM = 34

type Choice = 'previewPlayer' | 'previewParent' | 'acting'

const YOUTH_TEAM = /jugend|\bu\s?\d{1,2}\b/i

/** Who sees "Vorschau und Vertretung": Vorstand (owner/admin) and Teammanager. */
export function canUsePreviewCover(
  membership: { role?: string | null; operationalRoles?: readonly string[] | null } | null,
): boolean {
  if (!membership) return false
  if (membership.role === 'OWNER' || membership.role === 'ADMIN') return true
  return (membership.operationalRoles ?? []).includes('TEAM_COORDINATOR')
}

/**
 * The ink entry card on Mehr (board 18/29): swap icon in lime, "Vorschau und
 * Vertretung", "Nur für Vorstand und Teammanager", chevron.
 */
export function PreviewCoverEntryCard({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation()
  const c = useClubColors()
  const isDark = useIsDark()
  const bg = isDark ? c.surfaceRaised : c.ink
  const fg = isDark ? c.textPrimary : c.onInk
  const muted = isDark ? c.textSecondary : c.onHeroMuted
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${t('acting.entryTitle')}, ${t('acting.entrySub')}`}
      testID="more-preview-cover"
      style={({ pressed }) => [
        styles.entry,
        { backgroundColor: bg },
        pressed && styles.pressed,
      ]}
    >
      <Icon name="arrow.left.arrow.right" size={20} color={c.accent} />
      <View style={styles.entryText}>
        <Text variant="body" weight="bold" style={{ color: fg }} numberOfLines={1}>
          {t('acting.entryTitle')}
        </Text>
        <Text variant="footnote" style={{ color: muted }} numberOfLines={1}>
          {t('acting.entrySub')}
        </Text>
      </View>
      <Icon name="chevron.right" size={18} color={muted} />
    </Pressable>
  )
}

/**
 * Vorschau und Vertretung (board 29). Vorschau opens a read-only view of the
 * app as a player or parent of a team (client-only, writes blocked).
 * Vertretung starts a 15/30/60-minute stand-in session as the team's coach
 * (POST /clubs/:clubId/acting-sessions); the API grants coach rights until
 * it expires and notifies the head coach.
 */
export function PreviewCoverSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const c = useClubColors()
  const { user, activeClub, activeTeamAccess, teamsForActiveClub } = useAuth()
  const clubId = activeClub?.club.id ?? null
  const [choice, setChoice] = useState<Choice>('previewPlayer')
  const [duration, setDuration] = useState<ActingSessionDuration>(30)
  const [candidates, setCandidates] = useState<ActingCandidateDto[]>([])
  const [actingTeamId, setActingTeamId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!visible || !clubId) return
    let cancelled = false
    void fetchActingCandidates(clubId).then((items) => {
      if (cancelled) return
      setCandidates(items)
      setActingTeamId((current) =>
        current && items.some((item) => item.teamId === current) ? current : (items[0]?.teamId ?? null),
      )
    })
    return () => {
      cancelled = true
    }
  }, [clubId, visible])

  const ownTeam: ViewAsTeam | null = useMemo(() => {
    const access = activeTeamAccess ?? teamsForActiveClub?.[0] ?? null
    if (access && clubId) {
      return { id: access.team.id, name: access.team.displayName || access.team.name, clubId }
    }
    const first = candidates[0]
    return first && clubId ? { id: first.teamId, name: first.teamName, clubId } : null
  }, [activeTeamAccess, candidates, clubId, teamsForActiveClub])

  const acting = candidates.find((item) => item.teamId === actingTeamId) ?? null
  const parentTeam: ViewAsTeam | null = useMemo(() => {
    if (!clubId) return null
    const youth = candidates.filter((item) => YOUTH_TEAM.test(item.teamName))
    const pick = youth.find((item) => item.teamId !== actingTeamId) ?? youth[0]
    return pick ? { id: pick.teamId, name: pick.teamName, clubId } : ownTeam
  }, [actingTeamId, candidates, clubId, ownTeam])

  const previewTeams: Record<PreviewMode, ViewAsTeam | null> = {
    PLAYER: ownTeam,
    PARENT: parentTeam,
  }
  const firstName = (user?.name ?? '').split(' ')[0] || t('acting.fallbackName')

  const actingSub = acting
    ? acting.coachAway
      ? t('acting.coachAway', { team: acting.teamName })
      : acting.headCoachName
        ? t('acting.coachNamed', { team: acting.teamName, name: acting.headCoachName })
        : acting.teamName
    : t('acting.noTeams')

  const previewRows: Array<{ key: Choice; title: string; sub: string; mode: PreviewMode }> = [
    {
      key: 'previewPlayer',
      title: t('acting.asPlayer'),
      sub: t('acting.readOnly', { team: previewTeams.PLAYER?.name ?? '' }),
      mode: 'PLAYER',
    },
    {
      key: 'previewParent',
      title: t('acting.asParent'),
      sub: t('acting.readOnly', { team: previewTeams.PARENT?.name ?? '' }),
      mode: 'PARENT',
    },
  ]

  const isActing = choice === 'acting'
  const ctaDisabled = isActing
    ? !acting || !clubId
    : !previewTeams[choice === 'previewParent' ? 'PARENT' : 'PLAYER']

  const handleConfirm = async () => {
    if (!clubId) return
    if (!isActing) {
      const mode: PreviewMode = choice === 'previewParent' ? 'PARENT' : 'PLAYER'
      const team = previewTeams[mode]
      if (!team) return
      startPreview(mode, team)
      onClose()
      router.navigate('/(tabs)' as never)
      return
    }
    if (!acting) return
    setBusy(true)
    try {
      await startActingSession(clubId, { teamId: acting.teamId, durationMin: duration })
      onClose()
      router.navigate('/(tabs)' as never)
    } catch {
      Alert.alert(t('common.error'), t('acting.startError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} heightPct="auto" paddingBottom={SHEET_PAD_BOTTOM}>
      <ScrollView
        contentContainerStyle={styles.sheet}
        showsVerticalScrollIndicator={false}
        testID="preview-cover-sheet"
      >
        <View style={styles.intro}>
          <Text
            variant="title3"
            weight="bold"
            color="primary"
            accessibilityRole="header"
            style={styles.title}
          >
            {t('acting.entryTitle')}
          </Text>
          <Text variant="body" color="secondary" style={styles.body}>
            {t('acting.sheetBody')}
          </Text>
        </View>

        <View accessibilityRole="radiogroup" accessibilityLabel={t('acting.choices')} style={styles.section}>
          <Text variant="label" accessibilityRole="header">
            {t('acting.previewLabel')}
          </Text>
          <View style={[styles.group, { backgroundColor: c.surface }]}>
            {previewRows.map((row, index) => (
              <RadioRow
                key={row.key}
                title={row.title}
                sub={row.sub}
                selected={choice === row.key}
                last={index === previewRows.length - 1}
                onPress={() => setChoice(row.key)}
                testID={`preview-cover-${row.key}`}
              />
            ))}
          </View>
          <Text variant="label" accessibilityRole="header" style={styles.secondLabel}>
            {t('acting.actingLabel')}
          </Text>
          <View style={[styles.group, { backgroundColor: c.surface }]}>
            <RadioRow
              title={t('acting.standIn')}
              sub={actingSub}
              selected={isActing}
              last
              disabled={!acting}
              onPress={() => setChoice('acting')}
              testID="preview-cover-acting"
            />
          </View>
        </View>

        {isActing ? (
          <View style={styles.section}>
            <View accessibilityRole="radiogroup" accessibilityLabel={t('acting.duration')} style={styles.chips}>
              {ACTING_SESSION_DURATIONS.map((d) => (
                <Chip
                  key={d}
                  label={t('acting.minutes', { count: d })}
                  selected={duration === d}
                  onPress={() => setDuration(d)}
                />
              ))}
            </View>
            {candidates.length > 1 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                accessibilityRole="radiogroup"
                accessibilityLabel={t('acting.team')}
                contentContainerStyle={styles.chips}
              >
                {candidates.map((item) => (
                  <Chip
                    key={item.teamId}
                    label={item.teamName}
                    selected={item.teamId === actingTeamId}
                    onPress={() => setActingTeamId(item.teamId)}
                  />
                ))}
              </ScrollView>
            ) : null}
            <Text variant="footnote" color="secondary" style={styles.note}>
              {t('acting.logNote', { name: firstName })}
            </Text>
          </View>
        ) : null}

        <Button
          label={isActing ? t('acting.startActing', { count: duration }) : t('acting.openPreview')}
          variant="filled"
          size="lg"
          fullWidth
          loading={busy}
          disabled={ctaDisabled || busy}
          onPress={() => void handleConfirm()}
          testID="preview-cover-confirm"
        />
      </ScrollView>
    </BottomSheet>
  )
}


function RadioRow({
  title,
  sub,
  selected,
  last,
  disabled,
  onPress,
  testID,
}: {
  title: string
  sub: string
  selected: boolean
  last?: boolean
  disabled?: boolean
  onPress: () => void
  testID?: string
}) {
  const c = useClubColors()
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={`${title}, ${sub}`}
      testID={testID}
      style={({ pressed }) => [
        styles.row,
        !last && { borderBottomWidth: hairline, borderBottomColor: c.borderSubtle },
        pressed && styles.rowPressed,
      ]}
    >
      <View style={styles.rowText}>
        <Text variant="body" weight="bold" color="primary" numberOfLines={1} style={styles.rowTitle}>
          {title}
        </Text>
        <Text variant="footnote" color="secondary" numberOfLines={1} style={styles.rowSub}>
          {sub}
        </Text>
      </View>
      <View
        style={[
          styles.radio,
          selected
            ? { borderWidth: RADIO_ON_BORDER, borderColor: c.ink }
            : { borderWidth: RADIO_OFF_BORDER, borderColor: c.borderStrong },
        ]}
      />
    </Pressable>
  )
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const c = useClubColors()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      style={[
        styles.chip,
        selected
          ? { backgroundColor: c.ink }
          : { borderWidth: 1, borderColor: c.borderStrong },
      ]}
    >
      <Text variant="footnote" weight="semibold" style={{ color: selected ? c.onInk : c.textPrimary }}>
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  sheet: { gap: SHEET_GAP, paddingTop: SPACING_MD },
  intro: { gap: SPACING_XS + SPACING_XXS },
  title: { fontSize: TITLE_SIZE, lineHeight: TITLE_LINE, letterSpacing: TITLE_TRACKING },
  body: { fontSize: BODY_SIZE, lineHeight: BODY_LINE },
  section: { gap: SECTION_GAP },
  secondLabel: { marginTop: SPACING_XS + SPACING_XXS },
  group: {
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
    paddingHorizontal: SPACING_LG,
  },
  row: {
    minHeight: ROW_MIN_HEIGHT,
    paddingVertical: SPACING_MD,
    flexDirection: 'row',
    alignItems: 'center',
    gap: ROW_GAP,
  },
  rowPressed: { opacity: 0.7 },
  rowText: { flex: 1, minWidth: 0, gap: SPACING_XXS },
  rowTitle: { lineHeight: ROW_TITLE_LINE },
  rowSub: { lineHeight: ROW_SUB_LINE },
  radio: { width: RADIO_SIZE, height: RADIO_SIZE, borderRadius: RADIUS_FULL },
  chips: { flexDirection: 'row', gap: SPACING_SM },
  chip: {
    height: CHIP_HEIGHT,
    paddingHorizontal: CHIP_PAD_X,
    borderRadius: RADIUS_FULL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: { lineHeight: BODY_LINE - 1 },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ROW_GAP,
    paddingVertical: CARD_PAD_Y,
    paddingHorizontal: SPACING_LG,
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
  },
  entryText: { flex: 1, minWidth: 0, gap: SPACING_XXS },
  pressed: { transform: [{ scale: 0.985 }] },
})
