import React from 'react'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { useClubColors } from '../../context/ClubThemeContext'
import {
  elevation,
  hairline,
  RADIUS_CARD,
  SPACING_MD,
  SPACING_SM,
  SPACING_XS,
} from '../../theme/tokens'
import { Text } from './Text'

export interface SectionGroupProps {
  header?: string
  footer?: string
  children: React.ReactNode
  headerPlain?: boolean
  style?: StyleProp<ViewStyle>
  contentStyle?: StyleProp<ViewStyle>
}

export function SectionGroup({
  header,
  footer,
  children,
  headerPlain,
  style,
  contentStyle,
}: SectionGroupProps) {
  const c = useClubColors()
  const rows = React.Children.toArray(children).filter(Boolean)

  const containerStyle: ViewStyle = {
    backgroundColor: c.surface,
    borderColor: c.borderDefault,
    borderWidth: hairline,
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
    overflow: 'hidden',
    ...elevation.card,
  }

  return (
    <View style={[styles.wrapper, style]}>
      {header ? (
        <View style={styles.header}>
          <Text
            variant={headerPlain ? 'subheadline' : 'footnote'}
            color="secondary"
            weight={headerPlain ? 'regular' : 'semibold'}
          >
            {header}
          </Text>
        </View>
      ) : null}
      <View style={[containerStyle, contentStyle]}>
        {rows.map((row, idx) => (
          <React.Fragment key={idx}>
            {row}
            {idx < rows.length - 1 ? (
              <View style={[styles.divider, { backgroundColor: c.borderSubtle }]} />
            ) : null}
          </React.Fragment>
        ))}
      </View>
      {footer ? (
        <View style={styles.footer}>
          <Text variant="footnote" color="secondary">
            {footer}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  header: {
    paddingHorizontal: SPACING_SM,
    paddingTop: SPACING_SM,
    paddingBottom: SPACING_XS,
  },
  footer: {
    paddingHorizontal: SPACING_SM,
    paddingTop: SPACING_XS,
  },
  divider: {
    height: hairline,
    marginLeft: SPACING_MD,
  },
})
