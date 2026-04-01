import { Component, type ReactNode } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import * as Updates from 'expo-updates'
import * as Sentry from '@sentry/react-native'
import i18n from '../i18n'
import { neutralColors, semanticColors, fontSize, fontWeight, space, radius, fonts, lineHeight } from '../theme/tokens'

type Props = {
  children: ReactNode
}

type State = {
  hasError: boolean
  error: Error | null
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
        <View style={styles.container}>
          <View style={styles.card}>
            <Text style={styles.icon}>!</Text>
            <Text style={styles.title}>{i18n.t('errorBoundary.title')}</Text>
            <Text style={styles.body}>
              {i18n.t('errorBoundary.body')}
            </Text>
            {__DEV__ && this.state.error && (
              <Text style={styles.debug} numberOfLines={4}>
                {this.state.error.message}
              </Text>
            )}
            <TouchableOpacity
              style={styles.button}
              onPress={() => void this.handleRestart()}
              accessibilityRole="button"
              accessibilityLabel={i18n.t('errorBoundary.restart')}
            >
              <Text style={styles.buttonText}>{i18n.t('errorBoundary.restart')}</Text>
            </TouchableOpacity>
          </View>
        </View>
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
    backgroundColor: neutralColors.background,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: neutralColors.surface,
    borderWidth: 1,
    borderColor: neutralColors.border,
    alignItems: 'center',
    gap: space.sm,
  },
  icon: {
    fontSize: fontSize['3xl'],
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: semanticColors.error,
    width: 48,
    height: 48,
    lineHeight: 48,
    textAlign: 'center',
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: semanticColors.error,
    overflow: 'hidden',
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
    textAlign: 'center',
  },
  body: {
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    lineHeight: lineHeight.md,
    color: neutralColors.textSecondary,
    textAlign: 'center',
  },
  debug: {
    fontSize: fontSize.xs,
    fontFamily: fonts.data,
    color: semanticColors.error,
    backgroundColor: neutralColors.background,
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
    backgroundColor: neutralColors.textPrimary,
  },
  buttonText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.label,
    color: neutralColors.textInverse,
  },
})
