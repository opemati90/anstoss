import { Component, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import * as Updates from 'expo-updates'
import * as Sentry from '@sentry/react-native'
import i18n from '../i18n'
import { useClubColors } from '../context/ClubThemeContext'
import { Button } from './ui/Button'
import { Text } from './ui/Text'
import {
  FONT_FAMILY_REGULAR,
  FONT_SIZE_CAPTION,
  hairline,
  RADIUS_CARD,
  RADIUS_FULL,
  RADIUS_SM,
  SPACING_LG,
  SPACING_SM,
  SPACING_XS,
} from '../theme/tokens'

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
            borderColor: c.borderDefault,
          },
        ]}
      >
        <View
          style={[
            styles.iconBadge,
            {
              borderColor: c.error,
            },
          ]}
        >
          <Text variant="title1" weight="bold" style={{ color: c.error }}>
            !
          </Text>
        </View>
        <Text variant="title2" color="primary" align="center">
          {i18n.t('errorBoundary.title')}
        </Text>
        <Text variant="body" color="secondary" align="center">
          {i18n.t('errorBoundary.body')}
        </Text>
        {__DEV__ && error && (
          <Text
            style={[
              styles.debug,
              { color: c.error, backgroundColor: c.surfaceSunken },
            ]}
            numberOfLines={4}
          >
            {error.message}
          </Text>
        )}
        <Button
          label={i18n.t('errorBoundary.restart')}
          onPress={onRestart}
          variant="filled"
          size="md"
          style={styles.button}
        />
      </View>
    </View>
  )
}

export class AppErrorBoundary extends Component<Props, State> {
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
    padding: SPACING_LG,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    padding: SPACING_LG,
    borderRadius: RADIUS_CARD,
    borderWidth: hairline,
    alignItems: 'center',
    gap: SPACING_SM,
  },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: RADIUS_FULL,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING_XS,
  },
  debug: {
    fontSize: FONT_SIZE_CAPTION,
    fontFamily: FONT_FAMILY_REGULAR,
    padding: SPACING_SM,
    borderRadius: RADIUS_SM,
    width: '100%',
  },
  button: {
    marginTop: SPACING_SM,
    width: '100%',
  },
})
