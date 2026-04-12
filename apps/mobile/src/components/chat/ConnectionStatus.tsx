import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { ConnectionState } from '../../hooks/useChat'
import { useClubColors } from '../../context/ClubThemeContext'
import { fontSize, fonts, space } from '../../theme/tokens'

type Props = {
  state: ConnectionState
}

export function ConnectionStatus({ state }: Props) {
  const { t } = useTranslation()
  const c = useClubColors()

  if (state === 'connected') return null

  const isReconnecting = state === 'reconnecting'

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: isReconnecting ? c.warning : c.error },
      ]}
    >
      <Text style={[styles.text, { color: c.textInverse }]}>
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
    fontSize: fontSize.xs,
    fontFamily: fonts.label,
  },
})
