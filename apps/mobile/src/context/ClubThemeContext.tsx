import React, { createContext, useContext, useMemo } from 'react'
import { useColorScheme } from 'react-native'
import { useAuth } from './AuthContext'
import {
  buildClubTheme,
  ClubTheme,
  FALLBACK_THEME,
  FALLBACK_THEME_DARK,
} from '../theme/club-theme'

interface ClubThemeContextValue {
  theme: ClubTheme
  isDark: boolean
}

const defaultValue: ClubThemeContextValue = {
  theme: FALLBACK_THEME,
  isDark: false,
}

const ClubThemeContext = createContext<ClubThemeContextValue>(defaultValue)

export function ClubThemeProvider({ children }: { children: React.ReactNode }) {
  const { activeClub } = useAuth()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  const theme = useMemo(() => {
    if (!activeClub) return isDark ? FALLBACK_THEME_DARK : FALLBACK_THEME
    return buildClubTheme(
      {
        id: activeClub.club.id,
        name: activeClub.club.name,
        primary: activeClub.club.primaryColor,
        badgeUrl: activeClub.club.badgeUrl,
      },
      isDark,
    )
  }, [activeClub, isDark])

  const value = useMemo(() => ({ theme, isDark }), [theme, isDark])

  return (
    <ClubThemeContext.Provider value={value}>
      {children}
    </ClubThemeContext.Provider>
  )
}

// ── onboarding revamp: preview a club's colour before the user is a member.
/**
 * Re-themes its subtree with a club that is known but not joined yet (an
 * invite, a search result, a team-code match), so the accent switches from
 * pitch green to the club colour the moment the club is known. Passing no
 * colour keeps the surrounding theme.
 */
export function ClubThemeOverride({
  club,
  children,
}: {
  club: { id?: string; name?: string; primaryColor?: string | null; badgeUrl?: string | null } | null
  children: React.ReactNode
}) {
  const parent = useContext(ClubThemeContext)
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'
  const primary = club?.primaryColor ?? null
  const value = useMemo(() => {
    if (!primary || !/^#[0-9A-Fa-f]{6}$/.test(primary)) return parent
    return {
      theme: buildClubTheme(
        {
          id: club?.id ?? 'preview',
          name: club?.name ?? '',
          primary,
          badgeUrl: club?.badgeUrl ?? null,
        },
        isDark,
      ),
      isDark,
    }
  }, [club?.badgeUrl, club?.id, club?.name, isDark, parent, primary])
  return <ClubThemeContext.Provider value={value}>{children}</ClubThemeContext.Provider>
}
// ── end onboarding revamp ──

/**
 * Primary color hook — returns the full ClubTheme object.
 * Name kept for backward compatibility (legacy code calls it "colors").
 */
export function useClubColors(): ClubTheme {
  return useContext(ClubThemeContext).theme
}

/**
 * Returns the full theme context (theme + isDark flag).
 * Use this when you need to branch on dark mode or apply conditional
 * surface materials / blur tints.
 */
export function useClubTheme(): ClubThemeContextValue {
  return useContext(ClubThemeContext)
}

/**
 * Returns just the isDark boolean. Respects the system color scheme.
 */
export function useIsDark(): boolean {
  return useContext(ClubThemeContext).isDark
}
