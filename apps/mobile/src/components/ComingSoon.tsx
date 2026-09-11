import { useTranslation } from 'react-i18next'
import { router } from 'expo-router'
import { Screen } from './ui'
import { EmptyState } from './EmptyState'
import { ModalHeader } from './ModalHeader'
import type { IconName } from './ui'

type Props = {
  /** Already-localized screen title for the header. */
  title?: string
  /**
   * i18n key for the header title, translated here. Preferred over `title`:
   * these screens are gated behind a feature flag and sit outside any
   * component holding `useTranslation`, which is how three of them ended up
   * shipping a hardcoded English (and one German) header to every locale.
   */
  titleKey?: string
  icon?: IconName
}

/**
 * Placeholder shown for features that are gated out of MVP via the
 * `anstoss.experimentalFeatures` flag (see featureFlags.ts). Screens whose
 * functionality is still a prototype render this instead of half-working UI, so
 * a deep-link or stale entry point lands somewhere coherent rather than on a
 * mock.
 */
export function ComingSoon({ title, titleKey, icon = 'clock.fill' }: Props) {
  const { t } = useTranslation()
  const headerTitle = titleKey ? t(titleKey) : title
  return (
    <Screen
      scroll={false}
      padded
      header={<ModalHeader mode="back" title={headerTitle} onClose={() => router.back()} />}
    >
      <EmptyState
        icon={icon}
        title={t('common.comingSoonTitle', { defaultValue: 'Coming soon' })}
        description={t('common.comingSoonBody', {
          defaultValue: 'This feature isn’t ready yet. We’re putting the finishing touches on it.',
        })}
      />
    </Screen>
  )
}
