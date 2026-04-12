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
import type { ContributionMemberRecord, ContributionOverview, ContributionPlan } from '@anstoss/shared'
import { MembershipRole } from '@anstoss/shared'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { EmptyState } from '../src/components/EmptyState'
import { ModalHeader } from '../src/components/ModalHeader'
import { Button, Card, Screen, Text } from '../src/components/ui'
import {
  card,
  fontSize,
  fonts,
  hairline,
  lineHeight,
  radius,
  space,
} from '../src/theme/tokens'

const CADENCE_OPTIONS = ['MONTHLY', 'YEARLY'] as const
const TARGET_ROLE_OPTIONS = ['PLAYER', 'PARENT', 'COACH', 'ADMIN', 'CUSTOM'] as const

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

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
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
  const [daysBeforeInput, setDaysBeforeInput] = useState('7,1')
  const [daysAfterInput, setDaysAfterInput] = useState('3,7')
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
        if (cancelled) {
          return
        }

        setOverview(data)

        if (planId) {
          const plan = data.plans.find((entry) => entry.id === planId)
          if (plan) {
            hydrateForm(plan, data.members, {
              setName,
              setDescription,
              setAmountInput,
              setCadence,
              setTargetRole,
              setDueDayInput,
              setDueMonthInput,
              setGraceDaysInput,
              setDaysBeforeInput,
              setDaysAfterInput,
              setSelectedMemberIds,
            })
          }
        }
      } catch {
        Alert.alert(t('common.errorTitle'), t('contributions.loadError'))
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
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
      current.filter((memberUserId) =>
        eligibleMembers.some((member) => member.memberUserId === memberUserId),
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

  const handleSave = async () => {
    if (!clubId || !overview) {
      return
    }

    const amount = parseEuroAmount(amountInput)
    const dueDay = Number.parseInt(dueDayInput, 10)
    const dueMonth = Number.parseInt(dueMonthInput, 10)
    const graceDays = Number.parseInt(graceDaysInput, 10) || 0
    const daysBefore = parseOffsetList(daysBeforeInput)
    const daysAfter = parseOffsetList(daysAfterInput)

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
          daysBefore,
          daysAfter,
        },
      }

      if (planId) {
        await api(`/clubs/${clubId}/contributions/plans/${planId}`, {
          method: 'PATCH',
          body: payload,
        })
        await api(`/clubs/${clubId}/contributions/assignments`, {
          method: 'POST',
          body: {
            planId,
            memberUserIds: selectedMemberIds,
          },
        })
      } else {
        await api(`/clubs/${clubId}/contributions/plans`, {
          method: 'POST',
          body: {
            ...payload,
            memberUserIds: selectedMemberIds,
          },
        })
      }

      router.back()
    } catch {
      Alert.alert(t('common.errorTitle'), t('contributions.planSaveError'))
    } finally {
      setSaving(false)
    }
  }

  if (!hasBillingAccess) {
    return (
      <Screen header={<ModalHeader title={t('contributions.planScreenTitle')} mode="back" />} padded={false}>
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
      <Screen header={<ModalHeader title={t('contributions.planScreenTitle')} mode="back" />} padded={false}>
        <Card style={styles.loadingCard}>
          <Text style={[styles.helper, { color: c.textSecondary }]}>{t('common.loading')}</Text>
        </Card>
      </Screen>
    )
  }

  return (
    <Screen header={<ModalHeader title={t('contributions.planScreenTitle')} mode="back" />} padded={false}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={[styles.helper, { color: c.textSecondary }]}>
            {t('contributions.planScreenBody')}
          </Text>

          <Text style={[styles.label, { color: c.textPrimary }]}>{t('contributions.planNameLabel')}</Text>
          <TextInput
            style={[styles.input, { borderColor: c.border, backgroundColor: c.surface, color: c.textPrimary }]}
            value={name}
            onChangeText={setName}
            placeholder={t('contributions.planNamePlaceholder')}
            placeholderTextColor={c.textTertiary}
          />

          <Text style={[styles.label, { color: c.textPrimary }]}>{t('contributions.planDescriptionLabel')}</Text>
          <TextInput
            style={[styles.input, styles.textArea, { borderColor: c.border, backgroundColor: c.surface, color: c.textPrimary }]}
            value={description}
            onChangeText={setDescription}
            placeholder={t('contributions.planDescriptionPlaceholder')}
            placeholderTextColor={c.textTertiary}
            multiline
            numberOfLines={3}
          />

          <View style={styles.inlineRow}>
            <View style={styles.inlineField}>
              <Text style={[styles.label, { color: c.textPrimary }]}>{t('contributions.amountLabel')}</Text>
              <TextInput
                style={[styles.input, { borderColor: c.border, backgroundColor: c.surface, color: c.textPrimary }]}
                value={amountInput}
                onChangeText={setAmountInput}
                placeholder="15.00"
                placeholderTextColor={c.textTertiary}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.inlineField}>
              <Text style={[styles.label, { color: c.textPrimary }]}>{t('contributions.graceDaysLabel')}</Text>
              <TextInput
                style={[styles.input, { borderColor: c.border, backgroundColor: c.surface, color: c.textPrimary }]}
                value={graceDaysInput}
                onChangeText={setGraceDaysInput}
                placeholder="0"
                placeholderTextColor={c.textTertiary}
                keyboardType="number-pad"
              />
            </View>
          </View>

          <Text style={[styles.label, { color: c.textPrimary }]}>{t('contributions.cadenceLabel')}</Text>
          <View style={styles.chipRow}>
            {CADENCE_OPTIONS.map((option) => {
              const active = cadence === option
              return (
                <Pressable
                  key={option}
                  style={[
                    styles.choiceChip,
                    { borderColor: c.border, backgroundColor: c.surface },
                    active && { borderColor: c.clubPrimary, backgroundColor: c.clubPrimaryLight },
                  ]}
                  onPress={() => setCadence(option)}
                >
                  <Text
                    style={[
                      styles.choiceChipText,
                      { color: active ? c.clubPrimary : c.textPrimary },
                    ]}
                  >
                    {t(`contributions.cadence.${option}`)}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          <Text style={[styles.label, { color: c.textPrimary }]}>{t('contributions.targetRoleLabel')}</Text>
          <View style={styles.chipGrid}>
            {TARGET_ROLE_OPTIONS.map((option) => {
              const active = targetRole === option
              return (
                <Pressable
                  key={option}
                  style={[
                    styles.choiceChip,
                    { borderColor: c.border, backgroundColor: c.surface },
                    active && { borderColor: c.clubPrimary, backgroundColor: c.clubPrimaryLight },
                  ]}
                  onPress={() => setTargetRole(option)}
                >
                  <Text
                    style={[
                      styles.choiceChipText,
                      { color: active ? c.clubPrimary : c.textPrimary },
                    ]}
                  >
                    {t(`contributions.targetRole.${option}`)}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          <View style={styles.inlineRow}>
            <View style={styles.inlineField}>
              <Text style={[styles.label, { color: c.textPrimary }]}>{t('contributions.dueDayLabel')}</Text>
              <TextInput
                style={[styles.input, { borderColor: c.border, backgroundColor: c.surface, color: c.textPrimary }]}
                value={dueDayInput}
                onChangeText={setDueDayInput}
                placeholder="5"
                placeholderTextColor={c.textTertiary}
                keyboardType="number-pad"
              />
            </View>
            {cadence === 'YEARLY' ? (
              <View style={styles.inlineField}>
                <Text style={[styles.label, { color: c.textPrimary }]}>{t('contributions.dueMonthLabel')}</Text>
                <TextInput
                  style={[styles.input, { borderColor: c.border, backgroundColor: c.surface, color: c.textPrimary }]}
                  value={dueMonthInput}
                  onChangeText={setDueMonthInput}
                  placeholder="1"
                  placeholderTextColor={c.textTertiary}
                  keyboardType="number-pad"
                />
              </View>
            ) : null}
          </View>

          <View style={styles.inlineRow}>
            <View style={styles.inlineField}>
              <Text style={[styles.label, { color: c.textPrimary }]}>{t('contributions.daysBeforeLabel')}</Text>
              <TextInput
                style={[styles.input, { borderColor: c.border, backgroundColor: c.surface, color: c.textPrimary }]}
                value={daysBeforeInput}
                onChangeText={setDaysBeforeInput}
                placeholder="7,1"
                placeholderTextColor={c.textTertiary}
              />
            </View>
            <View style={styles.inlineField}>
              <Text style={[styles.label, { color: c.textPrimary }]}>{t('contributions.daysAfterLabel')}</Text>
              <TextInput
                style={[styles.input, { borderColor: c.border, backgroundColor: c.surface, color: c.textPrimary }]}
                value={daysAfterInput}
                onChangeText={setDaysAfterInput}
                placeholder="3,7"
                placeholderTextColor={c.textTertiary}
              />
            </View>
          </View>

          <Text style={[styles.label, { color: c.textPrimary }]}>{t('contributions.memberSelectionTitle')}</Text>
          <Text style={[styles.helper, { color: c.textSecondary }]}>
            {t('contributions.memberSelectionBody')}
          </Text>

          {eligibleMembers.length === 0 ? (
            <Card style={styles.emptyMembersCard}>
              <Text style={[styles.helper, { color: c.textSecondary }]}>
                {t('contributions.noEligibleMembers')}
              </Text>
            </Card>
          ) : (
            <Card style={styles.memberListCard}>
              {eligibleMembers.map((member, index) => {
                const active = selectedMemberIds.includes(member.memberUserId)
                return (
                  <Pressable
                    key={member.memberUserId}
                    style={[
                      styles.memberRow,
                      index > 0 && { borderTopWidth: hairline, borderTopColor: c.border },
                    ]}
                    onPress={() => toggleMember(member.memberUserId)}
                  >
                    <View style={styles.memberCopy}>
                      <Text style={[styles.memberName, { color: c.textPrimary }]}>
                        {member.name}
                      </Text>
                      <Text style={[styles.memberMeta, { color: c.textSecondary }]}>
                        {member.email}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.checkbox,
                        { borderColor: active ? c.clubPrimary : c.borderStrong },
                        active && { backgroundColor: c.clubPrimary },
                      ]}
                    >
                      {active ? (
                        <Text style={styles.checkboxTick}>✓</Text>
                      ) : null}
                    </View>
                  </Pressable>
                )
              })}
            </Card>
          )}
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: c.background, borderTopColor: c.border }]}>
          <Button
            label={planId ? t('contributions.updatePlan') : t('contributions.savePlan')}
            variant="filled"
            size="lg"
            fullWidth
            loading={saving}
            disabled={saving}
            onPress={handleSave}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  )
}

function hydrateForm(
  plan: ContributionPlan,
  members: ContributionMemberRecord[],
  setters: {
    setName: (value: string) => void
    setDescription: (value: string) => void
    setAmountInput: (value: string) => void
    setCadence: (value: (typeof CADENCE_OPTIONS)[number]) => void
    setTargetRole: (value: (typeof TARGET_ROLE_OPTIONS)[number]) => void
    setDueDayInput: (value: string) => void
    setDueMonthInput: (value: string) => void
    setGraceDaysInput: (value: string) => void
    setDaysBeforeInput: (value: string) => void
    setDaysAfterInput: (value: string) => void
    setSelectedMemberIds: (value: string[]) => void
  },
) {
  setters.setName(plan.name)
  setters.setDescription(plan.description ?? '')
  setters.setAmountInput((plan.amount / 100).toFixed(2))
  setters.setCadence(plan.cadence as (typeof CADENCE_OPTIONS)[number])
  setters.setTargetRole(plan.targetRole as (typeof TARGET_ROLE_OPTIONS)[number])
  setters.setDueDayInput(String(plan.dueDay))
  setters.setDueMonthInput(String(plan.dueMonth ?? 1))
  setters.setGraceDaysInput(String(plan.graceDays))
  setters.setDaysBeforeInput(plan.reminderPolicy.daysBefore.join(','))
  setters.setDaysAfterInput(plan.reminderPolicy.daysAfter.join(','))
  setters.setSelectedMemberIds(
    members
      .filter((member) => member.planId === plan.id)
      .map((member) => member.memberUserId),
  )
}

function parseEuroAmount(value: string) {
  const normalized = value.replace(',', '.').trim()
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : Number.NaN
}

function parseOffsetList(value: string) {
  return value
    .split(',')
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((item) => Number.isFinite(item) && item >= 0)
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
  flex: {
    flex: 1,
  },
  content: {
    padding: space.md,
    paddingBottom: space.lg,
  },
  loadingCard: {
    marginHorizontal: space.md,
    marginTop: space.md,
  },
  helper: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
    marginBottom: space.sm,
  },
  label: {
    fontSize: fontSize.sm,
    fontFamily: fonts.label,
    marginTop: space.md,
    marginBottom: space.sm,
  },
  input: {
    minHeight: 52,
    borderWidth: hairline,
    borderRadius: card.radius,
    paddingHorizontal: space.md,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
  },
  textArea: {
    minHeight: 88,
    paddingTop: space.md,
    textAlignVertical: 'top',
  },
  inlineRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  inlineField: {
    flex: 1,
  },
  chipRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  choiceChip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: card.radius,
    borderWidth: hairline,
  },
  choiceChipText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.label,
  },
  emptyMembersCard: {
    marginTop: space.sm,
  },
  memberListCard: {
    marginTop: space.sm,
    paddingVertical: 0,
    borderRadius: card.radius,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  memberCopy: {
    flex: 1,
  },
  memberName: {
    fontSize: fontSize.md,
    fontFamily: fonts.label,
  },
  memberMeta: {
    marginTop: space.xs,
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxTick: {
    color: '#FFFFFF',
    fontSize: fontSize.sm,
    fontFamily: fonts.heading,
  },
  footer: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.md,
    borderTopWidth: hairline,
  },
})
