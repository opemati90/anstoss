import React from 'react'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { useClubColors } from '../../context/ClubThemeContext'
import { card, hairline, space } from '../../theme/tokens'
import { Text } from './Text'

/**
 * iOS-grouped-inset list wrapper. Drop a set of rows in a single
 * rounded card with hairline dividers between them, matching the
 * visual language of Settings / Apple Music / Health.
 *
 * Example:
 *   <SectionGroup header="Notifications" footer="Tweak how the club reaches you.">
 *     <ListRow title="Events" trailing={<Toggle/>} />
 *     <ListRow title="Chat" trailing={<Toggle/>} />
 *   </SectionGroup>
 */
export interface SectionGroupProps {
  header?: string
  footer?: string
  children: React.ReactNode
  /**
   * When true, omit the eyebrow uppercasing on the header label.
   */
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
    borderColor: c.border,
    borderWidth: hairline,
    borderRadius: card.radius,
    borderCurve: 'continuous',
    overflow: 'hidden',
  }

  return (
    <View style={[styles.wrapper, style]}>
      {header ? (
        <View style={styles.header}>
          <Text
            variant={headerPlain ? 'subheadline' : 'caption2'}
            color="secondary"
            tracking={headerPlain ? 'normal' : 'wide'}
          >
            {headerPlain ? header : header.toUpperCase()}
          </Text>
        </View>
      ) : null}
      <View style={[containerStyle, contentStyle]}>
        {rows.map((row, idx) => (
          <React.Fragment key={idx}>
            {row}
            {idx < rows.length - 1 ? (
              <View
                style={[
                  styles.divider,
                  { backgroundColor: c.border },
                ]}
              />
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
    paddingHorizontal: space.sm,
    paddingTop: space.sm,
    paddingBottom: space.xs,
  },
  footer: {
    paddingHorizontal: space.sm,
    paddingTop: space.xs,
  },
  divider: {
    height: hairline,
    marginLeft: space.md,
  },
})
