/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { EmptyState } from '../src/components/EmptyState'
import { Button, Icon, Text } from '../src/components/ui'
import { fonts, hairline, radius, space } from '../src/theme/tokens'

type Rider = { userId: string; name: string }

type CarpoolRide = {
  id: string
  driverId: string | null
  driverName: string | null
  postcode: string
  /** total seats offered (excluding driver). For requests this is 0. */
  seatsOffered: number
  parking?: string | null
  notes?: string | null
  riders: Rider[]
}

type CarpoolBoard = {
  fixture: {
    id: string
    title: string
    venueName: string | null
    pitchAddress: string | null
    kickoffAt: string
  } | null
  rides: CarpoolRide[]
}

type Mode = 'offer' | 'request'

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

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

function formatKickoff(iso: string, locale: string): string {
  const d = new Date(iso)
  const dow = d.toLocaleDateString(locale, { weekday: 'short' })
  const day = d.toLocaleDateString(locale, { day: 'numeric', month: 'short' })
  const time = d.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${dow.toUpperCase()} ${day}  ·  ${time}`
}

export default function CarpoolScreen() {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const c = useClubColors()
  const params = useLocalSearchParams<{ fixtureId?: string | string[] }>()
  const fixtureId =
    typeof params.fixtureId === 'string' ? params.fixtureId : null
  const locale = i18n.language

  const [data, setData] = useState<CarpoolBoard | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busyRide, setBusyRide] = useState<string | null>(null)
  const [composeOpen, setComposeOpen] = useState<Mode | null>(null)
  const [composePostcode, setComposePostcode] = useState('')
  const [composeSeats, setComposeSeats] = useState('3')
  const [composeParking, setComposeParking] = useState('')
  const [composeNotes, setComposeNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fetchData = useCallback(async () => {
    if (!fixtureId) {
      setLoading(false)
      return
    }
    try {
      const result = await api<CarpoolBoard>(`/fixtures/${fixtureId}/carpool`)
      setData(result ?? null)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [fixtureId])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const offers = useMemo(
    () => (data?.rides ?? []).filter((r) => r.driverId !== null),
    [data],
  )
  const requests = useMemo(
    () => (data?.rides ?? []).filter((r) => r.driverId === null),
    [data],
  )

  const handleRefresh = () => {
    setRefreshing(true)
    void fetchData()
  }

  const claimSeat = async (ride: CarpoolRide) => {
    if (!user || !fixtureId) return
    const alreadyOn = ride.riders.some((r) => r.userId === user.id)
    setBusyRide(ride.id)
    try {
      if (alreadyOn) {
        await api(`/fixtures/${fixtureId}/carpool/${ride.id}/claim`, {
          method: 'DELETE',
        })
      } else {
        await api(`/fixtures/${fixtureId}/carpool/${ride.id}/claim`, {
          method: 'POST',
        })
      }
      await fetchData()
    } catch {
      Alert.alert(
        t('common.error'),
        t('carpool.claimError', {
          defaultValue: "Couldn't update the seat. Try again.",
        }),
      )
    } finally {
      setBusyRide(null)
    }
  }

  const cancelOffer = (ride: CarpoolRide) => {
    if (!fixtureId) return
    Alert.alert(
      t('carpool.cancelTitle', { defaultValue: 'Cancel ride?' }),
      t('carpool.cancelBody', {
        defaultValue:
          'Riders will get a push that the offer was withdrawn. They can grab another seat.',
      }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('carpool.cancel', { defaultValue: 'Cancel ride' }),
          style: 'destructive',
          onPress: async () => {
            setBusyRide(ride.id)
            try {
              await api(`/fixtures/${fixtureId}/carpool/${ride.id}`, {
                method: 'DELETE',
              })
              await fetchData()
            } catch {
              Alert.alert(t('common.error'))
            } finally {
              setBusyRide(null)
            }
          },
        },
      ],
    )
  }

  const submitCompose = async () => {
    if (!fixtureId || !composeOpen) return
    if (!composePostcode.trim()) {
      Alert.alert(
        t('common.errorTitle'),
        t('carpool.postcodeRequired', {
          defaultValue: 'Add a postcode so riders can match by area.',
        }),
      )
      return
    }
    setSubmitting(true)
    try {
      if (composeOpen === 'offer') {
        const seats = Math.max(1, Math.min(8, Number(composeSeats) || 3))
        await api(`/fixtures/${fixtureId}/carpool/offer`, {
          method: 'POST',
          body: {
            postcode: composePostcode.trim(),
            seatsOffered: seats,
            parking: composeParking.trim() || null,
            notes: composeNotes.trim() || null,
          },
        })
      } else {
        await api(`/fixtures/${fixtureId}/carpool/request`, {
          method: 'POST',
          body: {
            postcode: composePostcode.trim(),
            notes: composeNotes.trim() || null,
          },
        })
      }
      setComposeOpen(null)
      setComposePostcode('')
      setComposeSeats('3')
      setComposeParking('')
      setComposeNotes('')
      await fetchData()
    } catch {
      Alert.alert(
        t('common.error'),
        t('carpool.submitError', {
          defaultValue: 'Could not post. Try again.',
        }),
      )
    } finally {
      setSubmitting(false)
    }
  }

  const totalSeated = offers.reduce((sum, r) => sum + r.riders.length, 0)
  const totalSeats = offers.reduce((sum, r) => sum + r.seatsOffered, 0)
  const ridersLooking = requests.length

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <ModalHeader
        title={t('carpool.title', { defaultValue: 'Carpool board' })}
        mode="back"
        onClose={() => router.back()}
      />

      {loading ? (
        <View style={styles.loadingWrap}>
          <Text variant="footnote" color="secondary">
            {t('common.loading')}
          </Text>
        </View>
      ) : !data?.fixture ? (
        <EmptyState
          icon="car"
          title={t('carpool.noFixtureTitle', {
            defaultValue: 'No match selected',
          })}
          description={t('carpool.noFixtureBody', {
            defaultValue:
              'Open carpool from a match detail screen so we can cluster by venue + postcode.',
          })}
        />
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={c.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {/* Hero */}
          <Text style={[styles.eyebrow, { color: c.textTertiary }]}>
            {t('carpool.eyebrow', { defaultValue: 'CARPOOL' })}
          </Text>
          <Text variant="title1" color="primary" weight="semibold" style={styles.title}>
            {data.fixture.title}
          </Text>
          <Text variant="footnote" color="secondary" style={styles.subtitle}>
            {formatKickoff(data.fixture.kickoffAt, locale)}
            {data.fixture.venueName ? `  ·  ${data.fixture.venueName}` : ''}
          </Text>
          {data.fixture.pitchAddress ? (
            <View style={styles.metaRow}>
              <Icon name="mappin.circle" size={12} color="tertiary" />
              <Text variant="caption2" color="secondary" numberOfLines={1}>
                {data.fixture.pitchAddress}
              </Text>
            </View>
          ) : null}

          {/* Summary card */}
          <View
            style={[
              styles.summaryCard,
              { backgroundColor: c.surface, borderColor: c.borderDefault },
            ]}
          >
            <View style={styles.summaryRow}>
              <View style={styles.summaryStat}>
                <Text variant="title2" color="primary" weight="semibold" tabular>
                  {totalSeated}
                  <Text variant="title3" color="secondary">
                    /{Math.max(1, totalSeats)}
                  </Text>
                </Text>
                <Text variant="caption2" color="secondary">
                  {t('carpool.seatsTaken', { defaultValue: 'Seats taken' })}
                </Text>
              </View>
              <View style={[styles.summaryDivider, { backgroundColor: c.borderDefault }]} />
              <View style={styles.summaryStat}>
                <Text variant="title2" color="primary" weight="semibold" tabular>
                  {offers.length}
                </Text>
                <Text variant="caption2" color="secondary">
                  {t('carpool.driversCount', { defaultValue: 'Drivers' })}
                </Text>
              </View>
              <View style={[styles.summaryDivider, { backgroundColor: c.borderDefault }]} />
              <View style={styles.summaryStat}>
                <Text variant="title2" color="primary" weight="semibold" tabular>
                  {ridersLooking}
                </Text>
                <Text variant="caption2" color="secondary">
                  {t('carpool.lookingCount', { defaultValue: 'Looking' })}
                </Text>
              </View>
            </View>

            <View style={styles.summaryActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setComposeOpen('offer')}
                style={({ pressed }) => [
                  styles.summaryAction,
                  { backgroundColor: c.textPrimary },
                  pressed && { opacity: 0.9 },
                ]}
              >
                <Icon name="car" size={12} color="inverse" />
                <Text style={[styles.summaryActionText, { color: c.textInverse }]}>
                  {t('carpool.offerRide', { defaultValue: 'Offer ride' })}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => setComposeOpen('request')}
                style={({ pressed }) => [
                  styles.summaryActionGhost,
                  { borderColor: c.borderStrong },
                  pressed && { opacity: 0.5 },
                ]}
              >
                <Icon name="hand.raised" size={12} color={c.textPrimary} />
                <Text style={[styles.summaryActionText, { color: c.textPrimary }]}>
                  {t('carpool.requestRide', { defaultValue: 'Need a ride' })}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Offered rides */}
          <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>
            {t('carpool.offersLabel', { defaultValue: 'OFFERED RIDES' })}
            {'  '}
            <Text style={[styles.countTag, { color: c.textTertiary }]}>
              {String(offers.length)}
            </Text>
          </Text>

          {offers.length === 0 ? (
            <View
              style={[
                styles.emptyCard,
                { backgroundColor: c.surface, borderColor: c.borderDefault },
              ]}
            >
              <Text variant="footnote" color="secondary">
                {t('carpool.offersEmpty', {
                  defaultValue: 'No offers yet — be the first.',
                })}
              </Text>
            </View>
          ) : (
            offers.map((ride) => {
              const filled = ride.riders.length
              const total = Math.max(1, ride.seatsOffered)
              const isDriver = ride.driverId === user?.id
              const claimed = ride.riders.some((r) => r.userId === user?.id)
              const full = filled >= total && !claimed
              const tone = full ? c.warning : c.success
              return (
                <View
                  key={ride.id}
                  style={[
                    styles.rideCard,
                    { backgroundColor: c.surface, borderColor: c.borderDefault },
                  ]}
                >
                  <View style={styles.rideHead}>
                    <View
                      style={[
                        styles.driverAvatar,
                        { backgroundColor: c.primary, borderColor: c.primary },
                      ]}
                    >
                      <Text style={[styles.driverInitials, { color: c.textInverse }]}>
                        {initialsOf(ride.driverName ?? '?')}
                      </Text>
                    </View>
                    <View style={styles.rideHeadCopy}>
                      <Text variant="footnote" color="primary" weight="semibold" numberOfLines={1}>
                        {ride.driverName}
                        {isDriver ? (
                          <Text variant="caption2" color="tertiary">
                            {'  '}·{'  '}
                            {t('carpool.youTag', { defaultValue: 'you' })}
                          </Text>
                        ) : null}
                      </Text>
                      <View style={styles.metaRow}>
                        <Icon name="mappin" size={11} color="tertiary" />
                        <Text variant="caption2" color="secondary" tabular>
                          {ride.postcode}
                        </Text>
                        {ride.parking ? (
                          <>
                            <Text style={[styles.metaDot, { color: c.textTertiary }]}>·</Text>
                            <Text variant="caption2" color="secondary" numberOfLines={1}>
                              {ride.parking}
                            </Text>
                          </>
                        ) : null}
                      </View>
                    </View>
                    <View
                      style={[
                        styles.seatsPill,
                        { backgroundColor: withAlpha(tone, 0.12) },
                      ]}
                    >
                      <Text style={[styles.seatsText, { color: tone }]}>
                        {filled}/{ride.seatsOffered}
                      </Text>
                    </View>
                  </View>

                  {/* Seat progress bar */}
                  <View style={[styles.seatBar, { backgroundColor: c.borderDefault }]}>
                    <View
                      style={[
                        styles.seatBarFill,
                        {
                          width: `${Math.min(100, (filled / total) * 100)}%`,
                          backgroundColor: tone,
                        },
                      ]}
                    />
                  </View>

                  {/* Riders avatars */}
                  {ride.riders.length > 0 ? (
                    <View style={styles.ridersRow}>
                      {ride.riders.map((r) => (
                        <View
                          key={r.userId}
                          style={[
                            styles.riderChip,
                            {
                              backgroundColor: c.surfaceSunken ?? c.background,
                              borderColor: c.borderDefault,
                            },
                          ]}
                        >
                          <View
                            style={[
                              styles.riderDot,
                              { backgroundColor: c.success },
                            ]}
                          />
                          <Text style={[styles.riderText, { color: c.textPrimary }]} numberOfLines={1}>
                            {r.name}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  {ride.notes ? (
                    <Text variant="caption2" color="secondary" style={styles.notesLine} numberOfLines={2}>
                      "{ride.notes}"
                    </Text>
                  ) : null}

                  <View style={styles.rideActions}>
                    {isDriver ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t('carpool.cancel', {
                          defaultValue: 'Cancel ride',
                        })}
                        onPress={() => cancelOffer(ride)}
                        disabled={busyRide === ride.id}
                        style={({ pressed }) => [
                          styles.actionGhost,
                          { borderColor: withAlpha(c.error, 0.4) },
                          pressed && { opacity: 0.5 },
                          busyRide === ride.id && { opacity: 0.5 },
                        ]}
                      >
                        <Text style={[styles.actionGhostText, { color: c.error }]}>
                          {t('carpool.cancel', { defaultValue: 'Cancel ride' })}
                        </Text>
                      </Pressable>
                    ) : claimed ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => claimSeat(ride)}
                        disabled={busyRide === ride.id}
                        style={({ pressed }) => [
                          styles.actionGhost,
                          { borderColor: c.borderStrong },
                          pressed && { opacity: 0.5 },
                          busyRide === ride.id && { opacity: 0.5 },
                        ]}
                      >
                        <Icon name="checkmark" size={11} color={c.success} />
                        <Text style={[styles.actionGhostText, { color: c.textPrimary }]}>
                          {t('carpool.releaseSeat', {
                            defaultValue: "You're in — release seat",
                          })}
                        </Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => claimSeat(ride)}
                        disabled={full || busyRide === ride.id}
                        style={({ pressed }) => [
                          styles.actionFilled,
                          { backgroundColor: full ? c.borderStrong : c.textPrimary },
                          pressed && { opacity: 0.9 },
                          (full || busyRide === ride.id) && { opacity: 0.5 },
                        ]}
                      >
                        <Icon
                          name="plus"
                          size={11}
                          color="inverse"
                        />
                        <Text style={[styles.actionFilledText, { color: c.textInverse }]}>
                          {full
                            ? t('carpool.full', { defaultValue: 'Full' })
                            : t('carpool.claimSeat', {
                                defaultValue: 'Claim a seat',
                              })}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              )
            })
          )}

          {/* Riders looking */}
          {requests.length > 0 ? (
            <>
              <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>
                {t('carpool.requestsLabel', { defaultValue: 'NEED A RIDE' })}
                {'  '}
                <Text style={[styles.countTag, { color: c.textTertiary }]}>
                  {String(requests.length)}
                </Text>
              </Text>
              <View
                style={[
                  styles.list,
                  { backgroundColor: c.surface, borderColor: c.borderDefault },
                ]}
              >
                {requests.map((req, idx) => (
                  <View
                    key={req.id}
                    style={[
                      styles.requestRow,
                      idx > 0 && {
                        borderTopWidth: hairline,
                        borderTopColor: c.borderDefault,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.driverAvatar,
                        {
                          backgroundColor: withAlpha(c.warning, 0.12),
                          borderColor: withAlpha(c.warning, 0.4),
                        },
                      ]}
                    >
                      <Icon name="hand.raised" size={14} color={c.warning} />
                    </View>
                    <View style={styles.rideHeadCopy}>
                      <Text variant="footnote" color="primary" weight="semibold" numberOfLines={1}>
                        {req.riders[0]?.name ??
                          t('carpool.unknownRider', { defaultValue: 'Rider' })}
                      </Text>
                      <View style={styles.metaRow}>
                        <Icon name="mappin" size={11} color="tertiary" />
                        <Text variant="caption2" color="secondary" tabular>
                          {req.postcode}
                        </Text>
                        {req.notes ? (
                          <>
                            <Text style={[styles.metaDot, { color: c.textTertiary }]}>·</Text>
                            <Text variant="caption2" color="secondary" numberOfLines={1}>
                              {req.notes}
                            </Text>
                          </>
                        ) : null}
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          <Text style={[styles.footnote, { color: c.textTertiary }]}>
            {t('carpool.footer', {
              defaultValue:
                'Riders are clustered by postcode. The driver gets a push when someone claims a seat.',
            })}
          </Text>
        </ScrollView>
      )}

      {/* Compose sheet */}
      <Modal
        visible={composeOpen !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setComposeOpen(null)}
      >
        <KeyboardAvoidingView
          style={[styles.sheetOverlay, { backgroundColor: c.surfaceOverlay }]}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View
            style={[
              styles.sheet,
              { backgroundColor: c.background, paddingBottom: space['2xl'] },
            ]}
          >
            <View style={[styles.grabber, { backgroundColor: c.borderDefault }]} />
            <ScrollView
              contentContainerStyle={styles.sheetContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={[styles.eyebrow, { color: c.textTertiary }]}>
                {composeOpen === 'offer'
                  ? t('carpool.offerEyebrow', { defaultValue: 'OFFER A RIDE' })
                  : t('carpool.requestEyebrow', { defaultValue: 'NEED A RIDE' })}
              </Text>
              <Text variant="title2" color="primary" weight="semibold" style={styles.title}>
                {composeOpen === 'offer'
                  ? t('carpool.offerTitle', { defaultValue: "I'll drive" })
                  : t('carpool.requestTitle', {
                      defaultValue: 'Looking for a seat',
                    })}
              </Text>
              <Text variant="footnote" color="secondary" style={styles.subtitle}>
                {composeOpen === 'offer'
                  ? t('carpool.offerBody', {
                      defaultValue:
                        'Add your postcode + free seats so we can match teammates from your area.',
                    })
                  : t('carpool.requestBody', {
                      defaultValue:
                        'Drivers near your postcode will see you first.',
                    })}
              </Text>

              <Text style={[styles.fieldLabel, { color: c.textTertiary }]}>
                {t('carpool.postcodeLabel', { defaultValue: 'POSTCODE' })}
              </Text>
              <View
                style={[
                  styles.fieldCard,
                  { backgroundColor: c.surface, borderColor: c.borderDefault },
                ]}
              >
                <TextInput
                  style={[styles.fieldInput, { color: c.textPrimary }]}
                  value={composePostcode}
                  onChangeText={setComposePostcode}
                  placeholder="14169"
                  placeholderTextColor={c.textTertiary}
                  keyboardType="number-pad"
                  maxLength={5}
                />
              </View>

              {composeOpen === 'offer' ? (
                <>
                  <Text style={[styles.fieldLabel, { color: c.textTertiary }]}>
                    {t('carpool.seatsLabel', { defaultValue: 'FREE SEATS' })}
                  </Text>
                  <View style={styles.seatsRow}>
                    {['1', '2', '3', '4', '5'].map((opt) => {
                      const active = composeSeats === opt
                      return (
                        <Pressable
                          key={opt}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          onPress={() => setComposeSeats(opt)}
                          style={[
                            styles.seatsPick,
                            active
                              ? {
                                  backgroundColor: c.textPrimary,
                                  borderColor: c.textPrimary,
                                }
                              : { borderColor: c.borderStrong, backgroundColor: c.surface },
                          ]}
                        >
                          <Text
                            style={[
                              styles.seatsPickText,
                              { color: active ? c.textInverse : c.textPrimary },
                            ]}
                          >
                            {opt}
                          </Text>
                        </Pressable>
                      )
                    })}
                  </View>

                  <Text style={[styles.fieldLabel, { color: c.textTertiary }]}>
                    {t('carpool.parkingLabel', {
                      defaultValue: 'PARKING / MEET POINT',
                    })}
                  </Text>
                  <View
                    style={[
                      styles.fieldCard,
                      { backgroundColor: c.surface, borderColor: c.borderDefault },
                    ]}
                  >
                    <TextInput
                      style={[styles.fieldInput, { color: c.textPrimary }]}
                      value={composeParking}
                      onChangeText={setComposeParking}
                      placeholder={t('carpool.parkingPlaceholder', {
                        defaultValue: 'e.g. Lot F · 13:30 at clubhouse',
                      })}
                      placeholderTextColor={c.textTertiary}
                    />
                  </View>
                </>
              ) : null}

              <Text style={[styles.fieldLabel, { color: c.textTertiary }]}>
                {t('carpool.notesLabel', { defaultValue: 'NOTE (OPTIONAL)' })}
              </Text>
              <View
                style={[
                  styles.fieldCard,
                  { backgroundColor: c.surface, borderColor: c.borderDefault },
                ]}
              >
                <TextInput
                  style={[styles.fieldInput, styles.fieldTextarea, { color: c.textPrimary }]}
                  value={composeNotes}
                  onChangeText={setComposeNotes}
                  placeholder={
                    composeOpen === 'offer'
                      ? t('carpool.notesOfferPlaceholder', {
                          defaultValue: 'Will pass through Steglitz at 13:00…',
                        })
                      : t('carpool.notesRequestPlaceholder', {
                          defaultValue: "Coming back same evening — flexible.",
                        })
                  }
                  placeholderTextColor={c.textTertiary}
                  multiline
                  numberOfLines={2}
                />
              </View>

              <View style={styles.footerActions}>
                <Button
                  label={
                    composeOpen === 'offer'
                      ? t('carpool.offerSubmit', { defaultValue: 'Post offer' })
                      : t('carpool.requestSubmit', { defaultValue: 'Post request' })
                  }
                  variant="filled"
                  size="lg"
                  fullWidth
                  loading={submitting}
                  disabled={submitting}
                  onPress={submitCompose}
                />
                <Button
                  label={t('common.cancel')}
                  variant="ghost"
                  size="lg"
                  fullWidth
                  onPress={() => setComposeOpen(null)}
                />
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space['2xl'] * 2,
    gap: space.sm,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
  },

  eyebrow: {
    fontSize: 11,
    fontFamily: fonts.label,
    letterSpacing: 1.4,
    fontWeight: '700',
  },
  title: { letterSpacing: -0.3, marginTop: 2 },
  subtitle: { marginTop: 4, lineHeight: 18 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  metaDot: { fontSize: 11, fontFamily: fonts.label },

  summaryCard: {
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
    gap: 12,
    marginTop: space.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  summaryStat: { flex: 1, gap: 2 },
  summaryDivider: { width: hairline, height: 36 },
  summaryActions: { flexDirection: 'row', gap: 8 },
  summaryAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 999,
  },
  summaryActionGhost: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1.25,
  },
  summaryActionText: {
    fontSize: 12,
    fontFamily: fonts.label,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },

  sectionLabel: {
    fontSize: 11,
    fontFamily: fonts.label,
    letterSpacing: 1.4,
    fontWeight: '700',
    marginTop: space.sm,
    marginLeft: 4,
    marginBottom: -space.xs,
  },
  countTag: {
    fontSize: 11,
    fontFamily: fonts.label,
    letterSpacing: 0.2,
  },

  emptyCard: {
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: hairline,
    alignItems: 'center',
  },

  rideCard: {
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: hairline,
    gap: 10,
  },
  rideHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  driverAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverInitials: {
    fontSize: 13,
    fontFamily: fonts.label,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  rideHeadCopy: { flex: 1, gap: 2 },
  seatsPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  seatsText: {
    fontSize: 11,
    fontFamily: fonts.label,
    fontWeight: '700',
    letterSpacing: 0.4,
  },

  seatBar: { height: 4, borderRadius: 2, overflow: 'hidden' },
  seatBarFill: { height: '100%', borderRadius: 2 },

  ridersRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  riderChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: hairline,
  },
  riderDot: { width: 6, height: 6, borderRadius: 3 },
  riderText: {
    fontSize: 12,
    fontFamily: fonts.label,
    fontWeight: '600',
    letterSpacing: 0.2,
    maxWidth: 110,
  },

  notesLine: { fontStyle: 'italic', lineHeight: 16 },

  rideActions: { flexDirection: 'row', gap: 8 },
  actionFilled: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 999,
  },
  actionFilledText: {
    fontSize: 13,
    fontFamily: fonts.label,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  actionGhost: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1.25,
  },
  actionGhostText: {
    fontSize: 13,
    fontFamily: fonts.label,
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  list: {
    borderRadius: radius.md,
    borderWidth: hairline,
    overflow: 'hidden',
  },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: space.md,
    paddingVertical: 10,
  },

  footnote: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: space.sm,
  },

  // Compose sheet
  sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '88%',
  },
  sheetContent: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginTop: 8,
    marginBottom: 4,
  },
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
    marginTop: 6,
  },
  fieldInput: {
    paddingHorizontal: space.md,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: fonts.body,
    minHeight: 46,
  },
  fieldTextarea: {
    minHeight: 72,
    paddingTop: 12,
    textAlignVertical: 'top',
  },

  seatsRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  seatsPick: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1.25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seatsPickText: {
    fontSize: 14,
    fontFamily: fonts.label,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  footerActions: {
    marginTop: space.md,
    gap: 6,
  },
})
