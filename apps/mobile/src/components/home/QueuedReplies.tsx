import { useTranslation } from 'react-i18next'
import { useRsvpOutbox } from '../../lib/rsvpOutbox'
import { HomeCard, HomeRow, HomeTag, eventHeadline } from './HomeKit'
import { heroKickoff } from './HomeHero'
import { useHomeLocale } from './useHomeLocale'

/**
 * Board 29: answers given offline, one row each — "1 Zusage wartet",
 * "Training Di 18:30 · Dabei", tag "Wartet". Gone once the outbox is sent.
 */
export function QueuedReplies() {
  const queued = useRsvpOutbox()
  const { t } = useTranslation()
  const locale = useHomeLocale()
  if (queued.length === 0) return null
  return (
    <HomeCard>
      {queued.map((item, index) => {
        const answer =
          item.status === 'YES'
            ? t('eventFlow.rsvp.yes')
            : item.status === 'MAYBE'
              ? t('eventFlow.rsvp.maybe')
              : t('eventFlow.rsvp.no')
        return (
          <HomeRow
            key={item.key}
            icon="clock"
            title={t(
              item.status === 'NO' ? 'homeHub.queued.decline' : 'homeHub.queued.reply',
              { defaultValue: '1 reply waiting', count: 1 },
            )}
            detail={[`${eventHeadline({ title: item.title, date: item.date })} ${heroKickoff(item.date, locale)}`, answer].join(' · ')}
            trailing={<HomeTag label={t('homeHub.queued.tag', { defaultValue: 'Waiting' })} />}
            showDivider={index > 0}
          />
        )
      })}
    </HomeCard>
  )
}
