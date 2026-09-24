import { Redirect, useLocalSearchParams } from 'expo-router'

/**
 * Legacy entry point (More tab, club switcher, public club page, deep link
 * `anstoss://club-setup?clubName=…&directoryEntryId=…`). The merged club
 * setup form lives in the onboarding group.
 */
export default function ClubSetupRedirect() {
  const params = useLocalSearchParams<{ clubName?: string; directoryEntryId?: string }>()
  const clubName = Array.isArray(params.clubName) ? params.clubName[0] : params.clubName
  const directoryEntryId = Array.isArray(params.directoryEntryId)
    ? params.directoryEntryId[0]
    : params.directoryEntryId
  return (
    <Redirect
      href={{
        pathname: '/(auth)/club-setup',
        params: {
          ...(clubName ? { clubName } : {}),
          ...(directoryEntryId ? { directoryEntryId } : {}),
        },
      }}
    />
  )
}
