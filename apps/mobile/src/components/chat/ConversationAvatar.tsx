import { Image, StyleSheet, View } from 'react-native'
import type { ChannelKind } from '@anstoss/shared'
import { useClubColors } from '../../context/ClubThemeContext'
import { Avatar, Icon, type IconName } from '../ui'

type Props = {
  kind: ChannelKind | 'DM'
  /** Club-level channel (teamId null)? The staff room reads as the board. */
  clubLevel?: boolean
  name: string
  avatarUrl?: string | null
  /** Club crest, used for the team channel so it reads as "us". */
  crestUrl?: string | null
  size?: number
}

const KIND_ICON: Record<ChannelKind, IconName> = {
  TEAM: 'person.3.fill',
  ANNOUNCEMENTS: 'megaphone.fill',
  CLUB_NEWS: 'newspaper.fill',
  COACHES: 'whistle',
  PARENTS: 'figure.and.child.holdinghands',
  CUSTOM: 'person.2.fill',
}

/**
 * Leading visual of a conversation. People are round (initials or photo);
 * channels are continuous-rounded tiles so a group never looks like a
 * person. Only the team channel carries the club colour / crest.
 */
export function ConversationAvatar({
  kind,
  clubLevel = false,
  name,
  avatarUrl,
  crestUrl,
  size = 48,
}: Props) {
  const c = useClubColors()
  if (kind === 'DM') {
    return (
      <Avatar size={size} src={avatarUrl} fallbackText={name} tone="neutral" />
    )
  }
  const tile = {
    width: size,
    height: size,
    borderRadius: Math.round(size * 0.28),
  }
  if (kind === 'TEAM' && crestUrl) {
    // Crest on a soft wash of the club colour so the team channel reads as
    // "us" at a glance, in light and dark.
    return (
      <View style={[styles.tile, tile, { backgroundColor: c.primary50, borderColor: c.primary }]}>
        <Image source={{ uri: crestUrl }} style={{ width: size * 0.7, height: size * 0.7 }} resizeMode="contain" />
      </View>
    )
  }
  const isTeam = kind === 'TEAM'
  const icon = kind === 'COACHES' && clubLevel ? 'building.2.fill' : KIND_ICON[kind]
  return (
    <View
      style={[
        styles.tile,
        tile,
        {
          backgroundColor: isTeam ? c.primary : c.surfaceSunken,
          borderColor: isTeam ? c.primary : c.borderSubtle,
        },
      ]}
    >
      <Icon name={icon} size={Math.round(size * 0.46)} color={isTeam ? c.textInverse : c.textSecondary} />
    </View>
  )
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
})
