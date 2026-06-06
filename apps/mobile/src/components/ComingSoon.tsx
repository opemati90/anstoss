import { useTranslation } from 'react-i18next'
import { router } from 'expo-router'
import { Screen } from './ui'
import { EmptyState } from './EmptyState'
import { ModalHeader } from './ModalHeader'
import type { IconName } from './ui'

type Props = {
  /** Localized screen title for the header. */
  title?: string
  icon?: IconName
}

/**
 * Placeholder shown for features that are gated out of MVP via the
 * `anstoss.experimentalFeatures` flag (see featureFlags.ts). Screens whose
 * functionality is still a prototype render this instead of half-working UI, so
 * a deep-link or stale entry point lands somewhere coherent rather than on a
 * mock.
 */
export function ComingSoon({ title, icon = 'clock.fill' }: Props) {
  const { t } = useTranslation()
  return (
    <Screen
      scroll={false}
      padded
      header={<ModalHeader mode="back" title={title} onClose={() => router.back()} />}
    >
      <EmptyState
        icon={icon}
        title={t('common.comingSoonTitle', { defaultValue: 'Coming soon' })}
        description={t('common.comingSoonBody', {
          defaultValue: 'This feature isn’t ready yet — we’re putting the finishing touches on it.',
        })}
      />
    </Screen>
  )
}
