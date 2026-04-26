import { type ReactNode } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Button, Icon, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { fontSize, fonts, radius, space } from '../../theme/tokens'

export type WizardStepProps = {
  title: string
  hint?: string
  ctaLabel: string
  onCta: () => void
  ctaDisabled?: boolean
  ctaLoading?: boolean
  progress?: number
  onBack?: () => void
  children: ReactNode
}

export function WizardStep(props: WizardStepProps) {
  const insets = useSafeAreaInsets()
  const colors = useClubColors()
  const router = useRouter()

  const handleBack = props.onBack ?? (() => router.back())

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.root, { backgroundColor: colors.surface }]}
    >
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <Pressable
          onPress={handleBack}
          accessibilityLabel="Go back"
          hitSlop={12}
          style={styles.backBtn}
        >
          <Icon name="chevron.left" size={24} color={colors.textPrimary} />
        </Pressable>
        {typeof props.progress === 'number' && (
          <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.round(props.progress * 100)}%`, backgroundColor: colors.primary },
              ]}
            />
          </View>
        )}
      </View>

      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{props.title}</Text>
        {props.hint && <Text style={[styles.hint, { color: colors.textSecondary }]}>{props.hint}</Text>}
        <View style={styles.content}>{props.children}</View>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        <Button
          label={props.ctaLabel}
          onPress={props.onCta}
          disabled={props.ctaDisabled}
          loading={props.ctaLoading}
        />
      </View>
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
  body: { flex: 1, paddingHorizontal: space.lg, paddingTop: space.lg },
  title: { fontFamily: fonts.heading, fontSize: fontSize['3xl'], fontWeight: '800' },
  hint: { marginTop: space.sm, fontFamily: fonts.body, fontSize: fontSize.sm, opacity: 0.7 },
  content: { marginTop: space.xl, flex: 1 },
  footer: { paddingHorizontal: space.lg, paddingTop: space.sm },
})
