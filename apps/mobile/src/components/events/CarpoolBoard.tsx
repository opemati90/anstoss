import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { CarpoolBoard as CarpoolBoardData, CarpoolRideItem } from '@anstoss/shared'
import { api, ApiError } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useClubColors } from '../../context/ClubThemeContext'
import { Avatar, BottomSheet, Button, Icon, Text } from '../ui'
import { Skeleton } from '../Skeleton'
import { EmptyState } from '../EmptyState'
import { fonts, hairline, radius, space, RADIUS_INPUT, SPACING_XXS } from '../../theme/tokens'
import { Haptics } from '../../utils/haptics'
import { formatClock } from './eventFormat'

export type CarpoolRider = { userId: string; name: string }

export type CarpoolBoardProps = {
  clubId: string
  eventId: string
  /** Kickoff / start, used to default the departure time. */
  eventDate: string
  meetingAt?: string | null
  locale: string
  /** The people the viewer books seats for: themselves, or their children. */
  riders: CarpoolRider[]
  cancelled?: boolean
}

const SEAT_OPTIONS = [1, 2, 3, 4, 5, 6] as const

/**
 * Fahrten: who drives, from where, how many seats are free. One tap takes a
 * seat; offering a ride is a three-field sheet with sensible defaults (three
 * seats, leave 15 minutes before the Treffpunkt).
 */
export function CarpoolBoard({
  clubId,
  eventId,
  eventDate,
  meetingAt,
  locale,
  riders,
  cancelled,
}: CarpoolBoardProps) {
  const { t } = useTranslation()
  const c = useClubColors()
  const { user } = useAuth()
  const [board, setBoard] = useState<CarpoolBoardData | null>(null)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [offerOpen, setOfferOpen] = useState(false)

  const base = `/clubs/${clubId}/events/${eventId}/carpool`

  const load = useCallback(async () => {
    setError(false)
    try {
      setBoard(await api<CarpoolBoardData>(base))
    } catch {
      setError(true)
    }
  }, [base])

  useEffect(() => {
    void load()
  }, [load])

  const rides = board?.rides ?? []
  const freeSeats = rides.reduce((sum, ride) => sum + Math.max(0, ride.seats - ride.passengers.length), 0)
  const iDrive = rides.some((ride) => ride.isMine)

  const seatAction = async (ride: CarpoolRideItem, rider: CarpoolRider, seated: boolean) => {
    const key = `${ride.id}:${rider.userId}`
    if (busy) return
    setBusy(key)
    Haptics.tap()
    try {
      const isSelf = rider.userId === user?.id
      const next = await api<CarpoolBoardData>(`${base}/${ride.id}/seat`, {
        method: seated ? 'DELETE' : 'POST',
        body: isSelf ? {} : { childUserId: rider.userId },
      })
      setBoard(next)
      Haptics.success()
    } catch (err) {
      Haptics.fail()
      const full = err instanceof ApiError && err.status === 409
      Alert.alert(
        full ? t('eventFlow.carpool.fullTitle') : t('eventFlow.carpool.seatFailedTitle'),
        full ? t('eventFlow.carpool.fullBody') : t('eventFlow.carpool.seatFailedBody'),
      )
      void load()
    } finally {
      setBusy(null)
    }
  }

  const deleteRide = (ride: CarpoolRideItem) => {
    Alert.alert(t('eventFlow.carpool.deleteTitle'), t('eventFlow.carpool.deleteBody'), [
      { text: t('eventFlow.cancelAction'), style: 'cancel' },
      {
        text: t('eventFlow.carpool.deleteConfirm'),
        style: 'destructive',
        onPress: async () => {
          setBusy(ride.id)
          try {
            await api(`${base}/${ride.id}`, { method: 'DELETE' })
            await load()
          } catch {
            Alert.alert(t('eventFlow.carpool.seatFailedTitle'), t('eventFlow.carpool.seatFailedBody'))
          } finally {
            setBusy(null)
          }
        },
      },
    ])
  }

  if (error) {
    return (
      <EmptyState
        compact
        icon="exclamationmark.circle"
        title={t('eventFlow.carpool.loadError')}
        description={t('eventFlow.carpool.loadErrorBody')}
        actionLabel={t('eventFlow.retry')}
        onAction={() => void load()}
      />
    )
  }

  if (!board) {
    return (
      <View style={styles.root}>
        <Skeleton shape="card" height={120} />
        <Skeleton shape="card" height={120} />
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <View style={[styles.summary, { backgroundColor: c.surface, borderColor: c.borderSubtle }]}>
        <View style={styles.summaryStat}>
          <Text variant="title2" color="primary" tabular>
            {String(rides.length)}
          </Text>
          <Text variant="caption1" color="secondary">
            {t('eventFlow.carpool.drivers', { count: rides.length })}
          </Text>
        </View>
        <View style={[styles.divider, { backgroundColor: c.borderSubtle }]} />
        <View style={styles.summaryStat}>
          <Text variant="title2" color={freeSeats > 0 ? 'tint' : 'primary'} tabular>
            {String(freeSeats)}
          </Text>
          <Text variant="caption1" color="secondary">
            {t('eventFlow.carpool.freeSeats', { count: freeSeats })}
          </Text>
        </View>
      </View>

      {rides.length === 0 ? (
        <EmptyState
          compact
          icon="car"
          title={t('eventFlow.carpool.emptyTitle')}
          description={t('eventFlow.carpool.emptyBody')}
        />
      ) : (
        rides.map((ride) => (
          <RideCard
            key={ride.id}
            ride={ride}
            locale={locale}
            riders={riders}
            busyKey={busy}
            disabled={Boolean(cancelled)}
            onSeat={seatAction}
            onDelete={ride.isMine ? () => deleteRide(ride) : undefined}
          />
        ))
      )}

      {!cancelled && !iDrive ? (
        <Button
          label={t('eventFlow.carpool.offer')}
          variant={rides.length === 0 ? 'filled' : 'bordered'}
          size="lg"
          fullWidth
          leftIcon={<Icon name="car" size={16} color={rides.length === 0 ? c.textInverse : c.textPrimary} />}
          onPress={() => setOfferOpen(true)}
          testID="carpool-offer"
        />
      ) : null}

      <OfferSheet
        visible={offerOpen}
        onClose={() => setOfferOpen(false)}
        defaultDepart={defaultDeparture(eventDate, meetingAt)}
        locale={locale}
        onSubmit={async (payload) => {
          try {
            await api(base, { method: 'POST', body: payload })
            setOfferOpen(false)
            Haptics.success()
            await load()
          } catch {
            Haptics.fail()
            Alert.alert(t('eventFlow.carpool.offerFailedTitle'), t('eventFlow.carpool.offerFailedBody'))
          }
        }}
      />
    </View>
  )
}

function defaultDeparture(eventDate: string, meetingAt?: string | null): Date {
  const anchor = new Date(meetingAt ?? new Date(new Date(eventDate).getTime() - 60 * 60000).toISOString())
  return new Date(anchor.getTime() - 15 * 60000)
}

function RideCard({
  ride,
  locale,
  riders,
  busyKey,
  disabled,
  onSeat,
  onDelete,
}: {
  ride: CarpoolRideItem
  locale: string
  riders: CarpoolRider[]
  busyKey: string | null
  disabled: boolean
  onSeat: (ride: CarpoolRideItem, rider: CarpoolRider, seated: boolean) => void
  onDelete?: () => void
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  const free = Math.max(0, ride.seats - ride.passengers.length)
  const seatedIds = useMemo(() => new Set(ride.passengers.map((p) => p.userId)), [ride.passengers])
  const depart = [
    ride.departAt ? formatClock(ride.departAt, locale) : null,
    ride.departFrom,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <View style={[styles.ride, { backgroundColor: c.surface, borderColor: c.borderSubtle }]}>
      <View style={styles.rideHead}>
        <Avatar size="md" src={ride.driver.avatarUrl} fallbackText={ride.driver.name} />
        <View style={styles.flex}>
          <Text variant="headline" weight="semibold" color="primary" numberOfLines={1}>
            {ride.isMine ? t('eventFlow.carpool.youDrive') : ride.driver.name}
          </Text>
          {depart ? (
            <Text variant="subheadline" color="secondary" tabular numberOfLines={1}>
              {depart}
            </Text>
          ) : null}
        </View>
        <View style={styles.seatBadge}>
          <Text variant="headline" weight="semibold" color={free > 0 ? 'tint' : 'tertiary'} tabular>
            {`${ride.passengers.length}/${ride.seats}`}
          </Text>
          <Text variant="caption1" color="tertiary">
            {free > 0 ? t('eventFlow.carpool.seatsFree', { count: free }) : t('eventFlow.carpool.full')}
          </Text>
        </View>
      </View>

      {ride.note ? (
        <Text variant="footnote" color="secondary">
          {ride.note}
        </Text>
      ) : null}

      {ride.passengers.length > 0 ? (
        <Text variant="footnote" color="secondary" numberOfLines={2}>
          {t('eventFlow.carpool.passengers', {
            names: ride.passengers.map((p) => p.name).join(', '),
          })}
        </Text>
      ) : null}

      {!ride.isMine && !disabled ? (
        <View style={styles.actions}>
          {riders.map((rider) => {
            const seated = seatedIds.has(rider.userId)
            const key = `${ride.id}:${rider.userId}`
            const label = seated
              ? riders.length > 1
                ? t('eventFlow.carpool.leaveFor', { name: rider.name })
                : t('eventFlow.carpool.leave')
              : riders.length > 1
                ? t('eventFlow.carpool.takeFor', { name: rider.name })
                : t('eventFlow.carpool.take')
            return (
              <Button
                key={rider.userId}
                label={label}
                variant={seated ? 'bordered' : 'tinted'}
                size="md"
                loading={busyKey === key}
                disabled={Boolean(busyKey) || (!seated && free === 0)}
                onPress={() => onSeat(ride, rider, seated)}
                testID={`carpool-${seated ? 'leave' : 'take'}-${ride.id}-${rider.userId}`}
                style={styles.flex}
              />
            )
          })}
        </View>
      ) : null}

      {onDelete ? (
        <Pressable
          onPress={onDelete}
          accessibilityRole="button"
          accessibilityLabel={t('eventFlow.carpool.delete')}
          android_ripple={{ color: c.surfaceSunken }}
          style={({ pressed }) => [styles.deleteRow, pressed && { opacity: 0.6 }]}
        >
          <Text variant="subheadline" weight="medium" color="error">
            {t('eventFlow.carpool.delete')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

function OfferSheet({
  visible,
  onClose,
  defaultDepart,
  locale,
  onSubmit,
}: {
  visible: boolean
  onClose: () => void
  defaultDepart: Date
  locale: string
  onSubmit: (payload: {
    seats: number
    departFrom: string | null
    departAt: string
    note: string | null
  }) => Promise<void>
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  const [seats, setSeats] = useState(3)
  const [from, setFrom] = useState('')
  const [note, setNote] = useState('')
  const [depart, setDepart] = useState(defaultDepart)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (visible) {
      setSeats(3)
      setFrom('')
      setNote('')
      setDepart(defaultDepart)
    }
    // Reset only when the sheet opens.
  }, [visible])

  const shift = (minutes: number) => {
    Haptics.select()
    setDepart((current) => new Date(current.getTime() + minutes * 60000))
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} heightPct="auto">
      <View style={styles.sheet}>
        <Text variant="title3" weight="bold" color="primary">
          {t('eventFlow.carpool.offerTitle')}
        </Text>

        <View style={styles.field}>
          <Text variant="subheadline" color="secondary">
            {t('eventFlow.carpool.seatsLabel')}
          </Text>
          <View style={styles.seatRow} accessibilityRole="radiogroup">
            {SEAT_OPTIONS.map((value) => {
              const active = seats === value
              return (
                <Pressable
                  key={value}
                  onPress={() => setSeats(value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={t('eventFlow.carpool.seatsFree', { count: value })}
                  android_ripple={{ color: c.borderSubtle }}
                  style={[
                    styles.seatChip,
                    active
                      ? { backgroundColor: c.primary, borderColor: c.primary }
                      : { backgroundColor: c.surfaceSunken, borderColor: c.borderSubtle },
                  ]}
                >
                  <Text
                    variant="headline"
                    weight="semibold"
                    tabular
                    color={active ? c.textInverse : c.textPrimary}
                  >
                    {String(value)}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </View>

        <View style={styles.field}>
          <Text variant="subheadline" color="secondary">
            {t('eventFlow.carpool.departLabel')}
          </Text>
          <View style={[styles.stepper, { backgroundColor: c.surfaceSunken, borderColor: c.borderSubtle }]}>
            <Pressable
              onPress={() => shift(-5)}
              accessibilityRole="button"
              accessibilityLabel={t('eventFlow.carpool.earlier')}
              android_ripple={{ color: c.borderSubtle, borderless: true }}
              style={styles.stepButton}
            >
              <Icon name="minus" size={18} color="primary" />
            </Pressable>
            <Text variant="title3" color="primary" tabular style={styles.stepValue}>
              {formatClock(depart, locale)}
            </Text>
            <Pressable
              onPress={() => shift(5)}
              accessibilityRole="button"
              accessibilityLabel={t('eventFlow.carpool.later')}
              android_ripple={{ color: c.borderSubtle, borderless: true }}
              style={styles.stepButton}
            >
              <Icon name="plus" size={18} color="primary" />
            </Pressable>
          </View>
        </View>

        <TextInput
          value={from}
          onChangeText={setFrom}
          placeholder={t('eventFlow.carpool.fromPlaceholder')}
          placeholderTextColor={c.textTertiary}
          maxLength={120}
          accessibilityLabel={t('eventFlow.carpool.fromLabel')}
          style={[styles.input, { color: c.textPrimary, backgroundColor: c.surfaceSunken, borderColor: c.borderSubtle }]}
        />
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder={t('eventFlow.carpool.notePlaceholder')}
          placeholderTextColor={c.textTertiary}
          maxLength={200}
          accessibilityLabel={t('eventFlow.carpool.noteLabel')}
          style={[styles.input, { color: c.textPrimary, backgroundColor: c.surfaceSunken, borderColor: c.borderSubtle }]}
        />

        <Button
          label={t('eventFlow.carpool.offerConfirm')}
          variant="filled"
          size="lg"
          fullWidth
          loading={saving}
          disabled={saving}
          testID="carpool-offer-submit"
          onPress={async () => {
            setSaving(true)
            try {
              await onSubmit({
                seats,
                departFrom: from.trim() || null,
                departAt: depart.toISOString(),
                note: note.trim() || null,
              })
            } finally {
              setSaving(false)
            }
          }}
        />
      </View>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  root: { gap: space.md },
  flex: { flex: 1, minWidth: 0 },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: space.md,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
  },
  summaryStat: { flex: 1, gap: SPACING_XXS },
  divider: { width: hairline, alignSelf: 'stretch', marginHorizontal: space.md },
  ride: {
    padding: space.md,
    gap: space.sm + space.xs,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
  },
  rideHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm + space.xs },
  seatBadge: { alignItems: 'flex-end' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  deleteRow: { minHeight: 44, justifyContent: 'center' },
  sheet: { paddingBottom: space.lg, gap: space.md },
  field: { gap: space.sm },
  seatRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  seatChip: {
    flexGrow: 1,
    flexBasis: 44,
    minHeight: 48,
    borderRadius: RADIUS_INPUT,
    borderCurve: 'continuous',
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS_INPUT,
    borderCurve: 'continuous',
    borderWidth: hairline,
  },
  stepButton: { width: 56, height: 52, alignItems: 'center', justifyContent: 'center' },
  stepValue: { flex: 1, textAlign: 'center', fontFamily: fonts.data },
  input: {
    minHeight: 50,
    borderRadius: RADIUS_INPUT,
    borderCurve: 'continuous',
    borderWidth: hairline,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: 16,
    fontFamily: fonts.body,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
})
