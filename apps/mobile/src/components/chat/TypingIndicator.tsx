import React from 'react'
import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Text } from '../ui/Text'
import { SPACING_MD, SPACING_XS } from '../../theme/tokens'

type Props = {
  users: string[]
}

export function TypingIndicator({ users }: Props) {
  const { t } = useTranslation()

  if (users.length === 0) return null

  const label =
    users.length === 1
      ? t('chat.typing', { name: users[0] })
      : t('chat.typingMultiple', { count: users.length })

  return (
    <View style={styles.container}>
      <Text variant="caption1" color="tertiary" style={styles.text}>
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: SPACING_MD,
    paddingVertical: SPACING_XS,
  },
  text: {
    fontStyle: 'italic',
  },
})
