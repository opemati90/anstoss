import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { ConnectionState } from '../../hooks/useChat'
import { fontSize, semanticColors, space } from '../../theme/tokens'

type Props = {
  state: ConnectionState
}

export function ConnectionStatus({ state }: Props) {
  const { t } = useTranslation()

  if (state === 'connected') return null

  const isReconnecting = state === 'reconnecting'

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: isReconnecting ? semanticColors.warning : semanticColors.error },
      ]}
    >
      <Text style={styles.text}>
        {isReconnecting ? t('chat.reconnecting') : t('chat.offline')}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    paddingVertical: space.xs,
    paddingHorizontal: space.md,
    alignItems: 'center',
  },
  text: {
    color: '#FFFFFF',
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
})
