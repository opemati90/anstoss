import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import * as Clipboard from 'expo-clipboard'
import * as Sharing from 'expo-sharing'
import { captureRef } from 'react-native-view-shot'
import {
  STUDIO_CREDIT_COSTS,
  STUDIO_DEFAULT_FORMAT,
  STUDIO_FORMAT_RATIO,
  type StudioElements,
  type StudioFormat,
  type StudioShareChannel,
  type StudioStyle,
  type StudioTemplate,
} from '@anstoss/shared'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { useSafeAreaInsetsSafe } from '../../src/utils/useSafeAreaInsetsSafe'
import { goBackOrReplace } from '../../src/utils/navigation'
import { getAppLanguage } from '../../src/i18n'
import { Button, Icon, Text } from '../../src/components/ui'
import { MatchCrest } from '../../src/components/match/MatchCrest'
import { StudioGraphic } from '../../src/components/studio/StudioGraphic'
import { CreditsChip, CreditsIcon, SparkleIcon, StudioSwitch } from '../../src/components/studio/StudioBits'
import { StudioLocked } from '../../src/components/studio/StudioLocked'
import {
  useStudioAccess,
  useStudioActions,
  useStudioBrandKit,
  useStudioCredits,
  useStudioMatch,
} from '../../src/hooks/useStudio'
import { buildCaption, resolveTemplate } from '../../src/studio/buildGraphicData'
import { ALL_ELEMENTS, useGraphicBuilder } from '../../src/studio/useGraphicData'
import {
  EDITOR_TEMPLATES,
  SCORE_TEMPLATES,
  templateFromSlug,
  templateSlug,
  TEXT_TEMPLATES,
} from '../../src/studio/templates'
import {
  STUDIO_ACCENT,
  STUDIO_DASH,
  STUDIO_INK,
  STUDIO_ON_WORKSPACE,
  STUDIO_WORKSPACE,
  STUDIO_WORKSPACE_FILL,
  STUDIO_WORKSPACE_MUTED,
  STUDIO_WORKSPACE_SEG,
  STUDIO_WORKSPACE_SHADOW,
} from '../../src/theme/studio'
import {
  FONT_FAMILY_DISPLAY,
  hairline,
  RADIUS_CARD,
  RADIUS_FULL,
  RADIUS_HERO,
  SPACING_LG,
  SPACING_MD,
  SPACING_SM,
  SPACING_XS,
  SPACING_XXS,
} from '../../src/theme/tokens'

/** Board 39 (StudioEditor.dc.html) measures. */
const HEADER_TOP = 8
const HEADER_GAP = 10
const HEADER_HEIGHT = 44
const TITLE_SIZE = 16
const SEG_WIDTH = 216
const SEG_PAD = 3
const SEG_RADIUS = 14
const SEG_ITEM = 30
const SEG_ITEM_RADIUS = 11
const SEG_TOP = 10
const STAGE_PAD = 8
const EDIT_PANEL = 336
const PANEL_PAD_TOP = 10
const PANEL_PAD_BOTTOM = 28
const TOOLS_RADIUS = 18
const TOOL_HEIGHT = 40
const TOOL_RADIUS = 14
const PICK_WIDTH = 64
const PICK_HEIGHT = 80
const PICK_RADIUS = 10
const PICK_RING = 2
const PICK_RING_GAP = 3
const PICK_GAP = 6
const PICK_SPACING = 34
const STYLE_SPACING = 34
const NEXT_HEIGHT = 52
const STEPPER = 44
const STEPPER_GLYPH = 22
const SCORE_SIZE = 34
const COLON_SIZE = 30
const COLON_TOP = 70
const RESULT_CREST = 34
const RESULT_GAP = 10
const ELEMENT_ROW = 52
const ELEMENT_PAD = 14
const MAX_GOALS = 15
/** Preview sizes on the 844pt board: [width, height] per format. */
const EDIT_SIZE: Record<StudioFormat, [number, number]> = { '1:1': [292, 292], '4:5': [264, 330], '9:16': [186, 330] }
const SHARE_SIZE: Record<StudioFormat, [number, number]> = { '1:1': [176, 176], '4:5': [160, 200], '9:16': [118, 210] }
const SHARE_STAGE = 216
const SHARE_PAD_TOP = 18
const SHARE_GAP = 14
const CAPTION_RADIUS = 18
const CAPTION_SIZE = 14
const CHANNEL_ROW = 50
const EXPORT_WIDTH = 1080

type Tool = 'template' | 'style' | 'result' | 'elements'
type Step = 'edit' | 'share'
type Channel = 'feed' | 'story' | 'fb' | 'wa'

const FORMATS: Array<{ key: StudioFormat; label: string }> = [
  { key: '1:1', label: 'studio.format.square' },
  { key: '4:5', label: 'studio.format.portrait' },
  { key: '9:16', label: 'studio.format.story' },
]
const STYLES: StudioStyle[] = ['FLUTLICHT', 'DERBY', 'KREIDE']
const CHANNEL_MAP: Record<Channel, StudioShareChannel> = {
  feed: 'INSTAGRAM_FEED',
  story: 'INSTAGRAM_STORY',
  fb: 'FACEBOOK_PAGE',
  wa: 'WHATSAPP',
}

function styleFromParam(value: string | undefined): StudioStyle {
  const upper = (value ?? '').toUpperCase()
  return (STYLES as string[]).includes(upper) ? (upper as StudioStyle) : 'FLUTLICHT'
}

/**
 * Matchday Studio editor (board 39): a dark workspace with the graphic
 * centred under the format pills, and a chalk bottom panel with four tools
 * (Vorlage, Stil, Ergebnis, Elemente), one visible at a time. "Weiter" opens
 * the share step: caption, channel toggles, post.
 */
export default function StudioEditorScreen() {
  const { t } = useTranslation()
  const c = useClubColors()
  const insets = useSafeAreaInsetsSafe()
  const window = useWindowDimensions()
  const params = useLocalSearchParams<{ template?: string; style?: string; eventId?: string; format?: string }>()
  const access = useStudioAccess()
  const { kit } = useStudioBrandKit()
  const { balance } = useStudioCredits()
  const actions = useStudioActions()
  const { match, event, saveResult } = useStudioMatch(params.eventId ?? null)
  const { build } = useGraphicBuilder(match, kit)

  const [template, setTemplate] = useState<StudioTemplate>(() => templateFromSlug(params.template))
  const [style, setStyle] = useState<StudioStyle>(() => styleFromParam(params.style))
  const [accent, setAccent] = useState<string | null>(null)
  const [format, setFormat] = useState<StudioFormat>(STUDIO_DEFAULT_FORMAT)
  const [tool, setTool] = useState<Tool>('template')
  const [step, setStep] = useState<Step>('edit')
  const [elements, setElements] = useState<StudioElements>(ALL_ELEMENTS)
  const [score, setScore] = useState<{ goalsFor: number; goalsAgainst: number } | null>(null)
  const [text, setText] = useState<{ headline: string; body: string }>({ headline: '', body: '' })
  const [caption, setCaption] = useState<string | null>(null)
  const [captionTake, setCaptionTake] = useState(0)
  const [busy, setBusy] = useState<'variant' | 'caption' | 'post' | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [dest, setDest] = useState<Record<Channel, boolean>>({ feed: true, story: false, fb: false, wa: false })
  const [shared, setShared] = useState<'posted' | 'shared' | null>(null)
  const shotRef = useRef<View>(null)

  const hasScore = SCORE_TEMPLATES.has(template)
  const hasText = TEXT_TEMPLATES.has(template)
  const goalsFor = score?.goalsFor ?? match.goalsFor
  const goalsAgainst = score?.goalsAgainst ?? match.goalsAgainst
  const scoreDirty = Boolean(score) && (goalsFor !== match.goalsFor || goalsAgainst !== match.goalsAgainst || !match.hasLiveData)

  const data = useMemo(
    () =>
      build(template, {
        elements,
        scoreOverride: score,
        text: hasText ? text : undefined,
      }),
    [build, template, elements, score, text, hasText],
  )
  // Tor at 0 own goals falls back to Endstand.
  const shown = resolveTemplate(template, data)
  useEffect(() => {
    if (shown !== template) setTemplate(shown)
  }, [shown, template])

  const freeCaption = useMemo(() => buildCaption(data, kit, t as never, captionTake), [data, kit, t, captionTake])
  const captionText = caption ?? freeCaption
  // A changed graphic drops the AI caption: it described the old one.
  useEffect(() => {
    setCaption(null)
  }, [template, goalsFor, goalsAgainst])

  const presentedBy = t('studio.graphic.presentedBy')
  const title = t(`studio.template.${shown}`)
  const graphic = (width: number, tpl: StudioTemplate = shown, sty: StudioStyle = style, fmt?: StudioFormat) => (
    <StudioGraphic
      data={data}
      template={tpl}
      style={sty}
      format={fmt ?? '4:5'}
      width={width}
      accent={sty === style ? accent : null}
      fontPairing={kit.fontPairing}
      presentedBy={presentedBy}
      accessibilityLabel={t('studio.previewA11y', { template: t(`studio.template.${tpl}`) })}
    />
  )

  const spendFailed = useCallback(() => setNote(t('studio.editor.aiFailed')), [t])

  const onVariant = async () => {
    if (busy) return
    setBusy('variant')
    setNote(null)
    try {
      const res = await actions.variants({ template: shown, style, format, eventId: event?.id ?? null })
      const next = res?.variants?.find((v) => v.style !== style) ?? res?.variants?.[0]
      if (next) {
        setStyle(next.style)
        setAccent(next.accent ?? null)
      }
    } catch {
      spendFailed()
    } finally {
      setBusy(null)
    }
  }

  const onRewrite = async () => {
    if (busy) return
    setBusy('caption')
    setNote(null)
    try {
      const opponent = data.left.isClub ? data.right.name : data.left.name
      const res = await actions.caption({
        template: shown,
        eventId: event?.id ?? null,
        language: getAppLanguage(),
        outcome: hasScore && shown !== 'HALF_TIME' ? data.outcome : null,
        facts: {
          score: data.score,
          opponent,
          ...(data.scorers ? { scorers: data.scorers } : null),
          ...(hasText ? { headline: data.news.headline } : null),
        },
        previous: captionText,
      })
      if (res?.caption) setCaption(res.caption)
    } catch {
      // No backend or a failed generation: nothing was spent; offer the next free take.
      setCaptionTake((n) => n + 1)
      spendFailed()
    } finally {
      setBusy(null)
    }
  }

  const goShare = () => {
    setShared(null)
    setNote(null)
    setStep('share')
  }

  /** "Änderungen fragen, ob das Spiel aktualisiert wird." */
  const onNext = () => {
    if (!hasScore || !scoreDirty || !event || Platform.OS === 'web') {
      goShare()
      return
    }
    Alert.alert(t('studio.editor.updateTitle'), t('studio.editor.updateBody', { score: data.score }), [
      { text: t('studio.editor.updateNo'), onPress: goShare },
      {
        text: t('studio.editor.updateYes'),
        onPress: () => {
          void saveResult(goalsFor, goalsAgainst).then((saved) => {
            if (saved) setScore(null)
            goShare()
          })
        },
      },
    ])
  }

  const igConnected = kit.accounts.some((a) => a.channel === 'INSTAGRAM' && a.connected)
  const fbConnected = kit.accounts.some((a) => a.channel === 'FACEBOOK' && a.connected)
  const igHandle = kit.accounts.find((a) => a.channel === 'INSTAGRAM')?.handle ?? kit.handle
  const selected = (Object.keys(dest) as Channel[]).filter((key) => dest[key])

  const onPost = async () => {
    if (busy || selected.length === 0) return
    setBusy('post')
    setNote(null)
    try {
      const ratio = STUDIO_FORMAT_RATIO[format]
      const uri = await captureRef(shotRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
        width: EXPORT_WIDTH,
        height: Math.round(EXPORT_WIDTH * ratio),
      }).catch(() => null)
      // Archive first; connected Instagram and Facebook channels post from the server.
      const archived = await actions
        .saveGraphic({
          eventId: event?.id ?? null,
          template: shown,
          style,
          format,
          elements,
          data: data as unknown as Record<string, unknown>,
          caption: captionText,
          channels: selected.map((key) => CHANNEL_MAP[key]),
        })
        .then(() => true)
        .catch(() => false)
      const direct = (key: Channel) =>
        archived && ((key === 'feed' || key === 'story') ? igConnected : key === 'fb' ? fbConnected : false)
      const needsSheet = selected.some((key) => !direct(key))
      if (needsSheet) {
        // The native share sheet always works. The caption rides on the clipboard.
        await Clipboard.setStringAsync(captionText).catch(() => undefined)
        const canShare = uri ? await Sharing.isAvailableAsync().catch(() => false) : false
        if (uri && canShare) {
          await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: t('studio.share.sheetTitle'), UTI: 'public.png' })
        } else if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
          // Web: share the caption; the image stays in the archive.
          await navigator.share({ text: captionText }).catch(() => undefined)
        }
      }
      setShared(archived ? 'posted' : 'shared')
    } catch {
      setNote(t('studio.share.failed'))
    } finally {
      setBusy(null)
    }
  }

  if (!access.loading && !access.unlocked) return <StudioLocked build={build} />

  // ── layout ──
  const headerBottom = insets.top + HEADER_TOP + HEADER_HEIGHT
  const panelHeight = EDIT_PANEL + Math.max(0, insets.bottom - SPACING_MD)
  const stageHeight = Math.max(160, window.height - headerBottom - SEG_TOP - SEG_ITEM - SEG_PAD * 2 - panelHeight)
  const [baseW, baseH] = EDIT_SIZE[format]
  const fit = Math.min(1, (stageHeight - STAGE_PAD * 2) / baseH, (window.width - SPACING_LG * 2) / baseW)
  const editWidth = Math.round(baseW * fit)
  const shareWidth = SHARE_SIZE[format][0]
  const leftIsClub = data.left.isClub
  const sideGoals = (isClub: boolean) => (isClub ? goalsFor : goalsAgainst)
  const stepGoals = (isClub: boolean, delta: number) => {
    const clamp = (n: number) => Math.max(0, Math.min(MAX_GOALS, n))
    setScore({
      goalsFor: isClub ? clamp(goalsFor + delta) : goalsFor,
      goalsAgainst: isClub ? goalsAgainst : clamp(goalsAgainst + delta),
    })
  }

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + HEADER_TOP }]}>
      <Pressable
        onPress={() => (step === 'share' ? setStep('edit') : goBackOrReplace(router, '/studio' as never))}
        accessibilityRole="button"
        accessibilityLabel={step === 'share' ? t('studio.backToEdit') : t('studio.close')}
        testID={step === 'share' ? 'studio-editor-back' : 'studio-editor-close'}
        hitSlop={SPACING_XS}
        style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
      >
        <Icon name={step === 'share' ? 'chevron.left' : 'xmark'} size={20} color={STUDIO_ON_WORKSPACE} />
      </Pressable>
      <Text weight="bold" align="center" numberOfLines={1} accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      <CreditsChip balance={balance} onDark testID="studio-editor-credits" />
    </View>
  )

  const sideColumn = (side: typeof data.left) => (
    <View style={styles.resultSide}>
      <MatchCrest name={side.name} badgeUrl={side.crestUrl} size={RESULT_CREST} color={side.color} />
      <Text variant="footnote" weight="bold" color="primary" numberOfLines={1}>
        {side.name}
      </Text>
      <View style={styles.stepperRow}>
        <Pressable
          onPress={() => stepGoals(side.isClub, -1)}
          accessibilityRole="button"
          accessibilityLabel={t('studio.editor.goalLess', { team: side.name })}
          testID={`studio-goal-minus-${side.isClub ? 'us' : 'them'}`}
          style={({ pressed }) => [styles.stepper, { backgroundColor: c.surface, borderColor: c.borderStrong }, pressed && styles.pressed]}
        >
          <Text weight="medium" color="primary" style={styles.stepperGlyph}>
            −
          </Text>
        </Pressable>
        <Text
          allowFontScaling={false}
          align="center"
          color="primary"
          style={styles.scoreNumber}
          testID={`studio-goals-${side.isClub ? 'us' : 'them'}`}
        >
          {sideGoals(side.isClub)}
        </Text>
        <Pressable
          onPress={() => stepGoals(side.isClub, 1)}
          accessibilityRole="button"
          accessibilityLabel={t('studio.editor.goalMore', { team: side.name })}
          testID={`studio-goal-plus-${side.isClub ? 'us' : 'them'}`}
          style={({ pressed }) => [styles.stepper, { backgroundColor: c.surface, borderColor: c.borderStrong }, pressed && styles.pressed]}
        >
          <Text weight="medium" color="primary" style={styles.stepperGlyph}>
            +
          </Text>
        </Pressable>
      </View>
    </View>
  )

  const pick = (
    key: string,
    label: string,
    on: boolean,
    onPress: () => void,
    tile: React.ReactNode,
    extra?: { disabled?: boolean; a11y?: string; testID?: string },
  ) => (
    <Pressable
      key={key}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={extra?.a11y ?? label}
      accessibilityState={{ selected: on, disabled: extra?.disabled }}
      testID={extra?.testID ?? `studio-pick-${key}`}
      style={({ pressed }) => [styles.pick, extra?.disabled && styles.dim, pressed && styles.pressed]}
    >
      <View style={[styles.pickRing, { borderColor: on ? c.ink : STUDIO_TRANSPARENT_BORDER }]}>
        <View style={styles.pickClip}>{tile}</View>
      </View>
      <Text variant="caption1" weight="semibold" color={on ? 'primary' : 'secondary'} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  )

  const toolPanel = () => {
    if (tool === 'template') {
      return (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.pickRail}
          contentContainerStyle={[styles.pickRailContent, { gap: PICK_SPACING - PICK_RING_GAP * 2 - PICK_RING * 2 }]}
          testID="studio-tool-template"
        >
          {EDITOR_TEMPLATES.map((tpl) => {
            const disabled = data.disabled.includes(tpl)
            return pick(
              templateSlug(tpl),
              t(`studio.template.${tpl}`),
              shown === tpl,
              () => {
                if (disabled) {
                  setNote(t(tpl === 'GOAL' ? 'studio.home.disabledGoal' : 'studio.home.disabledMotm'))
                  return
                }
                setNote(null)
                setTemplate(tpl)
              },
              disabled ? (
                <View style={[styles.aiTile, { backgroundColor: data.header.clubColor }]} />
              ) : (
                <StudioGraphic
                  data={data}
                  template={tpl}
                  style="FLUTLICHT"
                  width={PICK_WIDTH}
                  height={PICK_HEIGHT}
                  fontPairing={kit.fontPairing}
                  presentedBy={presentedBy}
                  accessibilityLabel={t(`studio.template.${tpl}`)}
                />
              ),
              { disabled },
            )
          })}
        </ScrollView>
      )
    }
    if (tool === 'style') {
      const cost = STUDIO_CREDIT_COSTS.VARIANT
      return (
        <View style={styles.styleRow} testID="studio-tool-style">
          {STYLES.map((sty) =>
            pick(
              sty.toLowerCase(),
              t(`studio.style.${sty}`),
              style === sty,
              () => {
                setStyle(sty)
                setAccent(null)
              },
              <StudioGraphic
                data={data}
                template={shown}
                style={sty}
                width={PICK_WIDTH}
                height={PICK_HEIGHT}
                fontPairing={kit.fontPairing}
                presentedBy={presentedBy}
                accessibilityLabel={t(`studio.style.${sty}`)}
              />,
            ),
          )}
          {balance >= cost
            ? pick(
                'ai',
                t('studio.editor.aiVariant'),
                false,
                onVariant,
                <View style={[styles.aiTile, { backgroundColor: STUDIO_INK }, busy === 'variant' && styles.dim]}>
                  <SparkleIcon size={22} color={STUDIO_ACCENT} />
                  <View style={styles.aiCost}>
                    <Text allowFontScaling={false} style={styles.aiCostText}>
                      {cost}
                    </Text>
                    <CreditsIcon size={12} color={STUDIO_ON_WORKSPACE} />
                  </View>
                </View>,
                { a11y: t('studio.editor.aiVariantA11y', { count: cost }), testID: 'studio-ai-variant' },
              )
            : pick(
                'credits',
                t('studio.editor.credits'),
                false,
                () => router.push('/studio/credits' as never),
                <View style={[styles.aiTile, { backgroundColor: STUDIO_ACCENT }]}>
                  <CreditsIcon size={24} color={STUDIO_INK} />
                </View>,
                { a11y: t('studio.editor.getCredits'), testID: 'studio-get-credits' },
              )}
        </View>
      )
    }
    if (tool === 'result') {
      if (hasText) {
        return (
          <View style={styles.textTool} testID="studio-tool-text">
            <TextInput
              value={text.headline}
              onChangeText={(headline) => setText((prev) => ({ ...prev, headline }))}
              placeholder={shown === 'NEWS' ? data.news.headline : t('studio.editor.headline')}
              placeholderTextColor={c.textTertiary}
              accessibilityLabel={t('studio.editor.headline')}
              editable={shown === 'NEWS'}
              maxLength={80}
              style={[styles.input, { backgroundColor: c.surface, borderColor: c.borderStrong, color: c.textPrimary }, shown !== 'NEWS' && styles.dim]}
              testID="studio-text-headline"
            />
            <TextInput
              value={text.body}
              onChangeText={(body) => setText((prev) => ({ ...prev, body }))}
              placeholder={shown === 'NEWS' ? data.news.body : data.sponsor.body}
              placeholderTextColor={c.textTertiary}
              accessibilityLabel={t('studio.editor.body')}
              maxLength={140}
              style={[styles.input, { backgroundColor: c.surface, borderColor: c.borderStrong, color: c.textPrimary }]}
              testID="studio-text-body"
            />
          </View>
        )
      }
      if (!hasScore) {
        return (
          <Text variant="footnote" color="secondary" align="center" testID="studio-tool-result-none">
            {t('studio.editor.resultNone')}
          </Text>
        )
      }
      return (
        <View style={styles.resultTool} testID="studio-tool-result">
          {!match.hasLiveData ? (
            <Text variant="footnote" weight="bold" color="primary" align="center" testID="studio-result-enter">
              {t('studio.editor.resultEnter')}
            </Text>
          ) : null}
          <View style={styles.resultRow}>
            {sideColumn(data.left)}
            <Text allowFontScaling={false} style={[styles.colon, { color: STUDIO_DASH }]}>
              :
            </Text>
            {sideColumn(data.right)}
          </View>
          <Text variant="caption1" weight="regular" color="secondary" align="center">
            {match.hasLiveData ? t('studio.editor.resultFromLive') : t('studio.editor.resultEnterHint')}
          </Text>
        </View>
      )
    }
    const rows: Array<{ key: keyof StudioElements; label: string; sub: string | null }> = [
      { key: 'sponsor', label: t('studio.elements.sponsor'), sub: kit.sponsors[0]?.name ?? null },
      { key: 'handle', label: t('studio.elements.handle'), sub: kit.handle },
      { key: 'competition', label: t('studio.elements.competition'), sub: build(shown).header.competition },
    ]
    return (
      <View style={[styles.group, { backgroundColor: c.surface }]} testID="studio-tool-elements">
        {rows.map((row, i) => (
          <View
            key={row.key}
            style={[styles.elementRow, i < rows.length - 1 && { borderBottomWidth: hairline, borderBottomColor: c.borderSubtle }]}
          >
            <View style={styles.flex}>
              <Text variant="body" weight="semibold" color="primary">
                {row.label}
              </Text>
              <Text variant="caption1" weight="regular" color="secondary" numberOfLines={1}>
                {row.sub ?? t('studio.elements.none')}
              </Text>
            </View>
            <StudioSwitch
              value={elements[row.key]}
              onChange={(next) => setElements((prev) => ({ ...prev, [row.key]: next }))}
              label={row.label}
              testID={`studio-element-${row.key}`}
            />
          </View>
        ))}
      </View>
    )
  }

  const tools: Array<{ key: Tool; label: string }> = [
    { key: 'template', label: t('studio.tool.template') },
    { key: 'style', label: t('studio.tool.style') },
    { key: 'result', label: hasText ? t('studio.tool.text') : t('studio.tool.result') },
    { key: 'elements', label: t('studio.tool.elements') },
  ]

  const channels: Array<{ key: Channel; label: string; sub: string }> = [
    { key: 'feed', label: t('studio.share.igFeed'), sub: igConnected && igHandle ? igHandle : t('studio.share.notConnected') },
    { key: 'story', label: t('studio.share.igStory'), sub: igConnected && igHandle ? igHandle : t('studio.share.notConnected') },
    { key: 'fb', label: t('studio.share.fb'), sub: fbConnected ? (kit.accounts.find((a) => a.channel === 'FACEBOOK')?.handle ?? '') : t('studio.share.notConnected') },
    { key: 'wa', label: t('studio.share.wa'), sub: t('studio.share.waSub') },
  ]
  const captionCost = STUDIO_CREDIT_COSTS.CAPTION

  return (
    <View style={styles.root} testID="studio-editor">
      <StatusBar barStyle="light-content" />
      {header}

      {step === 'edit' ? (
        <>
          <View
            style={styles.seg}
            accessibilityRole="radiogroup"
            accessibilityLabel={t('studio.format.label')}
          >
            {FORMATS.map((item) => {
              const on = format === item.key
              return (
                <Pressable
                  key={item.key}
                  onPress={() => setFormat(item.key)}
                  accessibilityRole="radio"
                  accessibilityLabel={t(item.label)}
                  accessibilityState={{ checked: on }}
                  testID={`studio-format-${item.key}`}
                  style={[styles.segItem, on && { backgroundColor: STUDIO_ON_WORKSPACE }]}
                >
                  <Text variant="footnote" weight="semibold" style={{ color: on ? STUDIO_INK : STUDIO_WORKSPACE_MUTED }}>
                    {t(item.label)}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          <View style={styles.stage}>
            <View style={styles.stageShadow}>
              <View ref={shotRef} collapsable={false}>
                {graphic(editWidth, shown, style, format)}
              </View>
            </View>
          </View>

          <View
            style={[
              styles.panel,
              { height: panelHeight, backgroundColor: c.background, paddingBottom: Math.max(PANEL_PAD_BOTTOM, insets.bottom + SPACING_MD) },
            ]}
          >
            <View
              style={[styles.tools, { backgroundColor: c.surfaceSunken }]}
              accessibilityRole="tablist"
              accessibilityLabel={t('studio.tool.label')}
            >
              {tools.map((item) => {
                const on = tool === item.key
                return (
                  <Pressable
                    key={item.key}
                    onPress={() => {
                      setNote(null)
                      setTool(item.key)
                    }}
                    accessibilityRole="tab"
                    accessibilityLabel={item.label}
                    accessibilityState={{ selected: on }}
                    testID={`studio-tool-tab-${item.key}`}
                    style={[styles.tool, on && [styles.toolOn, { backgroundColor: c.surface, shadowColor: STUDIO_INK }]]}
                  >
                    <Text variant="caption1" weight="semibold" color={on ? 'primary' : 'secondary'} numberOfLines={1}>
                      {item.label}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
            <View style={styles.toolPanel} accessibilityRole="summary">
              {toolPanel()}
              {note ? (
                <Text variant="caption1" weight="regular" color="secondary" align="center" style={styles.note} testID="studio-note">
                  {note}
                </Text>
              ) : null}
            </View>
            <Button
              label={t('studio.editor.next')}
              variant="filled"
              size="lg"
              fullWidth
              onPress={onNext}
              style={styles.next}
              testID="studio-next"
            />
          </View>
        </>
      ) : (
        <>
          <View style={styles.shareStage}>
            <View style={styles.stageShadow}>
              <View ref={shotRef} collapsable={false}>
                {graphic(shareWidth, shown, style, format)}
              </View>
            </View>
          </View>
          <View
            style={[
              styles.sharePanel,
              { backgroundColor: c.background, paddingBottom: Math.max(PANEL_PAD_BOTTOM, insets.bottom + SPACING_MD) },
            ]}
            testID="studio-share"
          >
            <View style={[styles.captionCard, { backgroundColor: c.surface }]}>
              <View style={styles.captionHead}>
                <Text variant="label">{t('studio.share.caption')}</Text>
                {balance >= captionCost ? (
                  <Pressable
                    onPress={onRewrite}
                    disabled={busy === 'caption'}
                    accessibilityRole="button"
                    accessibilityLabel={t('studio.share.rewriteA11y', { count: captionCost })}
                    testID="studio-caption-rewrite"
                    hitSlop={SPACING_SM}
                    style={({ pressed }) => [styles.rewrite, (pressed || busy === 'caption') && styles.pressed]}
                  >
                    <Text variant="footnote" weight="semibold" color="tint">
                      {t('studio.share.rewrite', { cost: captionCost })}
                    </Text>
                    <CreditsIcon size={13} color={c.primary} />
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => router.push('/studio/credits' as never)}
                    accessibilityRole="button"
                    accessibilityLabel={t('studio.editor.getCredits')}
                    testID="studio-caption-get-credits"
                    hitSlop={SPACING_SM}
                    style={({ pressed }) => [styles.rewrite, pressed && styles.pressed]}
                  >
                    <Text variant="footnote" weight="semibold" color="tint">
                      {t('studio.editor.getCredits')}
                    </Text>
                    <CreditsIcon size={13} color={c.primary} />
                  </Pressable>
                )}
              </View>
              <Text color="primary" numberOfLines={3} style={styles.caption} testID="studio-caption">
                {captionText}
              </Text>
            </View>

            <View
              style={[styles.group, { backgroundColor: c.surface }]}
              accessibilityLabel={t('studio.share.channels')}
            >
              {channels.map((item, i) => (
                <Pressable
                  key={item.key}
                  onPress={() => {
                    setShared(null)
                    setDest((prev) => ({ ...prev, [item.key]: !prev[item.key] }))
                  }}
                  accessibilityRole="checkbox"
                  accessibilityLabel={`${item.label}, ${item.sub}`}
                  accessibilityState={{ checked: dest[item.key] }}
                  testID={`studio-channel-${item.key}`}
                  style={[styles.channelRow, i < channels.length - 1 && { borderBottomWidth: hairline, borderBottomColor: c.borderSubtle }]}
                >
                  <View style={styles.flex}>
                    <Text variant="footnote" weight="semibold" color="primary" style={styles.channelLabel}>
                      {item.label}
                    </Text>
                    <Text variant="caption1" weight="regular" color="secondary" numberOfLines={1}>
                      {item.sub}
                    </Text>
                  </View>
                  <StudioSwitch value={dest[item.key]} label={item.label} />
                </Pressable>
              ))}
            </View>

            {note ? (
              <Text variant="caption1" weight="regular" color="secondary" align="center" testID="studio-note">
                {note}
              </Text>
            ) : null}

            <View style={styles.shareAction}>
              {shared ? (
                <Button
                  label={t(shared === 'posted' ? 'studio.share.posted' : 'studio.share.shared')}
                  variant="filled"
                  size="lg"
                  fullWidth
                  leftIcon={<Icon name="checkmark" size={18} color={c.onInk} />}
                  onPress={() => router.replace('/studio' as never)}
                  style={styles.next}
                  testID="studio-posted"
                />
              ) : (
                <Button
                  label={
                    selected.length > 0
                      ? t('studio.share.post', { count: selected.length })
                      : t('studio.share.pick')
                  }
                  variant="accent"
                  size="lg"
                  fullWidth
                  loading={busy === 'post'}
                  disabled={busy === 'post' || selected.length === 0}
                  onPress={onPost}
                  style={styles.next}
                  testID="studio-post"
                />
              )}
            </View>
          </View>
        </>
      )}
    </View>
  )
}

const STUDIO_TRANSPARENT_BORDER = 'transparent'

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: STUDIO_WORKSPACE },
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  dim: { opacity: 0.4 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: HEADER_GAP,
    paddingHorizontal: SPACING_LG,
  },
  headerButton: {
    width: HEADER_HEIGHT,
    height: HEADER_HEIGHT,
    borderRadius: RADIUS_FULL,
    backgroundColor: STUDIO_WORKSPACE_FILL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1, color: STUDIO_ON_WORKSPACE, fontSize: TITLE_SIZE, lineHeight: TITLE_SIZE * 1.3 },
  seg: {
    alignSelf: 'center',
    width: SEG_WIDTH,
    marginTop: SEG_TOP,
    flexDirection: 'row',
    gap: SPACING_XS,
    padding: SEG_PAD,
    borderRadius: SEG_RADIUS,
    backgroundColor: STUDIO_WORKSPACE_SEG,
  },
  segItem: {
    flex: 1,
    height: SEG_ITEM,
    borderRadius: SEG_ITEM_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  shareStage: { height: SHARE_STAGE, marginTop: SPACING_SM, alignItems: 'center', justifyContent: 'center' },
  stageShadow: {
    shadowColor: STUDIO_WORKSPACE_SHADOW,
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.55,
    shadowRadius: 30,
    elevation: 12,
  },
  panel: {
    borderTopLeftRadius: RADIUS_HERO,
    borderTopRightRadius: RADIUS_HERO,
    paddingTop: PANEL_PAD_TOP,
    paddingHorizontal: SPACING_LG,
    gap: SPACING_MD,
  },
  tools: { flexDirection: 'row', gap: SPACING_XS, padding: SPACING_XS, borderRadius: TOOLS_RADIUS },
  tool: { flex: 1, height: TOOL_HEIGHT, borderRadius: TOOL_RADIUS, alignItems: 'center', justifyContent: 'center' },
  toolOn: { shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 1 },
  toolPanel: { flex: 1, justifyContent: 'center' },
  note: { marginTop: SPACING_SM },
  next: { minHeight: NEXT_HEIGHT },
  pickRail: { flexGrow: 0, marginHorizontal: -SPACING_LG },
  pickRailContent: { paddingHorizontal: SPACING_LG - PICK_RING - PICK_RING_GAP },
  styleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginHorizontal: -(PICK_RING + PICK_RING_GAP),
    gap: STYLE_SPACING - PICK_RING_GAP * 2 - PICK_RING * 2 - SPACING_LG,
  },
  pick: { alignItems: 'center', gap: PICK_GAP - PICK_RING_GAP, width: PICK_WIDTH + (PICK_RING + PICK_RING_GAP) * 2 },
  pickRing: { borderWidth: PICK_RING, borderRadius: PICK_RADIUS + PICK_RING + PICK_RING_GAP, padding: PICK_RING_GAP },
  pickClip: { borderRadius: PICK_RADIUS, overflow: 'hidden' },
  aiTile: { width: PICK_WIDTH, height: PICK_HEIGHT, alignItems: 'center', justifyContent: 'center', gap: SPACING_XS },
  aiCost: { flexDirection: 'row', alignItems: 'center', gap: SPACING_XXS },
  aiCostText: { fontFamily: FONT_FAMILY_DISPLAY, fontSize: 13, lineHeight: 15, color: STUDIO_ON_WORKSPACE },
  resultTool: { gap: RESULT_GAP },
  resultRow: { flexDirection: 'row', alignItems: 'flex-start' },
  resultSide: { flex: 1, alignItems: 'center', gap: SPACING_SM },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING_SM },
  stepper: {
    width: STEPPER,
    height: STEPPER,
    borderRadius: RADIUS_FULL,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperGlyph: { fontSize: STEPPER_GLYPH, lineHeight: STEPPER_GLYPH * 1.2 },
  scoreNumber: { fontFamily: FONT_FAMILY_DISPLAY, fontSize: SCORE_SIZE, lineHeight: SCORE_SIZE * 1.1, minWidth: 28 },
  colon: { fontFamily: FONT_FAMILY_DISPLAY, fontSize: COLON_SIZE, lineHeight: COLON_SIZE * 1.1, paddingTop: COLON_TOP },
  textTool: { gap: SPACING_SM },
  input: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: SPACING_LG,
    fontSize: 15,
  },
  group: { borderRadius: RADIUS_CARD, paddingHorizontal: ELEMENT_PAD },
  elementRow: { minHeight: ELEMENT_ROW, flexDirection: 'row', alignItems: 'center', gap: SPACING_MD },
  sharePanel: {
    flex: 1,
    marginTop: SPACING_LG,
    borderTopLeftRadius: RADIUS_HERO,
    borderTopRightRadius: RADIUS_HERO,
    paddingTop: SHARE_PAD_TOP,
    paddingHorizontal: SPACING_LG,
    gap: SHARE_GAP,
  },
  captionCard: {
    borderRadius: CAPTION_RADIUS,
    paddingVertical: SPACING_MD,
    paddingHorizontal: ELEMENT_PAD,
    gap: PICK_GAP,
  },
  captionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 },
  rewrite: { flexDirection: 'row', alignItems: 'center', gap: SPACING_XS },
  caption: { fontSize: CAPTION_SIZE, lineHeight: CAPTION_SIZE * 1.45 },
  channelRow: { minHeight: CHANNEL_ROW, flexDirection: 'row', alignItems: 'center', gap: SPACING_MD },
  channelLabel: { fontSize: 14 },
  shareAction: { marginTop: 'auto' },
})
