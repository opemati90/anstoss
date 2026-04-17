import React, { useMemo, useRef } from 'react'
import {
  Animated,
  StatusBar,
  StyleSheet,
  View,
  type ScrollViewProps,
  type ViewStyle,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useClubColors, useIsDark } from '../../context/ClubThemeContext'
import {
  TAB_BAR_CLEARANCE,
  elevation,
  hairline,
  SCREEN_PADDING,
  SPACING_SM,
  SPACING_XS,
  SPACING_MD,
} from '../../theme/tokens'
import { IconButton } from './IconButton'
import { Text } from './Text'
import { Icon, type IconName } from './Icon'

export interface ScreenTrailingAction {
  icon: IconName
  onPress: () => void
  accessibilityLabel: string
  testID?: string
}

export interface ScreenLeadingSlot {
  onPress?: () => void
  content: React.ReactNode
  accessibilityLabel?: string
}

export interface ScreenProps {
  children: React.ReactNode
  /**
   * Deprecated: pass `largeTitle` / `leading` / `trailing` for the new
   * scroll-collapsing nav bar. Still supported for screens that haven't
   * been migrated yet.
   */
  header?: React.ReactNode
  scroll?: boolean
  padded?: boolean
  tabBarClearance?: boolean
  edges?: Array<'top' | 'bottom' | 'left' | 'right'>
  contentStyle?: ViewStyle
  style?: ViewStyle

  /**
   * Large title rendered at the top of the content, collapses into a
   * compact inline title in the sticky nav bar when the user scrolls.
   * Pairs with `scroll: true` for the collapse effect.
   */
  largeTitle?: string
  /**
   * Subtitle / eyebrow label rendered above the large title (optional).
   * Often used for a greeting, date, or section context.
   */
  eyebrow?: string
  /**
   * Body row rendered below the large title inside the hero band.
   * Use this for stat chips, filter bars, etc.
   */
  heroBelow?: React.ReactNode
  /**
   * Trailing nav-bar action (icon). Appears in both expanded and
   * compact states.
   */
  trailing?: ScreenTrailingAction | ScreenTrailingAction[]
  /**
   * Leading nav-bar slot (club badge, back button, etc.). If omitted
   * the slot is empty.
   */
  leading?: ScreenLeadingSlot
  /**
   * Pull-to-refresh control. Passed through to the underlying ScrollView.
   */
  refreshControl?: ScrollViewProps['refreshControl']
  /**
   * Called when the user scrolls. Useful for parent screens that need
   * to track scroll position without owning the ScrollView.
   */
  onScroll?: ScrollViewProps['onScroll']
}

const LARGE_TITLE_HEIGHT = 54 // large title block height
const COMPACT_NAV_HEIGHT = 44 // iOS nav bar compact height

export function Screen({
  children,
  header,
  scroll,
  padded = true,
  tabBarClearance,
  edges = ['top', 'left', 'right'],
  contentStyle,
  style,
  largeTitle,
  eyebrow,
  heroBelow,
  trailing,
  leading,
  refreshControl,
  onScroll,
}: ScreenProps) {
  const c = useClubColors()
  const isDark = useIsDark()
  const scrollY = useRef(new Animated.Value(0)).current

  const hasLargeTitle = !!largeTitle

  // Compact title fades/slides in when the user scrolls past ~half the
  // large title block. The large title itself scrolls off with content.
  const compactTitleOpacity = scrollY.interpolate({
    inputRange: [LARGE_TITLE_HEIGHT * 0.5, LARGE_TITLE_HEIGHT * 0.9],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  })
  const compactTitleTranslate = scrollY.interpolate({
    inputRange: [LARGE_TITLE_HEIGHT * 0.5, LARGE_TITLE_HEIGHT * 0.9],
    outputRange: [8, 0],
    extrapolate: 'clamp',
  })
  const navBarBgOpacity = scrollY.interpolate({
    inputRange: [0, LARGE_TITLE_HEIGHT * 0.5, LARGE_TITLE_HEIGHT],
    outputRange: [0, 0, 1],
    extrapolate: 'clamp',
  })
  const navBarBorderOpacity = scrollY.interpolate({
    inputRange: [LARGE_TITLE_HEIGHT * 0.8, LARGE_TITLE_HEIGHT],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  })

  const innerStyle: ViewStyle = useMemo(
    () => ({
      flexGrow: 1,
      paddingHorizontal: padded ? SCREEN_PADDING : 0,
      paddingTop: hasLargeTitle ? 0 : padded ? SPACING_MD : 0,
      paddingBottom: tabBarClearance ? TAB_BAR_CLEARANCE + SPACING_MD : padded ? SPACING_MD : 0,
    }),
    [padded, tabBarClearance, hasLargeTitle],
  )

  const handleScroll = Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
    useNativeDriver: false,
    listener: onScroll,
  })

  const trailingActions = Array.isArray(trailing) ? trailing : trailing ? [trailing] : []

  const largeTitleBlock = hasLargeTitle ? (
    <View style={[styles.largeTitleBlock, { paddingHorizontal: padded ? SCREEN_PADDING : 0 }]}>
      {eyebrow ? (
        <Text variant="caption2" color="secondary" tracking="wide">
          {eyebrow.toUpperCase()}
        </Text>
      ) : null}
      <Text variant="largeTitle" color="primary" numberOfLines={2}>
        {largeTitle}
      </Text>
      {heroBelow ? <View style={styles.heroBelow}>{heroBelow}</View> : null}
    </View>
  ) : null

  const navBarBg = isDark ? c.background : c.surface

  const body = scroll ? (
    <Animated.ScrollView
      contentContainerStyle={[innerStyle, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      onScroll={handleScroll}
      scrollEventThrottle={16}
      refreshControl={refreshControl}
    >
      {largeTitleBlock}
      {children}
    </Animated.ScrollView>
  ) : (
    <View style={[innerStyle, contentStyle]}>
      {largeTitleBlock}
      {children}
    </View>
  )

  return (
    <SafeAreaView edges={edges} style={[styles.safe, { backgroundColor: c.background }, style]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Legacy header slot — rendered untouched for pre-migration screens */}
      {header}

      {/* New sticky nav bar (only when largeTitle is in play) */}
      {hasLargeTitle ? (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.navBar,
            {
              borderBottomColor: c.borderSubtle,
              backgroundColor: navBarBg,
              // Background fades in when scrolling under
              opacity: 1,
            },
          ]}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFillObject,
              {
                backgroundColor: navBarBg,
                opacity: navBarBgOpacity,
              },
            ]}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.navBarHairline,
              {
                backgroundColor: c.borderSubtle,
                opacity: navBarBorderOpacity,
              },
            ]}
          />
          <View style={styles.navBarRow}>
            <View style={styles.navBarLeading}>{leading?.content ?? null}</View>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.navBarTitleWrapper,
                {
                  opacity: compactTitleOpacity,
                  transform: [{ translateY: compactTitleTranslate }],
                },
              ]}
            >
              <Text variant="headline" color="primary" align="center" numberOfLines={1}>
                {largeTitle}
              </Text>
            </Animated.View>
            <View style={styles.navBarTrailing}>
              {trailingActions.map((action, idx) => (
                <IconButton
                  key={`${action.icon}-${idx}`}
                  onPress={action.onPress}
                  accessibilityLabel={action.accessibilityLabel}
                  testID={action.testID}
                >
                  <Icon name={action.icon} size="lg" color="primary" />
                </IconButton>
              ))}
            </View>
          </View>
        </Animated.View>
      ) : null}

      {body}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  navBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 10,
    height: COMPACT_NAV_HEIGHT,
    justifyContent: 'flex-end',
    ...elevation.flat,
  },
  navBarRow: {
    height: COMPACT_NAV_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SCREEN_PADDING,
  },
  navBarLeading: {
    minWidth: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  navBarTrailing: {
    minWidth: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: SPACING_XS,
  },
  navBarTitleWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBarHairline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: hairline,
  },
  largeTitleBlock: {
    paddingTop: COMPACT_NAV_HEIGHT + SPACING_SM,
    paddingBottom: SPACING_MD,
    gap: SPACING_XS,
  },
  heroBelow: {
    marginTop: SPACING_SM,
  },
})
