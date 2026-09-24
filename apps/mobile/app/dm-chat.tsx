import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Redirect, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { openDirectConversation } from '../src/api/chat'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { ErrorState } from '../src/components/ErrorState'
import { Skeleton } from '../src/components/Skeleton'
import { space } from '../src/theme/tokens'

/**
 * Legacy route kept for push-notification and profile deep links
 * (`/dm-chat?conversationId=` or `/dm-chat?userId=`). It forwards to the
 * unified conversation screen at /chat/[id].
 */
export default function DmChatRedirect() {
  const params = useLocalSearchParams<{ conversationId?: string; userId?: string; userName?: string }>()
  const { t } = useTranslation()
  const c = useClubColors()
  const { activeClub } = useAuth()
  const clubId = activeClub?.club.id ?? null
  const [resolvedId, setResolvedId] = useState<string | null>(params.conversationId ?? null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (resolvedId || !params.userId || !clubId) return
    let cancelled = false
    openDirectConversation(clubId, params.userId)
      .then((res) => {
        if (!cancelled && res?.id) setResolvedId(res.id)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [attempt, clubId, params.userId, resolvedId])

  if (resolvedId) {
    return (
      <Redirect
        href={
          {
            pathname: '/chat/[id]',
            params: { id: resolvedId, kind: 'dm', ...(params.userName ? { title: params.userName } : {}) },
          } as never
        }
      />
    )
  }
  if (!params.userId) return <Redirect href={'/(tabs)/chat' as never} />

  return (
    <View style={[styles.fill, { backgroundColor: c.background }]}>
      {failed ? (
        <ErrorState
          message={t('chatHub.errors.openFailed')}
          hint={t('chatHub.new.restricted')}
          onRetry={() => {
            setFailed(false)
            setAttempt((n) => n + 1)
          }}
          fillContainer
        />
      ) : (
        <View style={styles.skeleton}>
          <Skeleton width="60%" height={20} />
          <Skeleton width="40%" height={16} />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  skeleton: { padding: space.lg, gap: space.sm, paddingTop: space['3xl'] },
})
