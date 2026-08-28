import React from 'react'
import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsetsSafe } from '../utils/useSafeAreaInsetsSafe'
import { SPACING_MD, SPACING_SM } from '../theme/tokens'
import { Banner } from './ui/Banner'

interface ReleaseNoticesProps {
  announcement?: string
  softUpdate: boolean
  recommendedVersion?: string
  onOpenStore: () => void
  onDismissAnnouncement: () => void
  onDismissSoftUpdate: () => void
}

export function ReleaseNotices({
  announcement,
  softUpdate,
  recommendedVersion,
  onOpenStore,
  onDismissAnnouncement,
  onDismissSoftUpdate,
}: ReleaseNoticesProps) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsetsSafe()
  if (!announcement && !softUpdate) return null

  return (
    <View
      pointerEvents="box-none"
      style={[styles.container, { top: insets.top + SPACING_SM }]}
    >
      {announcement ? (
        <Banner
          tone="info"
          title={announcement}
          onDismiss={onDismissAnnouncement}
          testID="release-announcement"
        />
      ) : null}
      {softUpdate ? (
        <Banner
          tone="tint"
          title={t('update.available')}
          description={t('update.availableBody', {
            version: recommendedVersion || '—',
          })}
          action={{ label: t('update.openStore'), onPress: onOpenStore }}
          onDismiss={onDismissSoftUpdate}
          testID="soft-update-banner"
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: SPACING_MD,
    right: SPACING_MD,
    zIndex: 1000,
    gap: SPACING_SM,
  },
})
