/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type {
  ContributionMemberRecord,
  ContributionOverview,
} from '@anstoss/shared'
import { MembershipRole } from '@anstoss/shared'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { useSafeAreaInsetsSafe } from '../src/utils/useSafeAreaInsetsSafe'
import { api } from '../src/api/client'
import { EmptyState } from '../src/components/EmptyState'
import { ModalHeader } from '../src/components/ModalHeader'
import { Button, Icon, Screen, SectionGroup, Text } from '../src/components/ui'
import { fonts, hairline, radius, space } from '../src/theme/tokens'

const CADENCE_OPTIONS = ['MONTHLY', 'YEARLY'] as const
const TARGET_ROLE_OPTIONS = ['PLAYER', 'PARENT', 'COACH', 'ADMIN', 'CUSTOM'] as const

function withAlpha(hex: string, alpha: number): string {
  if (hex.startsWith('rgb')) {
    return hex.replace(/rgba?\(([^)]+)\)/, (_, body) => {
      const parts = String(body).split(',').map((p) => p.trim()).slice(0, 3)
      return `rgba(${parts.join(', ')}, ${alpha})`
    })
  }
  if (!hex.startsWith('#')) return hex
  let h = hex.slice(1)
  if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export default function AdminContributionPlanScreen() {
  const { t } = useTranslation()
  const { activeClub } = useAuth()
  const c = useClubColors()
  const params = useLocalSearchParams<{ planId?: string | string[] }>()
  const planId = typeof params.planId === 'string' ? params.planId : null
  const clubId = activeClub?.club.id
  const hasBillingAccess =
    Boolean(activeClub?.permissions?.BILLING) ||
    activeClub?.role === MembershipRole.OWNER ||
    activeClub?.role === MembershipRole.ADMIN
  const insets = useSafeAreaInsetsSafe()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [overview, setOverview] = useState<ContributionOverview | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [amountInput, setAmountInput] = useState('')
  const [cadence, setCadence] = useState<(typeof CADENCE_OPTIONS)[number]>('MONTHLY')
  const [targetRole, setTargetRole] =
    useState<(typeof TARGET_ROLE_OPTIONS)[number]>('PLAYER')
  const [dueDayInput, setDueDayInput] = useState('5')
  const [dueMonthInput, setDueMonthInput] = useState('1')
  const [graceDaysInput, setGraceDaysInput] = useState('0')
  const [daysBefore, setDaysBefore] = useState(7)
  const [daysAfter, setDaysAfter] = useState(3)
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!clubId) {
        setLoading(false)
        return
      }

      try {
        const data = await api<ContributionOverview>(`/clubs/${clubId}/contributions`)
        if (cancelled) return

        setOverview(data)

        if (planId) {
          const plan = data.plans.find((entry) => entry.id === planId)
          if (plan) {
            setName(plan.name)
            setDescription(plan.description ?? '')
            setAmountInput((plan.amount / 100).toFixed(2))
            setCadence(plan.cadence as (typeof CADENCE_OPTIONS)[number])
            setTargetRole(plan.targetRole as (typeof TARGET_ROLE_OPTIONS)[number])
            setDueDayInput(String(plan.dueDay))
            setDueMonthInput(String(plan.dueMonth ?? 1))
            setGraceDaysInput(String(plan.graceDays))
            setDaysBefore(plan.reminderPolicy.daysBefore[0] ?? 7)
            setDaysAfter(plan.reminderPolicy.daysAfter[0] ?? 3)
            setSelectedMemberIds(
              data.members
                .filter((m: ContributionMemberRecord) => m.planId === plan.id)
                .map((m) => m.memberUserId),
            )
          }
        }
      } catch {
        Alert.alert(t('common.errorTitle'), t('contributions.loadError'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [clubId, planId, t])

  const eligibleMembers = useMemo(() => {
    return (overview?.members || []).filter((member) =>
      isMemberCompatible(member.role, targetRole),
    )
  }, [overview?.members, targetRole])

  useEffect(() => {
    setSelectedMemberIds((current) =>
      current.filter((id) =>
        eligibleMembers.some((m) => m.memberUserId === id),
      ),
    )
  }, [eligibleMembers])

  const toggleMember = (memberUserId: string) => {
    setSelectedMemberIds((current) =>
      current.includes(memberUserId)
        ? current.filter((id) => id !== memberUserId)
        : [...current, memberUserId],
    )
  }

  const selectAllMembers = () => {
    setSelectedMemberIds(eligibleMembers.map((m) => m.memberUserId))
  }

  const clearMembers = () => {
    setSelectedMemberIds([])
  }

  const handleSave = async () => {
    if (!clubId || !overview) return

    const amount = parseEuroAmount(amountInput)
    const dueDay = Number.parseInt(dueDayInput, 10)
    const dueMonth = Number.parseInt(dueMonthInput, 10)
    const graceDays = Number.parseInt(graceDaysInput, 10) || 0

    if (!name.trim()) {
      Alert.alert(t('common.errorTitle'), t('contributions.planNameRequired'))
      return
    }
    if (Number.isNaN(amount) || amount < 0) {
      Alert.alert(t('common.errorTitle'), t('contributions.amountInvalid'))
      return
    }
    if (Number.isNaN(dueDay) || dueDay < 1 || dueDay > 28) {
      Alert.alert(t('common.errorTitle'), t('contributions.dueDayInvalid'))
      return
    }
    if (cadence === 'YEARLY' && (Number.isNaN(dueMonth) || dueMonth < 1 || dueMonth > 12)) {
      Alert.alert(t('common.errorTitle'), t('contributions.dueMonthInvalid'))
      return
    }

    setSaving(true)
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        amount,
        currency: overview.settings.defaultCurrency,
        cadence,
        targetRole,
        dueDay,
        dueMonth: cadence === 'YEARLY' ? dueMonth : undefined,
        graceDays,
        reminderPolicy: {
          daysBefore: daysBefore > 0 ? [daysBefore] : [],
          daysAfter: daysAfter > 0 ? [daysAfter] : [],
        },
      }

      if (planId) {
        await api(`/clubs/${clubId}/contributions/plans/${planId}`, {
          method: 'PATCH',
          body: payload,
        })
        await api(`/clubs/${clubId}/contributions/assignments`, {
          method: 'POST',
          body: { planId, memberUserIds: selectedMemberIds },
        })
      } else {
        await api(`/clubs/${clubId}/contributions/plans`, {
          method: 'POST',
          body: { ...payload, memberUserIds: selectedMemberIds },
        })
      }

      router.back()
    } catch {
      Alert.alert(t('common.errorTitle'), t('contributions.planSaveError'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = () => {
    if (!planId || !clubId) return
    Alert.alert(
      t('contributions.deletePlanTitle', { defaultValue: 'Delete plan?' }),
      t('contributions.deletePlanBody', {
        defaultValue:
          'This archives the plan. Members will no longer see new dues from it.',
      }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete', { defaultValue: 'Delete' }),
          style: 'destructive',
          onPress: async () => {
            setDeleting(true)
            try {
              await api(`/clubs/${clubId}/contributions/plans/${planId}`, {
                method: 'DELETE',
              })
              router.back()
            } catch {
              Alert.alert(
                t('common.error'),
                t('contributions.deleteError', {
                  defaultValue: 'Could not delete plan. Try again.',
                }),
              )
            } finally {
              setDeleting(false)
            }
          },
        },
      ],
    )
  }

  if (!hasBillingAccess) {
    return (
      <Screen
        header={<ModalHeader title={t('contributions.planScreenTitle')} mode="back" />}
        padded={false}
      >
        <EmptyState
          icon="lock.shield.fill"
          title={t('common.accessDenied')}
          description={t('common.accessDeniedDescription')}
        />
      </Screen>
    )
  }

  if (loading) {
    return (
      <Screen
        header={<ModalHeader title={t('contributions.planScreenTitle')} mode="back" />}
        padded={false}
      >
        <View style={styles.loadingWrap}>
          <Text variant="footnote" color="secondary">
            {t('common.loading')}
          </Text>
        </View>
      </Screen>
    )
  }

  const hasAmount = amountInput.trim().length > 0
  const previewAmount = hasAmount
    ? `${amountInput.trim()} ${overview?.settings.defaultCurrency ?? 'EUR'}`
    : '—'

  return (
    <Screen
      header={<ModalHeader title={t('contributions.planScreenTitle')} mode="back" />}
      padded={false}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Editorial header */}
          <Text style={[styles.eyebrow, { color: c.textTertiary }]}>
            {t('contributions.adminEyebrow', { defaultValue: 'DUES · ADMIN' })}
          </Text>
          <Text variant="title1" color="primary" weight="semibold" style={styles.title}>
            {planId
              ? t('contributions.editPlanTitle', { defaultValue: 'Edit plan' })
              : t('contributions.newPlanTitle', { defaultValue: 'New plan' })}
          </Text>
          <Text variant="footnote" color="secondary" style={styles.subtitle}>
            {t('contributions.planScreenBody')}
          </Text>

          {/* Summary preview card */}
          <View
            style={[
              styles.summaryCard,
              { backgroundColor: c.surface, borderColor: c.borderDefault },
            ]}
          >
            <View style={styles.summaryRow}>
              <View style={styles.summaryStat}>
                <Text variant="title2" color="primary" weight="semibold" tabular numberOfLines={1}>
                  {previewAmount}
                </Text>
                <Text variant="caption2" color="secondary">
                  {t(`contributions.cadence.${cadence}`)}
                </Text>
              </View>
              <View style={[styles.summaryDivider, { backgroundColor: c.borderDefault }]} />
              <View style={styles.summaryStat}>
                <Text variant="title2" color="primary" weight="semibold" tabular>
                  {selectedMemberIds.length}
                </Text>
                <Text variant="caption2" color="secondary">
                  {t('contributions.assignedShort', { defaultValue: 'Assigned' })}
                </Text>
              </View>
            </View>
          </View>

          {/* ── Section: Plan basics ─────────────────────────────────── */}
          <SectionGroup
            header={t('contributions.sectionBasics', { defaultValue: 'Plan basics' })}
            style={styles.formSection}
          >
            <View style={styles.sectionInner}>
              <FieldLabel label={t('contributions.planNameLabel')} c={c} />
              <FieldCard c={c}>
                <TextInput
                  style={[styles.fieldInput, { color: c.textPrimary }]}
                  value={name}
                  onChangeText={setName}
                  placeholder={t('contributions.planNamePlaceholder')}
                  placeholderTextColor={c.textTertiary}
                />
              </FieldCard>

              <FieldLabel label={t('contributions.planDescriptionLabel')} c={c} />
              <FieldCard c={c}>
                <TextInput
                  style={[styles.fieldInput, styles.fieldTextarea, { color: c.textPrimary }]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder={t('contributions.planDescriptionPlaceholder')}
                  placeholderTextColor={c.textTertiary}
                  multiline
                  numberOfLines={3}
                />
              </FieldCard>

              <View style={styles.inlineRow}>
                <View style={styles.inlineField}>
                  <FieldLabel label={t('contributions.amountLabel')} c={c} />
                  <FieldCard c={c}>
                    <TextInput
                      style={[styles.fieldInput, { color: c.textPrimary }]}
                      value={amountInput}
                      onChangeText={setAmountInput}
                      placeholder="15.00"
                      placeholderTextColor={c.textTertiary}
                      keyboardType="decimal-pad"
                    />
                  </FieldCard>
                </View>
                <View style={styles.inlineField}>
                  <FieldLabel label={t('contributions.graceDaysLabel')} c={c} />
                  <FieldCard c={c}>
                    <TextInput
                      style={[styles.fieldInput, { color: c.textPrimary }]}
                      value={graceDaysInput}
                      onChangeText={setGraceDaysInput}
                      placeholder="0"
                      placeholderTextColor={c.textTertiary}
                      keyboardType="number-pad"
                    />
                  </FieldCard>
                </View>
              </View>
            </View>
          </SectionGroup>

          {/* ── Section: Schedule ────────────────────────────────────── */}
          <SectionGroup
            header={t('contributions.sectionSchedule', { defaultValue: 'Schedule' })}
            style={styles.formSection}
          >
            <View style={styles.sectionInner}>
              <FieldLabel label={t('contributions.cadenceLabel')} c={c} />
              <View style={styles.segmentRow}>
                {CADENCE_OPTIONS.map((option) => {
                  const active = cadence === option
                  return (
                    <Pressable
                      key={option}
                      accessibilityRole="button"
                      accessibilityLabel={t(`contributions.cadence.${option}`)}
                      accessibilityState={{ selected: active }}
                      onPress={() => setCadence(option)}
                      style={[
                        styles.segmentPill,
                        active
                          ? { backgroundColor: c.textPrimary, borderColor: c.textPrimary }
                          : { borderColor: c.borderStrong, backgroundColor: c.surface },
                      ]}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          { color: active ? c.textInverse : c.textPrimary },
                        ]}
                      >
                        {t(`contributions.cadence.${option}`)}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>

              <View style={styles.inlineRow}>
                <View style={styles.inlineField}>
                  <FieldLabel label={t('contributions.dueDayLabel')} c={c} />
                  <FieldCard c={c}>
                    <TextInput
                      style={[styles.fieldInput, { color: c.textPrimary }]}
                      value={dueDayInput}
                      onChangeText={setDueDayInput}
                      placeholder="5"
                      placeholderTextColor={c.textTertiary}
                      keyboardType="number-pad"
                    />
                  </FieldCard>
                </View>
                {cadence === 'YEARLY' ? (
                  <View style={styles.inlineField}>
                    <FieldLabel label={t('contributions.dueMonthLabel')} c={c} />
                    <FieldCard c={c}>
                      <TextInput
                        style={[styles.fieldInput, { color: c.textPrimary }]}
                        value={dueMonthInput}
                        onChangeText={setDueMonthInput}
                        placeholder="1"
                        placeholderTextColor={c.textTertiary}
                        keyboardType="number-pad"
                      />
                    </FieldCard>
                  </View>
                ) : null}
              </View>
            </View>
          </SectionGroup>

          {/* ── Section: Reminders ───────────────────────────────────── */}
          <SectionGroup
            header={t('contributions.sectionReminders', { defaultValue: 'Reminders' })}
            footer={t('contributions.reminderPolicyFooter', {
              defaultValue: 'Set 0 days to disable a reminder.',
            })}
            style={styles.formSection}
          >
            <View style={styles.sectionInner}>
              <Stepper
                label={t('contributions.daysBeforeLabel')}
                value={daysBefore}
                onChange={setDaysBefore}
                c={c}
                max={30}
              />
              <Stepper
                label={t('contributions.daysAfterLabel')}
                value={daysAfter}
                onChange={setDaysAfter}
                c={c}
                max={30}
              />
            </View>
          </SectionGroup>

          {/* ── Section: Members ─────────────────────────────────────── */}
          <SectionGroup
            header={t('contributions.sectionMembers', { defaultValue: 'Members' })}
            style={styles.formSection}
          >
            <View style={styles.sectionInner}>
              {/* Target role chips */}
              <FieldLabel label={t('contributions.targetRoleLabel')} c={c} />
              <View style={styles.chipGrid}>
                {TARGET_ROLE_OPTIONS.map((option) => {
                  const active = targetRole === option
                  return (
                    <Pressable
                      key={option}
                      accessibilityRole="button"
                      accessibilityLabel={t(`contributions.targetRole.${option}`)}
                      accessibilityState={{ selected: active }}
                      onPress={() => setTargetRole(option)}
                      style={[
                        styles.roleChip,
                        active
                          ? { backgroundColor: withAlpha(c.primary, 0.12), borderColor: c.primary }
                          : { borderColor: c.borderStrong, backgroundColor: c.surface },
                      ]}
                    >
                      <Text
                        style={[
                          styles.roleChipText,
                          { color: active ? c.primary : c.textPrimary },
                        ]}
                      >
                        {t(`contributions.targetRole.${option}`)}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>

              {/* Member picker */}
              <View style={styles.memberHeader}>
                <Text style={[styles.fieldLabel, { color: c.textTertiary }]}>
                  {t('contributions.memberSelectionTitle').toUpperCase()}
                </Text>
                <View style={styles.memberHeaderActions}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={selectAllMembers}
                    style={({ pressed }) => [pressed && { opacity: 0.5 }]}
                  >
                    <Text style={[styles.memberAction, { color: c.primary }]}>
                      {t('common.selectAll', { defaultValue: 'Select all' })}
                    </Text>
                  </Pressable>
                  <Text style={[styles.memberActionDivider, { color: c.textTertiary }]}>·</Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={clearMembers}
                    style={({ pressed }) => [pressed && { opacity: 0.5 }]}
                  >
                    <Text style={[styles.memberAction, { color: c.textSecondary }]}>
                      {t('common.clear', { defaultValue: 'Clear' })}
                    </Text>
                  </Pressable>
                </View>
              </View>

              {eligibleMembers.length === 0 ? (
                <View
                  style={[
                    styles.emptyMembers,
                    { backgroundColor: c.surface, borderColor: c.borderDefault },
                  ]}
                >
                  <Text variant="footnote" color="secondary">
                    {t('contributions.noEligibleMembers')}
                  </Text>
                </View>
              ) : (
                <View
                  style={[
                    styles.memberCard,
                    { backgroundColor: c.surface, borderColor: c.borderDefault },
                  ]}
                >
                  {eligibleMembers.map((member, index) => {
                    const active = selectedMemberIds.includes(member.memberUserId)
                    const initials = member.name
                      .split(' ')
                      .map((p) => p[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()
                    return (
                      <Pressable
                        key={member.memberUserId}
                        accessibilityRole="button"
                        accessibilityLabel={member.name}
                        accessibilityState={{ selected: active }}
                        onPress={() => toggleMember(member.memberUserId)}
                        style={({ pressed }) => [
                          styles.memberRow,
                          index > 0 && {
                            borderTopWidth: hairline,
                            borderTopColor: c.borderDefault,
                          },
                          pressed && { backgroundColor: c.surfaceSunken ?? c.background },
                        ]}
                      >
                        <View
                          style={[
                            styles.memberAvatar,
                            {
                              backgroundColor: active ? c.primary : c.surfaceSunken ?? c.background,
                              borderColor: active ? c.primary : c.borderDefault,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.memberAvatarText,
                              { color: active ? c.textInverse : c.textPrimary },
                            ]}
                          >
                            {initials}
                          </Text>
                        </View>
                        <View style={styles.memberCopy}>
                          <Text style={[styles.memberName, { color: c.textPrimary }]} numberOfLines={1}>
                            {member.name}
                          </Text>
                          {member.email ? (
                            <Text
                              style={[styles.memberMeta, { color: c.textSecondary }]}
                              numberOfLines={1}
                            >
                              {member.email}
                            </Text>
                          ) : null}
                        </View>
                        <View
                          style={[
                            styles.memberCheck,
                            active
                              ? { backgroundColor: c.primary }
                              : { borderColor: c.borderStrong, borderWidth: hairline },
                          ]}
                        >
                          {active ? <Icon name="checkmark" size={12} color="inverse" /> : null}
                        </View>
                      </Pressable>
                    )
                  })}
                </View>
              )}
            </View>
          </SectionGroup>
        </ScrollView>

        <View
          style={[
            styles.footer,
            { backgroundColor: c.background, borderTopColor: c.borderDefault, paddingBottom: space.md + insets.bottom },
          ]}
        >
          <Button
            label={planId ? t('contributions.updatePlan') : t('contributions.savePlan')}
            variant="filled"
            size="lg"
            fullWidth
            loading={saving}
            disabled={saving || deleting}
            onPress={handleSave}
          />
          {planId ? (
            <Pressable
              accessibilityRole="button"
              onPress={handleDelete}
              disabled={saving || deleting}
              style={({ pressed }) => [
                styles.deleteBtn,
                pressed && { opacity: 0.5 },
                (saving || deleting) && { opacity: 0.5 },
              ]}
            >
              <Text style={[styles.deleteText, { color: c.error }]}>
                {deleting
                  ? t('common.deleting', { defaultValue: 'Deleting…' })
                  : t('contributions.deletePlan', { defaultValue: 'Delete plan' })}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  )
}

function FieldLabel({
  label,
  c,
}: {
  label: string
  c: ReturnType<typeof useClubColors>
}) {
  return (
    <Text style={[styles.fieldLabel, { color: c.textTertiary }]}>
      {label.toUpperCase()}
    </Text>
  )
}

function FieldCard({
  children,
  c,
}: {
  children: React.ReactNode
  c: ReturnType<typeof useClubColors>
}) {
  return (
    <View
      style={[
        styles.fieldCard,
        { backgroundColor: c.surface, borderColor: c.borderDefault },
      ]}
    >
      {children}
    </View>
  )
}

function Stepper({
  label,
  value,
  onChange,
  c,
  max,
}: {
  label: string
  value: number
  onChange: (next: number) => void
  c: ReturnType<typeof useClubColors>
  max: number
}) {
  return (
    <View
      style={[
        styles.stepperRow,
        { backgroundColor: c.surface, borderColor: c.borderDefault },
      ]}
    >
      <Text style={[styles.stepperLabel, { color: c.textPrimary }]}>{label}</Text>
      <View style={styles.stepperControls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="decrement"
          onPress={() => onChange(Math.max(0, value - 1))}
          style={({ pressed }) => [
            styles.stepperBtn,
            { borderColor: c.borderStrong },
            pressed && { opacity: 0.5 },
          ]}
        >
          <Text style={[styles.stepperBtnText, { color: c.textPrimary }]}>−</Text>
        </Pressable>
        <Text style={[styles.stepperValue, { color: c.textPrimary }]} numberOfLines={1}>
          {String(value)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="increment"
          onPress={() => onChange(Math.min(max, value + 1))}
          style={({ pressed }) => [
            styles.stepperBtn,
            { borderColor: c.borderStrong },
            pressed && { opacity: 0.5 },
          ]}
        >
          <Text style={[styles.stepperBtnText, { color: c.textPrimary }]}>+</Text>
        </Pressable>
      </View>
    </View>
  )
}

function parseEuroAmount(value: string) {
  const normalized = value.replace(',', '.').trim()
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : Number.NaN
}

function isMemberCompatible(
  role: ContributionMemberRecord['role'],
  targetRole: (typeof TARGET_ROLE_OPTIONS)[number],
) {
  switch (targetRole) {
    case 'PLAYER':
      return role === 'PLAYER'
    case 'PARENT':
      return role === 'PARENT'
    case 'COACH':
      return role === 'COACH'
    case 'ADMIN':
      return role === 'ADMIN' || role === 'OWNER'
    case 'CUSTOM':
      return true
    default:
      return false
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space['2xl'] * 2,
    gap: 10,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
  },

  formSection: {
    // horizontal margin matches content padding so sections align with eyebrow/title
  },
  sectionInner: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: space.xs,
  },

  eyebrow: {
    fontSize: 11,
    fontFamily: fonts.label,
    letterSpacing: 1.4,
    fontWeight: '700',
  },
  title: { letterSpacing: -0.3, marginTop: 2 },
  subtitle: { marginTop: 4, lineHeight: 18 },

  summaryCard: {
    marginTop: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  summaryStat: { flex: 1, gap: 2 },
  summaryDivider: { width: hairline, height: 36 },

  fieldLabel: {
    fontSize: 11,
    fontFamily: fonts.label,
    letterSpacing: 1.4,
    fontWeight: '700',
    marginTop: space.sm,
    marginLeft: 4,
  },
  fieldCard: {
    borderRadius: radius.md,
    borderWidth: hairline,
    overflow: 'hidden',
  },
  fieldInput: {
    paddingHorizontal: space.md,
    paddingVertical: 14,
    fontSize: 15,
    fontFamily: fonts.body,
    minHeight: 48,
  },
  fieldTextarea: {
    minHeight: 88,
    paddingTop: 12,
    textAlignVertical: 'top',
  },

  inlineRow: { flexDirection: 'row', gap: space.sm },
  inlineField: { flex: 1, gap: 0 },

  segmentRow: { flexDirection: 'row', gap: space.xs, marginTop: 6 },
  segmentPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1.25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: {
    fontSize: 13,
    fontFamily: fonts.label,
    fontWeight: '600',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },

  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  roleChip: {
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.25,
  },
  roleChipText: {
    fontSize: 12,
    fontFamily: fonts.label,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },

  stepperRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: hairline,
  },
  stepperLabel: { fontSize: 13, fontFamily: fonts.body, flex: 1 },
  stepperControls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepperBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnText: { fontSize: 18, fontFamily: fonts.label, fontWeight: '600' },
  stepperValue: {
    minWidth: 28,
    textAlign: 'center',
    fontSize: 16,
    fontFamily: fonts.label,
    fontWeight: '700',
    letterSpacing: 0.2,
    fontVariant: ['tabular-nums'],
  },

  memberHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.sm,
  },
  memberHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  memberAction: {
    fontSize: 11,
    fontFamily: fonts.label,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  memberActionDivider: { fontSize: 11, fontFamily: fonts.label },

  emptyMembers: {
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: hairline,
    alignItems: 'center',
  },
  memberCard: {
    borderRadius: radius.md,
    borderWidth: hairline,
    overflow: 'hidden',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: space.md,
    paddingVertical: 10,
  },
  memberAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarText: { fontSize: 12, fontFamily: fonts.label, fontWeight: '700' },
  memberCopy: { flex: 1, gap: 2 },
  memberName: { fontSize: 14, fontFamily: fonts.label, fontWeight: '600' },
  memberMeta: { fontSize: 12, fontFamily: fonts.body },
  memberCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },

  footer: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.md,
    borderTopWidth: hairline,
    gap: 6,
  },
  deleteBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  deleteText: {
    fontSize: 13,
    fontFamily: fonts.label,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
})
