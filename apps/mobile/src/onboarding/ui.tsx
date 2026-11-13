import { forwardRef, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ActivityIndicator,
  BackHandler,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
  type TextInputProps,
} from 'react-native'
import Svg, { Path, Text as SvgText } from 'react-native-svg'
import { useKeyboardState } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { Button, Icon, IconButton, Text } from '../components/ui'
import { useClubColors, useIsDark } from '../context/ClubThemeContext'
import { onColor } from '../theme/club-theme'
import { fonts, fontSize, hairline, space } from '../theme/tokens'
import {
  BUTTON_HEIGHT_LG,
  INPUT_HEIGHT,
  RADIUS_CARD,
  RADIUS_FULL,
  RADIUS_INPUT,
  RADIUS_MD,
  SCREEN_PADDING,
} from '../theme/spacing'
import type { OnboardingProgress } from './steps'

/**
 * Pure inset math (M8), shared by the hook and its spec.
 *
 * `keyboardHeight` is the keyboard's height from the bottom of the screen
 * (react-native-keyboard-controller reports it the same way on iOS and on
 * Android edge-to-edge). When the platform resizes the window instead
 * (Android adjustResize without edge-to-edge, split screen), the window got
 * shorter by roughly the keyboard, so only what the resize did not absorb
 * still overlaps our content. The baseline is the window height measured
 * while the keyboard was hidden.
 */
export function computeKeyboardInset(
  keyboardHeight: number,
  baselineWindowHeight: number,
  currentWindowHeight: number,
): number {
  if (!(keyboardHeight > 0)) return 0
  const absorbedByResize = Math.max(0, baselineWindowHeight - currentWindowHeight)
  return Math.max(0, Math.round(keyboardHeight - absorbedByResize))
}

/**
 * How many points of the window the software keyboard currently covers, so
 * the primary button sits right above it on iOS and on every Android keyboard
 * mode, including edge-to-edge (where the window no longer shrinks).
 */
export function useKeyboardInset(): number {
  const { height: windowHeight } = useWindowDimensions()
  const keyboardHeight = useKeyboardState((state) => (state.isVisible ? state.height : 0))
  const baseline = useRef(windowHeight)
  // Track the unobstructed window height (rotation, split screen) while the
  // keyboard is down; keep it while the keyboard is up.
  if (keyboardHeight <= 0) baseline.current = windowHeight
  return computeKeyboardInset(keyboardHeight, baseline.current, windowHeight)
}

/**
 * Hardware back on Android. `handler` returns true when it consumed the press.
 * A one-way door passes no handler: the press falls through to the navigator,
 * which exits the app because the door was entered with `router.replace`.
 */
export function useAndroidBack(handler: (() => boolean) | null | undefined) {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    if (Platform.OS !== 'android') return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => ref.current?.() ?? false)
    return () => sub.remove()
  }, [])
}

/**
 * "Schritt 2 von 4" in the header (2026-11 redesign: a quiet step label
 * instead of the segmented bar). Still a progressbar for screen readers.
 */
export function ProgressSegments({ progress }: { progress: OnboardingProgress }) {
  const { t } = useTranslation()
  const label = t('onboardingFlow.progressA11y', {
    current: progress.current,
    total: progress.total,
  })
  return (
    <View
      style={styles.progress}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: progress.total, now: progress.current }}
    >
      <Text variant="footnote" weight="semibold" color="secondary" align="center" numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

export type OnboardingAction = {
  label: string
  onPress: () => void
  disabled?: boolean
  loading?: boolean
  /** Fill colour instead of ink (club-coloured "Weiter" on "Dein Verein"). */
  color?: string
  testID?: string
}

export type OnboardingScreenProps = {
  title: string
  subtitle?: string
  progress?: OnboardingProgress | null
  /** Back arrow + Android back. `null` = one-way door: no arrow, back exits. */
  onBack?: (() => void) | null
  headerRight?: ReactNode
  /** Quiet caption in the header middle instead of a step ("Optional"). */
  headerLabel?: string
  /** Rendered above the title (crest, invite card). */
  lead?: ReactNode
  primary?: OnboardingAction
  secondary?: OnboardingAction
  /** Extra content pinned under the buttons (consent line). */
  footerNote?: ReactNode
  /** Content at the bottom of the scrolling page (legal line), not docked. */
  pageFooter?: ReactNode
  children?: ReactNode
  testID?: string
}

/**
 * The one layout every onboarding step uses: header (back, progress), one
 * large title, a short supporting line, the question, and one primary button
 * pinned above the keyboard on both platforms.
 */
export function OnboardingScreen({
  title,
  subtitle,
  progress,
  onBack,
  headerRight,
  headerLabel,
  lead,
  primary,
  secondary,
  footerNote,
  pageFooter,
  children,
  testID,
}: OnboardingScreenProps) {
  const c = useClubColors()
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const keyboardInset = useKeyboardInset()
  const isDark = useIsDark()

  useAndroidBack(
    onBack
      ? () => {
          onBack()
          return true
        }
      : null,
  )

  const footerBottom = keyboardInset > 0 ? keyboardInset + space.sm : insets.bottom + space.md
  const hasFooter = Boolean(primary || secondary || footerNote)

  return (
    <View style={[styles.root, { backgroundColor: c.background }]} testID={testID}>
      {/* The welcome hero switches to light content; every step after it is
          on the page background again. */}
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <View style={[styles.header, { paddingTop: insets.top + space.md }]}>
        {onBack ? (
          <IconButton
            variant="outlined"
            onPress={onBack}
            accessibilityLabel={t('common.back')}
          >
            <Icon name="chevron.left" size={20} color={c.textPrimary} />
          </IconButton>
        ) : (
          <View style={styles.backSpacer} />
        )}
        <View style={styles.headerMiddle}>
          {progress ? (
            <ProgressSegments progress={progress} />
          ) : headerLabel ? (
            <View style={styles.progress}>
              <Text variant="footnote" weight="semibold" color="secondary" align="center" numberOfLines={1}>
                {headerLabel}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.headerRight}>{headerRight}</View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
      >
        {lead ? <View style={styles.lead}>{lead}</View> : null}
        <Text variant="title1" accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="body" color="secondary" style={styles.subtitle}>
            {subtitle}
          </Text>
        ) : null}
        {children ? <View style={styles.body}>{children}</View> : null}
        {pageFooter ? <View style={styles.pageFooter}>{pageFooter}</View> : null}
      </ScrollView>

      {hasFooter ? (
        <View
          style={[
            styles.footer,
            {
              paddingBottom: footerBottom,
              backgroundColor: c.background,
              borderTopColor: c.borderSubtle,
            },
          ]}
        >
          {primary?.color ? (
            <ColorAction action={primary} color={primary.color} />
          ) : primary ? (
            <Button
              label={primary.label}
              onPress={primary.onPress}
              disabled={primary.disabled}
              loading={primary.loading}
              testID={primary.testID}
              size="lg"
              fullWidth
            />
          ) : null}
          {secondary ? (
            <Button
              label={secondary.label}
              onPress={secondary.onPress}
              disabled={secondary.disabled}
              loading={secondary.loading}
              testID={secondary.testID}
              variant="plain"
              fullWidth
            />
          ) : null}
          {footerNote}
        </View>
      ) : null}
    </View>
  )
}

/** 56pt pill in a given fill (the club colour), same shape as Button lg. */
function ColorAction({ action, color }: { action: OnboardingAction; color: string }) {
  const c = useClubColors()
  const disabled = !!action.disabled && !action.loading
  const fg = disabled ? c.textTertiary : onColor(color)
  return (
    <Pressable
      onPress={action.onPress}
      disabled={disabled || action.loading}
      accessibilityRole="button"
      accessibilityLabel={action.label}
      accessibilityState={{ disabled, busy: !!action.loading }}
      style={({ pressed }) => [
        styles.colorAction,
        { backgroundColor: disabled ? c.surfaceSunken : color, opacity: pressed ? 0.9 : 1 },
      ]}
      testID={action.testID}
    >
      {action.loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text variant="body" weight="bold" color={fg} style={styles.colorActionLabel}>
          {action.label}
        </Text>
      )}
    </Pressable>
  )
}

type FieldProps = TextInputProps & {
  label: string
  error?: string | null
  hint?: string | null
}

/** Large, readable single-line input used by every onboarding question. */
export const OnboardingTextField = forwardRef<TextInput, FieldProps>(function OnboardingTextField(
  { label, error, hint, style, onFocus, onBlur, ...rest },
  ref,
) {
  const c = useClubColors()
  const [focused, setFocused] = useState(false)
  return (
    <View style={styles.field}>
      <Text variant="footnote" weight="semibold" color="primary">
        {label}
      </Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={c.textTertiary}
        selectionColor={c.ink}
        onFocus={(event) => {
          setFocused(true)
          onFocus?.(event)
        }}
        onBlur={(event) => {
          setFocused(false)
          onBlur?.(event)
        }}
        style={[
          styles.input,
          {
            color: c.textPrimary,
            backgroundColor: c.surface,
            borderColor: error ? c.error : focused ? c.ink : c.borderStrong,
            borderWidth: focused || error ? 2 : 1,
          },
          style,
        ]}
        {...rest}
      />
      {error ? (
        <Text variant="footnote" color="error" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption1" color="secondary">
          {hint}
        </Text>
      ) : null}
    </View>
  )
})

export type CrestClub = {
  name: string
  badgeUrl?: string | null
  primaryColor?: string | null
}

export function clubInitials(name: string): string {
  return (
    name
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((part) => part.length > 0 && !/^\d+$/.test(part))
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || name.slice(0, 1).toUpperCase()
  )
}

/**
 * Club crest: the badge when there is one, otherwise the design's shield in
 * the club colour with a lime inner line and the initials. `size` is the
 * width; the shield keeps the design's 40:44 aspect.
 */
export function ClubCrest({ club, size = 56 }: { club: CrestClub; size?: number }) {
  const c = useClubColors()
  const fill = club.primaryColor && /^#[0-9A-Fa-f]{6}$/.test(club.primaryColor)
    ? club.primaryColor
    : c.heroBg
  const height = Math.round((size * 44) / 40)
  if (club.badgeUrl) {
    return (
      <Image
        source={{ uri: club.badgeUrl }}
        style={{ width: size, height }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
        accessible={false}
      />
    )
  }
  return (
    <View accessible={false} style={{ width: size, height }}>
      <Svg width={size} height={height} viewBox="0 0 40 44">
        <Path d={SHIELD_OUTER} fill={fill} />
        <Path d={SHIELD_INNER} fill="none" stroke={c.accent} strokeOpacity={0.55} strokeWidth={1} />
        <SvgText
          x={20}
          y={25.5}
          textAnchor="middle"
          fontFamily={fonts.display}
          fontWeight="700"
          fontSize={12.5}
          fill={onColor(fill)}
        >
          {clubInitials(club.name).slice(0, 3)}
        </SvgText>
      </Svg>
    </View>
  )
}

const SHIELD_OUTER = 'M20 1.5 37.5 7.5v12.5c0 10.5-7.5 18.5-17.5 22.5C10 38.5 2.5 30.5 2.5 20V7.5z'
const SHIELD_INNER = 'M20 5 34 9.8v10.2c0 8.6-6 15.2-14 18.6C12 35.2 6 28.6 6 20V9.8z'

/** Selectable row (role choice, search result). */
export function ChoiceRow({
  icon,
  title,
  body,
  selected,
  onPress,
  leading,
  trailing,
  testID,
  accessibilityRole = 'radio',
}: {
  icon?: string
  title: string
  body?: string
  selected?: boolean
  onPress: () => void
  leading?: ReactNode
  trailing?: ReactNode
  testID?: string
  accessibilityRole?: 'radio' | 'button'
}) {
  const c = useClubColors()
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityRole === 'radio' ? { selected: !!selected } : undefined}
      accessibilityLabel={body ? `${title}. ${body}` : title}
      android_ripple={{ color: c.borderDefault }}
      style={({ pressed }) => [
        styles.choice,
        {
          backgroundColor: pressed ? c.surfaceMuted : c.surface,
          borderColor: selected ? c.ink : 'transparent',
          borderWidth: 2,
        },
      ]}
    >
      {leading ??
        (icon ? (
          <View style={[styles.choiceIcon, { backgroundColor: selected ? c.ink : c.surfaceMuted }]}>
            <Icon name={icon} size={20} color={selected ? c.onInk : c.textPrimary} />
          </View>
        ) : null)}
      <View style={styles.choiceCopy}>
        <Text variant="headline" weight="bold">
          {title}
        </Text>
        {body ? (
          <Text variant="caption1" color="secondary">
            {body}
          </Text>
        ) : null}
      </View>
      {trailing ??
        (accessibilityRole === 'radio' ? (
          <View
            style={[
              styles.radio,
              selected
                ? { borderWidth: 7, borderColor: c.ink }
                : { borderWidth: 2, borderColor: c.borderControl },
            ]}
          />
        ) : (
          <Icon name="chevron.right" size={18} color={c.textTertiary} />
        ))}
    </Pressable>
  )
}

/** Small text button in the header ("Abmelden"). */
export function HeaderTextButton({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useClubColors()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      android_ripple={{ color: c.borderDefault, borderless: true }}
      style={styles.headerTextButton}
    >
      <Text variant="subheadline" weight="semibold" color="tint">
        {label}
      </Text>
    </Pressable>
  )
}

/** Design: 15/1.5 supporting line under the title. */
const SUBTITLE_LINE_HEIGHT = Math.round(fontSize.md * 1.5)
/** Pushes the page footer to the bottom of the scroll content. */
const AUTO = 'auto' as const

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SCREEN_PADDING,
    gap: space.sm,
  },
  backSpacer: { width: 44, height: 44 },
  headerMiddle: { flex: 1, minWidth: 0 },
  headerRight: { minWidth: 44, alignItems: 'flex-end' },
  headerTextButton: {
    minHeight: 44,
    paddingHorizontal: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progress: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: space.lg,
    paddingBottom: space.xl,
  },
  lead: { marginBottom: space.md },
  title: { marginBottom: space.sm },
  subtitle: { lineHeight: SUBTITLE_LINE_HEIGHT },
  pageFooter: { marginTop: AUTO, paddingTop: space.lg },
  body: { marginTop: space.lg + space.xs, gap: space.md - 2 },
  footer: {
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: space.md - 4,
    borderTopWidth: hairline,
    gap: space.xs,
  },
  field: { gap: space.xs + 2 },
  colorAction: {
    minHeight: BUTTON_HEIGHT_LG,
    borderRadius: RADIUS_FULL,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  colorActionLabel: { fontSize: fontSize.lg, lineHeight: 20 },
  input: {
    minHeight: INPUT_HEIGHT,
    borderRadius: RADIUS_INPUT,
    borderCurve: 'continuous',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontFamily: fonts.body,
    fontSize: fontSize.md,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 68,
    paddingHorizontal: space.md,
    paddingVertical: space.md - 4,
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
  },
  radio: { width: 22, height: 22, borderRadius: RADIUS_FULL },
  choiceIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS_MD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceCopy: { flex: 1, minWidth: 0, gap: space['2xs'] },
})
