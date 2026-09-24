import { Redirect, useLocalSearchParams } from 'expo-router'

/**
 * Kader revamp: the league table lives on Spiele & Tabelle now. This route
 * stays so existing links (match detail's "Tabelle anzeigen") keep working.
 */
export default function LeagueTableRedirect() {
  const { teamId } = useLocalSearchParams<{ teamId?: string }>()
  return (
    <Redirect
      href={{
        pathname: '/team-spiele',
        params: teamId ? { tab: 'tabelle', teamId } : { tab: 'tabelle' },
      }}
    />
  )
}
