import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import * as Application from 'expo-application'
import { randomUUID } from 'expo-crypto'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import { useTranslation } from 'react-i18next'
import {
  createSupportTicketSchema,
  supportReplySchema,
  type SupportTicketDetail,
  type SupportTicketSummary,
} from '@anstoss/shared'
import { api } from '../src/api/client'
import { useAuth } from '../src/context/AuthContext'
import { Button, Card, Screen, Text } from '../src/components/ui'
import { ModalHeader } from '../src/components/ModalHeader'
import { FormInput } from '../src/components/FormInput'
import { SCREEN_PADDING, SPACING_LG, SPACING_SM, SPACING_XXXL } from '../src/theme/tokens'

export default function SupportScreen() {
  const { user } = useAuth()
  // No private support state survives switching users.
  return user ? <SupportContent key={user.id} /> : null
}

function SupportContent() {
  const { t } = useTranslation()
  const [items, setItems] = useState<SupportTicketSummary[]>([])
  const [ticket, setTicket] = useState<SupportTicketDetail | null>(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState('')
  const active = useRef(false)
  const mounted = useRef(true)
  const selectedTicket = useRef<string | undefined>(undefined)
  selectedTicket.current = ticket?.id
  const readSequence = useRef(0)
  const busy = useRef(false)
  const submission = useRef({ key: '', id: '' })

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const load = useCallback(async (id?: string, offset = 0) => {
    const run = ++readSequence.current
    setLoading(true)
    setError('')
    try {
      if (id) {
        const result = await api<SupportTicketDetail>(`/me/support/${encodeURIComponent(id)}`)
        if (active.current && run === readSequence.current) setTicket(result)
      } else {
        const rows = await api<SupportTicketSummary[]>(`/me/support?offset=${offset}`)
        if (active.current && run === readSequence.current) {
          setItems((previous) =>
            offset
              ? [...previous, ...rows.filter((r) => !previous.some((p) => p.id === r.id))]
              : rows,
          )
          setHasMore(rows.length === 50)
        }
      }
    } catch {
      if (active.current && run === readSequence.current) setError('support.error')
    } finally {
      if (active.current && run === readSequence.current) setLoading(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      active.current = true
      void load(selectedTicket.current)
      return () => {
        active.current = false
        readSequence.current += 1
      }
    }, [load]),
  )

  const send = async () => {
    if (busy.current) return
    const key = JSON.stringify([ticket?.id, subject, body])
    if (submission.current.key !== key) submission.current = { key, id: randomUUID() }
    const requestId = submission.current.id
    const input = ticket
      ? supportReplySchema.safeParse({ requestId, body })
      : createSupportTicketSchema.safeParse({
          requestId,
          category: 'OTHER',
          subject,
          body,
          appVersion: Application.nativeApplicationVersion ?? undefined,
          build: Application.nativeBuildVersion ?? undefined,
          platform: Platform.OS,
        })
    if (!input.success) {
      setError('support.invalid')
      return
    }
    busy.current = true
    readSequence.current += 1
    setLoading(false)
    setSaving(true)
    setError('')
    try {
      const result = await api<SupportTicketDetail>(
        ticket ? `/me/support/${ticket.id}/replies` : '/me/support',
        {
          method: 'POST',
          body: input.data,
        },
      )
      if (!mounted.current) return
      setTicket(result)
      setBody('')
      setSubject('')
      submission.current = { key: '', id: '' }
    } catch {
      if (mounted.current) setError('support.error')
    } finally {
      busy.current = false
      if (mounted.current) setSaving(false)
    }
  }

  return (
    <Screen
      padded={false}
      edges={['left', 'right', 'bottom']}
      header={<ModalHeader title={t('support.title')} mode="back" />}
    >
      <KeyboardAwareScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        bottomOffset={SPACING_LG}
      >
        <Text color="secondary">{t('support.intro')}</Text>
        <View style={styles.actions}>
          <Button
            label={t('support.refresh')}
            variant="bordered"
            size="sm"
            disabled={saving || loading}
            onPress={() => void load(ticket?.id)}
          />
          {ticket && (
            <Button
              label={t('support.newRequest')}
              variant="plain"
              size="sm"
              disabled={saving}
              onPress={() => {
                readSequence.current += 1
                setTicket(null)
                setBody('')
                setError('')
                void load()
              }}
            />
          )}
        </View>
        {loading && <ActivityIndicator accessibilityLabel={t('support.refresh')} />}
        {!!error && (
          <Text accessibilityRole="alert" color="error">
            {t(error)}
          </Text>
        )}
        {ticket ? (
          <>
            <Text variant="title3">{ticket.subject}</Text>
            <Text color="secondary">{t(`support.${ticket.status}`)}</Text>
            {ticket.messages.map((message) => (
              <Card key={message.id}>
                <Text weight="semibold">
                  {t(message.fromSupport ? 'support.team' : 'support.you')}
                </Text>
                <Text selectable>{message.body}</Text>
              </Card>
            ))}
          </>
        ) : (
          <FormInput
            label={t('support.subject')}
            value={subject}
            onChangeText={setSubject}
            editable={!saving}
            maxLength={120}
            testID="support-subject"
          />
        )}
        <FormInput
          label={t('support.body')}
          value={body}
          onChangeText={setBody}
          multiline
          numberOfLines={5}
          editable={!saving}
          maxLength={4000}
          testID="support-body"
        />
        {!ticket && (
          <Text variant="caption1" color="secondary">
            {t('support.metadata')}
          </Text>
        )}
        <Button
          label={t(ticket ? 'support.reply' : 'support.send')}
          onPress={() => void send()}
          loading={saving}
          disabled={!body.trim() || (!ticket && subject.trim().length < 3)}
          testID="support-send"
        />
        {!ticket && (
          <>
            <Text variant="title3">{t('support.history')}</Text>
            {!loading && !error && !items.length && (
              <Text color="secondary">{t('support.empty')}</Text>
            )}
            {items.map((item) => (
              <Button
                key={item.id}
                variant="bordered"
                label={`${item.subject} · ${t(`support.${item.status}`)}`}
                disabled={saving || loading}
                onPress={() => {
                  setBody('')
                  void load(item.id)
                }}
              />
            ))}
            {hasMore && (
              <Button
                variant="plain"
                label={t('support.more')}
                disabled={loading || saving}
                onPress={() => void load(undefined, items.length)}
              />
            )}
          </>
        )}
      </KeyboardAwareScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: SCREEN_PADDING, paddingBottom: SPACING_XXXL, gap: SPACING_LG },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING_SM },
})
