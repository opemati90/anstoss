import React, { createContext, useContext, useMemo } from 'react'
import { useAuth } from './AuthContext'
import { buildClubTheme, ClubTheme, FALLBACK_THEME } from '../theme/club-theme'

const ClubThemeContext = createContext<ClubTheme>(FALLBACK_THEME)

export function ClubThemeProvider({ children }: { children: React.ReactNode }) {
  const { activeClub } = useAuth()

  const theme = useMemo(() => {
    if (!activeClub) return FALLBACK_THEME
    return buildClubTheme(
      {
        id: activeClub.club.id,
        name: activeClub.club.name,
        primary: activeClub.club.primaryColor,
        badgeUrl: activeClub.club.badgeUrl,
      },
      false,
    )
  }, [activeClub])

  return (
    <ClubThemeContext.Provider value={theme}>
      {children}
    </ClubThemeContext.Provider>
  )
}

export function useClubColors() {
  return useContext(ClubThemeContext)
}
