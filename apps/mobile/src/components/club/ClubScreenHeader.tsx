import React from 'react'
import { StyleSheet, View } from 'react-native'
import { router, type Href } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Icon, IconButton, Text } from '../ui'
import { goBackOrReplace } from '../../utils/navigation'
import { SPACING_MD, SPACING_XXS } from '../../theme/tokens'

export interface ClubScreenHeaderProps {
  title: string
  subtitle?: string
  /** Where back goes when there is no history (deep link, cold start). */
  fallbackHref?: Href
  onBack?: () => void
  /** Title size: 26 for money screens, 24 when a subtitle sits under it. */
  titleSize?: number
  right?: React.ReactNode
}

/**
 * Redesign push-screen header: the 44pt outlined back circle (`.ib`), then a
 * bold Inter title (`.h1` at 24–26pt) with an optional muted subtitle and an
 * optional trailing slot. Scrolls with the content, like the artboards.
 */
export function ClubScreenHeader({
  title,
  subtitle,
  fallbackHref = '/',
  onBack,
  titleSize = 26,
  right,
}: ClubScreenHeaderProps) {
  const { t } = useTranslation()
  return (
    <View style={styles.row}>
      <IconButton
        variant="outlined"
        accessibilityLabel={t('common.back')}
        onPress={onBack ?? (() => goBackOrReplace(router, fallbackHref))}
        testID="club-header-back"
      >
        <Icon name="chevron.left" size="md" color="primary" />
      </IconButton>
      <View style={styles.titles}>
        <Text
          variant="title1"
          weight="bold"
          color="primary"
          accessibilityRole="header"
          numberOfLines={1}
          style={{ fontSize: titleSize, lineHeight: Math.round(titleSize * 1.15) }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption1" color="secondary" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING_MD },
  titles: { flex: 1, minWidth: 0, gap: SPACING_XXS },
})
