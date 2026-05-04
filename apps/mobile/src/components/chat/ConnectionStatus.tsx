import React from 'react'
import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { ConnectionState } from '../../hooks/useChat'
import { useClubColors } from '../../context/ClubThemeContext'
import { getE2ESession } from '../../e2e/session'
import { Text } from '../ui/Text'
import { SPACING_MD, SPACING_XS } from '../../theme/tokens'

type Props = {
  state: ConnectionState
}

export function ConnectionStatus({ state }: Props) {
  const { t } = useTranslation()
  const c = useClubColors()

  if (state === 'connected') return null
  // Mock-backend mode has no Socket.io server; the banner adds noise to
  // every chat screen during testing. Treat the socket as connected.
  if (getE2ESession()) return null

  const isReconnecting = state === 'reconnecting'

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: isReconnecting ? c.warning : c.error },
      ]}
    >
      <Text variant="caption1" color="inverse" weight="medium">
        {isReconnecting ? t('chat.reconnecting') : t('chat.offline')}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    paddingVertical: SPACING_XS,
    paddingHorizontal: SPACING_MD,
    alignItems: 'center',
  },
})
