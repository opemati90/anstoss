import { useEffect } from 'react'
import { router, useLocalSearchParams } from 'expo-router'
import { View } from 'react-native'
import { Screen } from '../src/components/ui'

export default function JoinClubRedirect() {
  const params = useLocalSearchParams<{ slug?: string | string[] }>()
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug

  useEffect(() => {
    if (slug && slug.trim().length > 0) {
      router.replace(`/club/${slug.trim().toLowerCase()}`)
    } else {
      router.replace('/find-club')
    }
  }, [slug])

  return (
    <Screen>
      <View />
    </Screen>
  )
}
