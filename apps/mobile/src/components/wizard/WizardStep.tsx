import { useEffect, useRef, type ReactNode } from 'react'
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, type Href } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Button, Icon, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import type { ClubTheme } from '../../theme/club-theme'
import { goBackOrReplace } from '../../utils/navigation'
import { fontSize, fonts, hairline, radius, space } from '../../theme/tokens'

/**
 * Staggered entry choreography shared by both layout branches: the step label,
 * title, hint and content fade up in sequence on mount (gentle 12px rise, ~70ms
 * apart). Reduced-motion renders everything settled immediately. Native-driver
 * (transform + opacity only), so it stays at 60fps and never blocks taps.
 */
function WizardBody({
  stepLabel,
  title,
  hint,
  children,
  colors,
  contentStyle,
}: {
  stepLabel?: string
  title: string
  hint?: string
  children: ReactNode
  colors: ClubTheme
  contentStyle: StyleProp<ViewStyle>
}) {
  const reduceMotion = useReducedMotion()
  const slots = useRef([0, 1, 2, 3].map(() => new Animated.Value(reduceMotion ? 1 : 0))).current

  useEffect(() => {
    if (reduceMotion) return
    const animation = Animated.stagger(
      70,
      slots.map((v) =>
        Animated.timing(v, {
          toValue: 1,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ),
    )
    animation.start()
    return () => animation.stop()
  }, [reduceMotion, slots])

  const reveal = (v: Animated.Value) => ({
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
  })

  return (
    <>
      {stepLabel ? (
        <Animated.View style={reveal(slots[0])}>
          <Text style={[styles.stepLabel, { color: colors.textTertiary }]}>
            {stepLabel.toUpperCase()}
          </Text>
        </Animated.View>
      ) : null}
      <Animated.View style={reveal(slots[1])}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
      </Animated.View>
      {hint ? (
        <Animated.View style={reveal(slots[2])}>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>{hint}</Text>
        </Animated.View>
      ) : null}
      <Animated.View style={[contentStyle, reveal(slots[3])]}>{children}</Animated.View>
    </>
  )
}

export type WizardStepProps = {
  title: string
  hint?: string
  stepLabel?: string
  ctaLabel?: string
  onCta?: () => void
  ctaDisabled?: boolean
  ctaLoading?: boolean
  /**
   * Legacy 0..1 progress bar. Used as a fallback when `step` is not
   * provided. Most callers should migrate to `step`.
   */
  progress?: number
  /**
   * Pill-progress display: shows N dots, filled-club-color current,
   * small-filled completed, hairline-outline future. Premium feel + a
   * clearer sense of "where am I in the journey".
   */
  step?: { current: number; total: number }
  /**
   * Optional role-tinted accent — coloured wash applied to the pill
   * progress + the back button background. Used after role selection
   * so each role's branch wears its identity colour through the rest
   * of the wizard.
   */
  accentColor?: string
  /**
   * When true, the body becomes a ScrollView so tall content (the
   * `done` celebration with multiple "what to try first" tiles, the
   * role picker on small phones) doesn't get clipped behind the
   * fixed-bottom CTA. Default false to keep short steps unchanged.
   */
  scrollable?: boolean
  /**
   * Controls the parent ScrollView when `scrollable` is enabled. Useful for
   * forms containing nested vertical controls (for example DOB wheels) that
   * need temporary ownership of the drag gesture.
   */
  scrollEnabled?: boolean
  onBack?: () => void
  backFallbackHref?: Href
  children: ReactNode
}

export function WizardStep(props: WizardStepProps) {
  const insets = useSafeAreaInsets()
  const colors = useClubColors()
  const router = useRouter()
  const { t } = useTranslation()
  const accent = props.accentColor ?? colors.primary

  const handleBack = props.onBack ?? (() => goBackOrReplace(router, props.backFallbackHref ?? '/'))

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardArea}
      >
        <View style={[styles.header, { paddingTop: insets.top + space.md }]}>
          <Pressable
            onPress={handleBack}
            accessibilityLabel={t('common.back')}
            hitSlop={12}
            style={[styles.backBtn, { backgroundColor: colors.surfaceSunken }]}
          >
            <Icon name="chevron.left" size={24} color={colors.textPrimary} />
          </Pressable>
          {props.step ? (
            <View style={styles.pillRow}>
              {Array.from({ length: props.step.total }, (_, i) => {
                const isCurrent = i === props.step!.current - 1
                const isComplete = i < props.step!.current - 1
                return (
                  <View
                    key={i}
                    style={[
                      styles.pillBase,
                      isCurrent
                        ? { width: 22, backgroundColor: accent }
                        : isComplete
                          ? { width: 8, backgroundColor: accent, opacity: 0.55 }
                          : {
                              width: 8,
                              borderWidth: hairline,
                              borderColor: colors.borderStrong,
                              backgroundColor: 'transparent',
                            },
                    ]}
                  />
                )
              })}
              <Text variant="caption2" color="secondary" tabular style={styles.stepCount}>
                {props.step.current}/{props.step.total}
              </Text>
            </View>
          ) : typeof props.progress === 'number' ? (
            <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.round(props.progress * 100)}%`, backgroundColor: accent },
                ]}
              />
            </View>
          ) : null}
        </View>

        {props.scrollable ? (
          <ScrollView
            style={styles.scrollBody}
            contentContainerStyle={styles.scrollContent}
            scrollEnabled={props.scrollEnabled ?? true}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          >
            <WizardBody
              stepLabel={props.stepLabel}
              title={props.title}
              hint={props.hint}
              colors={colors}
              contentStyle={styles.scrollableContent}
            >
              {props.children}
            </WizardBody>
          </ScrollView>
        ) : (
          <View style={styles.body}>
            <WizardBody
              stepLabel={props.stepLabel}
              title={props.title}
              hint={props.hint}
              colors={colors}
              contentStyle={styles.content}
            >
              {props.children}
            </WizardBody>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Keep the CTA at the screen edge instead of lifting it above the
          keyboard. The keyboard covers it while typing, leaving the reduced
          viewport entirely available to the form; dismissing the keyboard
          restores the action in its normal bottom position. */}
      {props.ctaLabel ? (
        <View
          style={[
            styles.footer,
            {
              paddingBottom: insets.bottom + space.md,
              backgroundColor: colors.surface,
              borderTopColor: colors.borderSubtle,
            },
          ]}
        >
          <Button
            label={props.ctaLabel}
            onPress={props.onCta ?? (() => {})}
            disabled={props.ctaDisabled}
            loading={props.ctaLoading}
            fullWidth
          />
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  keyboardArea: { flex: 1 },
  header: {
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: { flex: 1, height: 3, borderRadius: radius.full, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: radius.full },
  pillRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
  },
  pillBase: {
    height: 8,
    borderRadius: radius.full,
  },
  stepCount: { marginLeft: space.sm },
  body: { flex: 1, paddingHorizontal: space.lg, paddingTop: space.xl },
  scrollBody: { flex: 1 },
  scrollContent: { paddingHorizontal: space.lg, paddingTop: space.xl, paddingBottom: space.xl },
  scrollableContent: { marginTop: space.xl },
  stepLabel: {
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: '700',
    marginBottom: space.sm,
    opacity: 0.7,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: fontSize['3xl'],
    lineHeight: fontSize['3xl'] * 1.15,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  hint: {
    marginTop: space.sm,
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    opacity: 0.7,
    lineHeight: 20,
  },
  content: { marginTop: space.xl, flex: 1 },
  footer: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    borderTopWidth: hairline,
  },
})
