import { Component, type ErrorInfo, type ReactNode } from 'react'
import * as Sentry from '@sentry/react-native'

type Props = {
  children: ReactNode
  /** Rendered instead of the children after a crash; `reset` remounts them. */
  fallback: (error: Error, reset: () => void) => ReactNode
}

type State = { hasError: boolean; error: Error | null; attempt: number }

export class HomeErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, attempt: 0 }

  static getDerivedStateFromError(error: Error): Partial<State> {
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

  reset = () => {
    this.setState((prev) => ({ hasError: false, error: null, attempt: prev.attempt + 1 }))
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return this.props.fallback(this.state.error, this.reset)
    }
    // Keyed so a retry remounts the subtree and refetches from scratch.
    return <Remount key={this.state.attempt}>{this.props.children}</Remount>
  }
}

function Remount({ children }: { children: ReactNode }) {
  return <>{children}</>
}
