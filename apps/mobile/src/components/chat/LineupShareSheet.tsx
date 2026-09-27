import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { DmLineupInput, DmLineupOption } from '@anstoss/shared'
import { useClubColors } from '../../context/ClubThemeContext'
import { useSafeAreaInsetsSafe } from '../../utils/useSafeAreaInsetsSafe'
import {
  FONT_FAMILY_REGULAR,
  FONT_SIZE_BODY,
  hairline,
  radius,
  RADIUS_MD,
  space,
} from '../../theme/tokens'
import * as Haptics from '../../utils/haptics'
import { fetchDmLineupOptions } from '../../hooks/dmMedia'
import { BottomSheet, Button, Icon, ListRow, Text } from '../ui'
import { FORMATIONS, FORMATION_KEYS } from './lineupFormations'
import { positionLabel } from './LineupCardMessage'

type Props = {
  visible: boolean
  clubId: string
  conversationId: string
  locale: string
  onClose: () => void
  /** Resolves to an error key when the send failed (sheet stays open). */
  onShare: (lineup: DmLineupInput) => Promise<'ok' | 'forbidden' | 'failed'>
}

type Step = 'pick' | 'formation'

/**
 * "Aufstellung teilen" in a DM. A coach picks one of their events with a
 * saved Aufstellung (the server snapshots it); anyone can draw a formation
 * card instead: formation + a name per position.
 */
export function LineupShareSheet({ visible, clubId, conversationId, locale, onClose, onShare }: Props) {
  const { t } = useTranslation()
  const c = useClubColors()
  const insets = useSafeAreaInsetsSafe()
  const [step, setStep] = useState<Step>('pick')
  const [options, setOptions] = useState<DmLineupOption[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formation, setFormation] = useState('4-4-2')
  const [names, setNames] = useState<string[]>([])
  const [title, setTitle] = useState('')

  const load = useCallback(() => {
    setLoadError(false)
    setOptions(null)
    fetchDmLineupOptions(clubId, conversationId)
      .then((list) => {
        setOptions(list)
        // Players (and coaches without a saved lineup) go straight to drawing.
        if (list.length === 0) setStep('formation')
      })
      .catch(() => {
        setOptions([])
        setLoadError(true)
      })
  }, [clubId, conversationId])

  useEffect(() => {
    if (!visible) return
    setStep('pick')
    setError(null)
    setSending(false)
    setTitle('')
    setNames([])
    load()
  }, [load, visible])

  const positions = FORMATIONS[formation] ?? FORMATIONS['4-4-2']

  const share = async (input: DmLineupInput) => {
    if (sending) return
    setSending(true)
    setError(null)
    const result = await onShare(input)
    setSending(false)
    if (result === 'ok') {
      Haptics.tap()
      onClose()
    } else {
      setError(result === 'forbidden' ? t('chatThread.errors.dmForbidden') : t('chatThread.lineup.shareFailed'))
    }
  }

  const formatWhen = useMemo(
    () => (iso: string) =>
      new Intl.DateTimeFormat(locale, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit', hourCycle: 'h23',
        minute: '2-digit',
      }).format(new Date(iso)),
    [locale],
  )

  const filledCount = names.filter((n) => n?.trim()).length

  return (
    <BottomSheet visible={visible} onClose={sending ? () => undefined : onClose} heightPct={82} paddingBottom={insets.bottom + space.md}>
      <View style={styles.header}>
        {step === 'formation' && options && options.length > 0 ? (
          <Pressable
            onPress={() => setStep('pick')}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            hitSlop={8}
            style={styles.headerBtn}
          >
            <Icon name="chevron.left" size={20} color={c.textSecondary} />
          </Pressable>
        ) : null}
        <Text variant="title3" weight="bold" color="primary" style={styles.flex}>
          {step === 'pick' ? t('chatThread.lineup.shareTitle') : t('chatThread.lineup.drawTitle')}
        </Text>
        <Pressable
          onPress={onClose}
          disabled={sending}
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel')}
          hitSlop={8}
          style={styles.headerBtn}
        >
          <Text variant="callout" color="secondary">
            {t('common.cancel')}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        {error ? (
          <Text variant="footnote" style={{ color: c.error }} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}

        {step === 'pick' ? (
          <>
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
              {options === null ? (
                <View style={styles.pad}>
                  <Text variant="footnote" color="secondary">
                    {t('common.loading')}
                  </Text>
                </View>
              ) : loadError ? (
                <Pressable
                  onPress={load}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.retry')}
                  style={styles.pad}
                >
                  <Text variant="footnote" color="error">
                    {t('chatThread.lineup.loadFailed')}
                  </Text>
                  <Text variant="footnote" weight="semibold" color="tint">
                    {t('common.retry')}
                  </Text>
                </Pressable>
              ) : (
                options.map((option, index) => (
                  <ListRow
                    key={option.eventId}
                    title={option.opponent ? t('chatThread.lineup.versus', { opponent: option.opponent }) : option.title}
                    subtitle={[
                      formatWhen(option.date),
                      option.teamName,
                      t('chatThread.lineup.optionMeta', { formation: option.formation, count: option.starterCount }),
                    ].join(' · ')}
                    showChevron
                    disabled={sending}
                    onPress={() => void share({ source: 'EVENT', eventId: option.eventId })}
                    style={index > 0 ? { borderTopWidth: hairline, borderTopColor: c.borderSubtle } : undefined}
                  />
                ))
              )}
            </View>
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
              <ListRow
                title={t('chatThread.lineup.drawTitle')}
                subtitle={t('chatThread.lineup.drawHint')}
                left={
                  <View style={[styles.iconWell, { backgroundColor: c.surfaceSunken }]}>
                    <Icon name="figure.soccer" size={18} color={c.textSecondary} />
                  </View>
                }
                showChevron
                onPress={() => setStep('formation')}
              />
            </View>
          </>
        ) : (
          <>
            <Text variant="footnote" weight="semibold" color="secondary">
              {t('chatThread.lineup.formation')}
            </Text>
            <View style={styles.chips} accessibilityRole="radiogroup">
              {FORMATION_KEYS.map((key) => {
                const selected = key === formation
                return (
                  <Pressable
                    key={key}
                    onPress={() => {
                      Haptics.select()
                      setFormation(key)
                      setNames([])
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={key}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: selected ? c.primary : c.surfaceSunken,
                        borderColor: selected ? c.primary : c.borderSubtle,
                      },
                    ]}
                  >
                    <Text variant="subheadline" weight="semibold" tabular color={selected ? c.onPrimary : c.textPrimary}>
                      {key}
                    </Text>
                  </Pressable>
                )
              })}
            </View>

            <Text variant="footnote" weight="semibold" color="secondary">
              {t('chatThread.lineup.cardTitle')}
            </Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={t('chatThread.lineup.cardTitlePlaceholder')}
              placeholderTextColor={c.textTertiary}
              maxLength={60}
              accessibilityLabel={t('chatThread.lineup.cardTitle')}
              style={[styles.input, { color: c.textPrimary, backgroundColor: c.surface, borderColor: c.borderDefault }]}
            />

            <Text variant="footnote" weight="semibold" color="secondary">
              {t('chatThread.lineup.players')}
            </Text>
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
              {positions.map((position, index) => (
                <View
                  key={`${formation}-${index}`}
                  style={[styles.slotRow, index > 0 && { borderTopWidth: hairline, borderTopColor: c.borderSubtle }]}
                >
                  <Text variant="subheadline" weight="semibold" color="secondary" style={styles.slotPos}>
                    {positionLabel(position, t)}
                  </Text>
                  <TextInput
                    value={names[index] ?? ''}
                    onChangeText={(text) =>
                      setNames((prev) => {
                        const next = [...prev]
                        next[index] = text
                        return next
                      })
                    }
                    placeholder={t('chatThread.lineup.playerPlaceholder')}
                    placeholderTextColor={c.textTertiary}
                    maxLength={60}
                    accessibilityLabel={t('chatThread.lineup.playerA11y', { position: positionLabel(position, t) })}
                    style={[styles.slotInput, { color: c.textPrimary }]}
                  />
                </View>
              ))}
            </View>
            <Button
              label={t('chatThread.lineup.shareCta')}
              variant="filled"
              size="lg"
              fullWidth
              loading={sending}
              disabled={filledCount === 0}
              onPress={() =>
                void share({
                  source: 'FORMATION',
                  formation,
                  ...(title.trim() ? { title: title.trim() } : {}),
                  slots: positions.map((position, index) => ({
                    position,
                    playerName: (names[index] ?? '').trim(),
                  })),
                })
              }
              testID="chat-lineup-share"
            />
          </>
        )}
      </ScrollView>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingBottom: space.md,
  },
  headerBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  body: { gap: space.md, paddingBottom: space.lg },
  card: {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    overflow: 'hidden',
  },
  pad: { padding: space.md, gap: space.xs, minHeight: 44 },
  iconWell: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    minHeight: 44,
    minWidth: 64,
    paddingHorizontal: space.md,
    borderRadius: radius.full,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    minHeight: 44,
    borderRadius: RADIUS_MD,
    borderCurve: 'continuous',
    borderWidth: hairline,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontFamily: FONT_FAMILY_REGULAR,
    fontSize: FONT_SIZE_BODY,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    minHeight: 48,
  },
  slotPos: { minWidth: 72, flexShrink: 0 },
  slotInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    fontFamily: FONT_FAMILY_REGULAR,
    fontSize: FONT_SIZE_BODY,
    paddingVertical: space.sm,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
})
