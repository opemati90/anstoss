import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { fontSize, neutralColors, space } from '../../theme/tokens'

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
      <Text style={styles.text}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  text: {
    fontSize: fontSize.xs,
    color: neutralColors.textTertiary,
    fontStyle: 'italic',
  },
})
