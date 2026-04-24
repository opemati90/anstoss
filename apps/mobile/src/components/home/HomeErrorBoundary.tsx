import { Component, type ErrorInfo, type ReactNode } from 'react'
import * as Sentry from '@sentry/react-native'

type Props = {
  children: ReactNode
  fallback: (error: Error) => ReactNode
}

type State = { hasError: boolean; error: Error | null }

export class HomeErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    Sentry.captureException(error, {
      tags: { feature: 'role-aware-home' },
      contexts: {
        react: { componentStack: info.componentStack ?? undefined },
      },
    })
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return this.props.fallback(this.state.error)
    }
    return this.props.children
  }
}
