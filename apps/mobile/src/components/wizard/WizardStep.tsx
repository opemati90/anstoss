import { type ReactNode } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, type Href } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Button, Icon, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { goBackOrReplace } from '../../utils/navigation'
import { fontSize, fonts, hairline, radius, space } from '../../theme/tokens'

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
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.root, { backgroundColor: colors.surface }]}
    >
      <View style={[styles.header, { paddingTop: insets.top + space.md }]}>
        <Pressable
          onPress={handleBack}
          accessibilityLabel={t('common.back')}
          hitSlop={12}
          style={styles.backBtn}
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
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {props.stepLabel ? (
            <Text style={[styles.stepLabel, { color: colors.textTertiary }]}>
              {props.stepLabel.toUpperCase()}
            </Text>
          ) : null}
          <Text style={[styles.title, { color: colors.textPrimary }]}>{props.title}</Text>
          {props.hint && (
            <Text style={[styles.hint, { color: colors.textSecondary }]}>{props.hint}</Text>
          )}
          <View style={styles.scrollableContent}>{props.children}</View>
        </ScrollView>
      ) : (
        <View style={styles.body}>
          {props.stepLabel ? (
            <Text style={[styles.stepLabel, { color: colors.textTertiary }]}>
              {props.stepLabel.toUpperCase()}
            </Text>
          ) : null}
          <Text style={[styles.title, { color: colors.textPrimary }]}>{props.title}</Text>
          {props.hint && (
            <Text style={[styles.hint, { color: colors.textSecondary }]}>{props.hint}</Text>
          )}
          <View style={styles.content}>{props.children}</View>
        </View>
      )}

      {props.ctaLabel ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
          <Button
            label={props.ctaLabel}
            onPress={props.onCta ?? (() => {})}
            disabled={props.ctaDisabled}
            loading={props.ctaLoading}
            fullWidth
          />
        </View>
      ) : null}
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  backBtn: { padding: space.xs },
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
  hint: { marginTop: space.sm, fontFamily: fonts.body, fontSize: fontSize.sm, opacity: 0.7, lineHeight: 20 },
  content: { marginTop: space.xl, flex: 1 },
  footer: { paddingHorizontal: space.lg, paddingTop: space.sm },
})
