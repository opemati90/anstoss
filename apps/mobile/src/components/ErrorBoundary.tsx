import { Component, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import * as Updates from 'expo-updates'
import * as Sentry from '@sentry/react-native'
import i18n from '../i18n'
import { useClubColors } from '../context/ClubThemeContext'
import { fontSize, space, radius, fonts, lineHeight,
  hairline } from '../theme/tokens'

type Props = {
  children: ReactNode
}

type State = {
  hasError: boolean
  error: Error | null
}

function ErrorFallback({
  error,
  onRestart,
}: {
  error: Error | null
  onRestart: () => void
}) {
  const c = useClubColors()

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: c.surface,
            borderColor: c.border,
          },
        ]}
      >
        <Text
          style={[
            styles.icon,
            {
              color: c.error,
              borderColor: c.error,
            },
          ]}
        >
          !
        </Text>
        <Text style={[styles.title, { color: c.textPrimary }]}>
          {i18n.t('errorBoundary.title')}
        </Text>
        <Text style={[styles.body, { color: c.textSecondary }]}>
          {i18n.t('errorBoundary.body')}
        </Text>
        {__DEV__ && error && (
          <Text
            style={[styles.debug, { color: c.error, backgroundColor: c.background }]}
            numberOfLines={4}
          >
            {error.message}
          </Text>
        )}
        <Pressable
          style={[styles.button, { backgroundColor: c.textPrimary }]}
          onPress={onRestart}
          accessibilityRole="button"
          accessibilityLabel={i18n.t('errorBoundary.restart')}
        >
          <Text style={[styles.buttonText, { color: c.textInverse }]}>
            {i18n.t('errorBoundary.restart')}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    Sentry.captureException(error, {
      contexts: { react: { componentStack: errorInfo.componentStack ?? undefined } },
    })
  }

  handleRestart = async () => {
    try {
      await Updates.reloadAsync()
    } catch {
      // Fallback: reset state so user can try again
      this.setState({ hasError: false, error: null })
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          error={this.state.error}
          onRestart={() => void this.handleRestart()}
        />
      )
    }

    return this.props.children
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: space.lg,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: hairline,
    alignItems: 'center',
    gap: space.sm,
  },
  icon: {
    fontSize: fontSize['3xl'],
    fontFamily: fonts.heading,
    width: 48,
    height: 48,
    lineHeight: 48,
    textAlign: 'center',
    borderRadius: radius.full,
    borderWidth: 2,
    overflow: 'hidden',
  },
  title: {
    fontSize: fontSize.xl,
    fontFamily: fonts.heading,
    textAlign: 'center',
  },
  body: {
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    lineHeight: lineHeight.md,
    textAlign: 'center',
  },
  debug: {
    fontSize: fontSize.xs,
    fontFamily: fonts.data,
    padding: space.sm,
    borderRadius: radius.sm,
    width: '100%',
  },
  button: {
    marginTop: space.sm,
    minHeight: 52,
    width: '100%',
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: fontSize.md,
    fontFamily: fonts.label,
  },
})
