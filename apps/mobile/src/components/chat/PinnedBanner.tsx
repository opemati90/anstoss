import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useClubColors } from '../../context/ClubThemeContext'
import {
  hairline,
  RADIUS_SM,
  SPACING_MD,
  SPACING_SM,
  SPACING_XS,
} from '../../theme/tokens'
import type { ChatMessage } from '../../hooks/useChat'
import { Icon } from '../ui'
import { Text } from '../ui/Text'

type Props = {
  message: ChatMessage
  primaryColor?: string
  onPress?: () => void
}

export function PinnedBanner({ message, primaryColor, onPress }: Props) {
  const c = useClubColors()
  const accentColor = primaryColor || c.primary

  return (
    <Pressable
      style={[
        styles.container,
        { backgroundColor: c.surface, borderBottomColor: c.borderSubtle },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Scroll to pinned message"
    >
      <View style={[styles.accent, { backgroundColor: accentColor }]} />
      <Icon name="pin.fill" size="sm" color={accentColor} />
      <View style={styles.content}>
        <Text variant="caption1" color="primary" weight="medium" numberOfLines={1}>
          {message.senderName}
        </Text>
        <Text variant="caption1" color="secondary" numberOfLines={1}>
          {message.content}
        </Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_SM,
    paddingHorizontal: SPACING_MD,
    paddingVertical: SPACING_SM,
    borderBottomWidth: hairline,
  },
  accent: {
    width: 3,
    height: '100%',
    borderRadius: RADIUS_SM,
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  content: {
    flex: 1,
    marginLeft: SPACING_XS,
  },
})
