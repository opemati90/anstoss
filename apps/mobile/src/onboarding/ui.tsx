import { forwardRef, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  BackHandler,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
  type TextInputProps,
} from 'react-native'
import { useKeyboardState } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { Button, Icon, Text } from '../components/ui'
import { useClubColors } from '../context/ClubThemeContext'
import { onColor } from '../theme/club-theme'
import { fonts, fontSize, hairline, radius, space } from '../theme/tokens'
import { RADIUS_INPUT } from '../theme/spacing'
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

/** Visibility is separate from overlap: Android may resize the window fully. */
export function useKeyboardVisible(): boolean {
  return useKeyboardState((state) => state.isVisible)
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

export function ProgressSegments({ progress }: { progress: OnboardingProgress }) {
  const c = useClubColors()
  const { t } = useTranslation()
  return (
    <View
      style={styles.progress}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('onboardingFlow.progressA11y', {
        current: progress.current,
        total: progress.total,
      })}
      accessibilityValue={{ min: 0, max: progress.total, now: progress.current }}
    >
      {Array.from({ length: progress.total }, (_, index) => (
        <View
          key={index}
          style={[
            styles.segment,
            { backgroundColor: index < progress.current ? c.primary : c.borderDefault },
          ]}
        />
      ))}
    </View>
  )
}

export type OnboardingAction = {
  label: string
  onPress: () => void
  disabled?: boolean
  loading?: boolean
  testID?: string
}

export type OnboardingScreenProps = {
  title: string
  subtitle?: string
  progress?: OnboardingProgress | null
  /** Back arrow + Android back. `null` = one-way door: no arrow, back exits. */
  onBack?: (() => void) | null
  headerRight?: ReactNode
  /** Rendered above the title (crest, invite card). */
  lead?: ReactNode
  primary?: OnboardingAction
  secondary?: OnboardingAction
  /** Extra content pinned under the buttons (consent line). */
  footerNote?: ReactNode
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
  lead,
  primary,
  secondary,
  footerNote,
  children,
  testID,
}: OnboardingScreenProps) {
  const c = useClubColors()
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const keyboardInset = useKeyboardInset()

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
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            hitSlop={8}
            android_ripple={{ color: c.borderDefault, borderless: true }}
            style={styles.back}
          >
            <Icon name="chevron.left" size={24} color={c.textPrimary} />
          </Pressable>
        ) : (
          <View style={styles.backSpacer} />
        )}
        <View style={styles.headerMiddle}>
          {progress ? <ProgressSegments progress={progress} /> : null}
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
          {primary ? (
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

type FieldProps = TextInputProps & {
  label: string
  error?: string | null
  hint?: string | null
}

/** Large, readable single-line input used by every onboarding question. */
export const OnboardingTextField = forwardRef<TextInput, FieldProps>(function OnboardingTextField(
  { label, error, hint, accessibilityHint, style, onFocus, onBlur, ...rest },
  ref,
) {
  const c = useClubColors()
  const [focused, setFocused] = useState(false)
  return (
    <View style={styles.field}>
      <Text variant="subheadline" weight="semibold" color="secondary">
        {label}
      </Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        accessibilityHint={error ?? accessibilityHint ?? hint ?? undefined}
        placeholderTextColor={c.textTertiary}
        selectionColor={c.primary}
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
            borderColor: error ? c.error : focused ? c.primary : c.borderDefault,
            borderWidth: focused || error ? 2 : hairline * 2,
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
        <Text variant="footnote" color="tertiary">
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

/** Club crest, or the initials on the club colour when there is no badge. */
export function ClubCrest({ club, size = 56 }: { club: CrestClub; size?: number }) {
  const c = useClubColors()
  const fill = club.primaryColor && /^#[0-9A-Fa-f]{6}$/.test(club.primaryColor)
    ? club.primaryColor
    : c.primary
  const shape = {
    width: size,
    height: size,
    borderRadius: size * 0.28,
    borderCurve: 'continuous' as const,
  }
  if (club.badgeUrl) {
    return (
      <Image
        source={{ uri: club.badgeUrl }}
        style={[shape, { backgroundColor: c.surfaceSunken }]}
        accessibilityIgnoresInvertColors
        accessible={false}
      />
    )
  }
  return (
    <View style={[shape, styles.crestFallback, { backgroundColor: fill }]} accessible={false}>
      <Text
        style={{
          color: onColor(fill),
          fontFamily: fonts.heading,
          fontSize: Math.round(size * 0.36),
          lineHeight: Math.round(size * 0.44),
          includeFontPadding: false,
        }}
        allowFontScaling={false}
      >
        {clubInitials(club.name)}
      </Text>
    </View>
  )
}

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
          backgroundColor: selected ? c.primary50 : pressed ? c.surfaceSunken : c.surface,
          borderColor: selected ? c.primary : c.borderDefault,
          borderWidth: selected ? 2 : hairline * 2,
        },
      ]}
    >
      {leading ??
        (icon ? (
          <View style={[styles.choiceIcon, { backgroundColor: selected ? c.primary : c.surfaceSunken }]}>
            <Icon name={icon} size={20} color={selected ? c.onPrimary : c.textPrimary} />
          </View>
        ) : null)}
      <View style={styles.choiceCopy}>
        <Text variant="headline" weight="semibold">
          {title}
        </Text>
        {body ? (
          <Text variant="footnote" color="secondary">
            {body}
          </Text>
        ) : null}
      </View>
      {trailing ??
        (accessibilityRole === 'radio' ? (
          <Icon
            name={selected ? 'checkmark.circle.fill' : 'ellipse-outline'}
            size={22}
            color={selected ? c.primary : c.borderStrong}
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
      <Text variant="subheadline" weight="semibold" color="secondary">
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.sm,
    gap: space.sm,
  },
  back: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
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
    flexDirection: 'row',
    gap: space.xs,
    alignItems: 'center',
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: radius.full,
  },
  scroll: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: space.md,
    paddingTop: space.lg,
    paddingBottom: space.xl,
  },
  lead: { marginBottom: space.lg },
  title: { marginBottom: space.sm },
  subtitle: { marginBottom: space.xs },
  body: { marginTop: space.lg, gap: space.md },
  footer: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    borderTopWidth: hairline,
    gap: space.xs,
  },
  field: { gap: space.xs },
  input: {
    minHeight: 56,
    borderRadius: RADIUS_INPUT,
    borderCurve: 'continuous',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontFamily: fonts.body,
    fontSize: fontSize.xl,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  crestFallback: { alignItems: 'center', justifyContent: 'center' },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 64,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + space.xs,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
  },
  choiceIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceCopy: { flex: 1, minWidth: 0, gap: space['2xs'] },
})
