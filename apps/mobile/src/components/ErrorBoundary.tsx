import React from 'react'
import { useTranslation } from 'react-i18next'
import { ErrorState } from './ErrorState'

export type ErrorBoundaryProps = {
  onRetry: () => void
  fallbackTitleKey?: string
  fallbackBodyKey?: string
  fallbackRetryKey?: string
  children: React.ReactNode
}

type State = { hasError: boolean; error: Error | null }

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error) {
    if (typeof console !== 'undefined' && console.error) {
      console.error('[ErrorBoundary] caught render error:', error)
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null })
    this.props.onRetry()
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorStateWithKeys
          titleKey={this.props.fallbackTitleKey ?? 'states.common.unknownError'}
          bodyKey={this.props.fallbackBodyKey}
          retryKey={this.props.fallbackRetryKey ?? 'states.common.retry'}
          onRetry={this.handleRetry}
        />
      )
    }
    return this.props.children
  }
}

type KeyProps = {
  titleKey: string
  bodyKey: string | undefined
  retryKey: string
  onRetry: () => void
}

function ErrorStateWithKeys({ titleKey, bodyKey, retryKey, onRetry }: KeyProps) {
  const { t } = useTranslation()
  const title = t(titleKey)
  const body = bodyKey ? t(bodyKey) : undefined
  return (
    <ErrorState
      message={body ? `${title}\n${body}` : title}
      onRetry={onRetry}
      retryLabel={t(retryKey)}
    />
  )
}
