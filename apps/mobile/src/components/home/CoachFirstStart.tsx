import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { api } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useClubColors } from '../../context/ClubThemeContext'
import { Icon, PressableScale, Text } from '../ui'
import { RADIUS_FULL, SPACING_MD, SPACING_XXS, hairline, space } from '../../theme/tokens'
import { HomeCard } from './HomeKit'

type Step = {
  key: string
  title: string
  detail: string
  done: boolean
  route?: string
}

/**
 * First start for a coach (redesign screen 26): nobody in the squad and
 * nothing planned yet. A short welcome, a progress bar, and the four steps
 * that move the team out of WhatsApp. Each open step links to the flow that
 * completes it; done steps are struck through.
 */
export function CoachFirstStart({ teamId }: { teamId: string }) {
  const c = useClubColors()
  const { t } = useTranslation()
  const { activeClub } = useAuth()
  const [fussballLinked, setFussballLinked] = useState(false)

  useEffect(() => {
    let alive = true
    api<unknown[]>(`/integrations/fussball/team-links?teamId=${teamId}`)
      .then((links) => {
        if (alive) setFussballLinked(Array.isArray(links) && links.length > 0)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [teamId])

  const steps: Step[] = [
    {
      key: 'club',
      title: t('homeHub.firstStart.clubDone', { defaultValue: 'Club created' }),
      detail: activeClub?.club.name ?? '',
      done: true,
    },
    {
      key: 'invite',
      title: t('homeHub.firstStart.invite', { defaultValue: 'Invite your team' }),
      detail: t('homeHub.firstStart.inviteBody', { defaultValue: 'Share the code or import the squad' }),
      done: false,
      route: '/invite',
    },
    {
      key: 'event',
      title: t('homeHub.firstStart.event', { defaultValue: 'Create the first event' }),
      detail: t('homeHub.firstStart.eventBody', { defaultValue: 'Training or match' }),
      done: false,
      route: '/create-event',
    },
    {
      key: 'fussball',
      title: t('homeHub.firstStart.fussball', { defaultValue: 'Connect fussball.de' }),
      detail: t('homeHub.firstStart.fussballBody', { defaultValue: 'Fixtures and table automatically' }),
      done: fussballLinked,
      route: '/fussball-link',
    },
  ]
  const doneCount = steps.filter((step) => step.done).length

  return (
    <View style={styles.root} testID="coach-first-start">
      <View style={styles.intro}>
        <Text variant="title2" weight="bold" color="primary" accessibilityRole="header">
          {t('homeHub.firstStart.title', { defaultValue: 'Welcome, coach.' })}
        </Text>
        <Text variant="subheadline" color="secondary" style={styles.lead}>
          {t('homeHub.firstStart.body', {
            defaultValue: 'Three steps and your team runs here instead of in WhatsApp.',
          })}
        </Text>
      </View>

      <View style={styles.progress}>
        <View style={styles.progressHead}>
          <Text variant="label">{t('homeHub.firstStart.setup', { defaultValue: 'Setup' })}</Text>
          <Text variant="footnote" weight="semibold" color="primary">
            {t('homeHub.firstStart.progress', {
              defaultValue: '{{done}} of {{total}}',
              done: doneCount,
              total: steps.length,
            })}
          </Text>
        </View>
        <View
          style={styles.bar}
          accessible
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: steps.length, now: doneCount }}
        >
          <View style={{ flex: doneCount, backgroundColor: c.ink }} />
          <View style={{ flex: steps.length - doneCount, backgroundColor: c.surfaceSunken }} />
        </View>
      </View>

      <HomeCard>
        {steps.map((step, index) => {
          const body = (
            <>
              <View
                style={[
                  styles.marker,
                  step.done
                    ? { backgroundColor: c.ink }
                    : { borderWidth: 1.5, borderColor: c.borderStrong },
                ]}
              >
                {step.done ? (
                  <Icon name="checkmark" size={16} color={c.onInk} />
                ) : (
                  <Text variant="data" color="secondary" style={styles.markerNumber}>
                    {String(index + 1)}
                  </Text>
                )}
              </View>
              <View style={styles.stepText}>
                <Text
                  variant="subheadline"
                  weight="semibold"
                  color={step.done ? 'secondary' : 'primary'}
                  style={[styles.stepTitle, step.done ? styles.struck : {}]}
                >
                  {step.title}
                </Text>
                {step.detail ? (
                  <Text variant="footnote" color="secondary">
                    {step.detail}
                  </Text>
                ) : null}
              </View>
              {step.route && !step.done ? (
                <Icon name="chevron.right" size={16} color="secondary" />
              ) : null}
            </>
          )
          const rowStyle = [
            styles.row,
            index > 0 ? { borderTopWidth: hairline, borderTopColor: c.borderSubtle } : null,
          ]
          if (!step.route || step.done) {
            return (
              <View
                key={step.key}
                style={rowStyle}
                accessible
                accessibilityState={{ checked: step.done }}
              >
                {body}
              </View>
            )
          }
          const route = step.route
          return (
            <PressableScale
              key={step.key}
              onPress={() => router.push(route as never)}
              accessibilityRole="button"
              accessibilityLabel={`${step.title}, ${step.detail}`}
              haptic="tapLight"
              style={rowStyle}
            >
              {body}
            </PressableScale>
          )
        })}
      </HomeCard>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: space.lg },
  intro: { gap: space.sm + 2 },
  lead: { fontSize: 15, lineHeight: 22 },
  progress: { gap: space.sm + 2 },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bar: { flexDirection: 'row', height: 6, borderRadius: RADIUS_FULL, overflow: 'hidden', gap: SPACING_XXS },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING_MD + SPACING_XXS, minHeight: 68, paddingVertical: space.sm + 4 },
  marker: {
    width: 32,
    height: 32,
    borderRadius: RADIUS_FULL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerNumber: { fontSize: 16, lineHeight: 18 },
  stepText: { flex: 1, gap: space['2xs'] },
  stepTitle: { fontSize: 15 },
  struck: { textDecorationLine: 'line-through' },
})
