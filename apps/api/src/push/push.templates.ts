/**
 * Typed, localized push-notification templates.
 *
 * Every template renders title + body for all five app locales (de/en/fr/it/pt).
 * Pure passthrough notifications (chat / DM / announcement carry only a sender
 * name + message preview) are locale-agnostic by construction. Dynamic values
 * the caller supplies (names, scorelines, amounts) are interpolated as-is.
 *
 * Resolve the recipient's locale with `resolveLocale(user.preferredLanguage)`
 * and pass it to {@link formatPush}; the push service exposes
 * `sendToUserLocalized` / `sendToTeamLocalized` to do this automatically.
 */
import type { Locale } from '../i18n/translations'

type Builder<D> = (data: D, locale: Locale) => string

interface Template<D> {
  title: Builder<D>
  body: Builder<D>
  channelId: string
}

/** Pick a locale-specific string from a 5-entry table. */
function L<T>(table: Record<Locale, T>, locale: Locale): T {
  return table[locale]
}

export const PUSH_TEMPLATES = {
  EVENT_CREATED: {
    title: (d: { teamName: string }) => `📅 ${d.teamName}`,
    body: (d: { eventType: string; eventTitle: string; date: string }, l) =>
      L(
        {
          de: `Neu: ${d.eventTitle} am ${d.date}`,
          en: `New ${d.eventType}: ${d.eventTitle} on ${d.date}`,
          fr: `Nouveau : ${d.eventTitle} le ${d.date}`,
          it: `Nuovo: ${d.eventTitle} il ${d.date}`,
          pt: `Novo: ${d.eventTitle} em ${d.date}`,
        },
        l,
      ),
    channelId: 'events',
  } satisfies Template<{ teamName: string; eventType: string; eventTitle: string; date: string }>,

  EVENT_REMINDER: {
    // `timeUntil` arrives already localized (see formatTimeUntil in the worker).
    title: (d: { eventTitle: string; timeUntil: string }) => `⏰ ${d.eventTitle} · ${d.timeUntil}`,
    body: (d: { location?: string }, l) =>
      d.location ||
      L(
        {
          de: 'Ort noch offen',
          en: 'Location TBD',
          fr: 'Lieu à confirmer',
          it: 'Luogo da definire',
          pt: 'Local a definir',
        },
        l,
      ),
    channelId: 'events',
  } satisfies Template<{ eventTitle: string; timeUntil: string; location?: string }>,

  RSVP_UPDATE: {
    title: (d: { userName: string }, l) =>
      L(
        {
          de: `${d.userName} hat geantwortet`,
          en: `${d.userName} responded`,
          fr: `${d.userName} a répondu`,
          it: `${d.userName} ha risposto`,
          pt: `${d.userName} respondeu`,
        },
        l,
      ),
    body: (d: { status: string; eventTitle: string }) => `${d.status} · ${d.eventTitle}`,
    channelId: 'events',
  } satisfies Template<{ userName: string; status: string; eventTitle: string }>,

  // ── Passthrough: only dynamic content, no fixed prose ──────────────────────
  CHAT_MESSAGE: {
    title: (d: { senderName: string; teamName: string }) => `${d.senderName} · ${d.teamName}`,
    body: (d: { messagePreview: string }) => d.messagePreview,
    channelId: 'chat',
  } satisfies Template<{ senderName: string; teamName: string; messagePreview: string }>,

  DM_MESSAGE: {
    title: (d: { senderName: string }) => d.senderName,
    body: (d: { messagePreview: string }) => d.messagePreview,
    channelId: 'chat',
  } satisfies Template<{ senderName: string; messagePreview: string }>,

  ANNOUNCEMENT: {
    title: (d: { senderName: string }) => `📢 ${d.senderName}`,
    body: (d: { messagePreview: string }) => d.messagePreview,
    channelId: 'announcements',
  } satisfies Template<{ senderName: string; messagePreview: string }>,

  JOIN_REQUEST: {
    title: (_d: { userName: string; clubName: string }, l) =>
      L(
        {
          de: 'Neue Beitrittsanfrage',
          en: 'New join request',
          fr: 'Nouvelle demande d’adhésion',
          it: 'Nuova richiesta di adesione',
          pt: 'Novo pedido de adesão',
        },
        l,
      ),
    body: (d: { userName: string; clubName: string }, l) =>
      L(
        {
          de: `${d.userName} möchte ${d.clubName} beitreten`,
          en: `${d.userName} wants to join ${d.clubName}`,
          fr: `${d.userName} souhaite rejoindre ${d.clubName}`,
          it: `${d.userName} vuole unirsi a ${d.clubName}`,
          pt: `${d.userName} quer entrar em ${d.clubName}`,
        },
        l,
      ),
    channelId: 'events',
  } satisfies Template<{ userName: string; clubName: string }>,

  JOIN_REQUEST_REMINDER: {
    title: (_d: { clubName: string }, l) =>
      L(
        {
          de: 'Erinnerung: Beitrittsanfrage',
          en: 'Join request reminder',
          fr: 'Rappel : demande d’adhésion',
          it: 'Promemoria: richiesta di adesione',
          pt: 'Lembrete: pedido de adesão',
        },
        l,
      ),
    body: (d: { clubName: string }, l) =>
      L(
        {
          de: `Jemand wartet auf die Freigabe, um ${d.clubName} beizutreten.`,
          en: `Someone is waiting for approval to join ${d.clubName}.`,
          fr: `Quelqu’un attend une approbation pour rejoindre ${d.clubName}.`,
          it: `Qualcuno è in attesa di approvazione per unirsi a ${d.clubName}.`,
          pt: `Alguém aguarda aprovação para entrar em ${d.clubName}.`,
        },
        l,
      ),
    channelId: 'events',
  } satisfies Template<{ clubName: string }>,

  JOIN_APPROVED: {
    title: (d: { clubName: string }, l) =>
      L(
        {
          de: `Willkommen bei ${d.clubName}!`,
          en: `Welcome to ${d.clubName}!`,
          fr: `Bienvenue à ${d.clubName} !`,
          it: `Benvenuto in ${d.clubName}!`,
          pt: `Bem-vindo ao ${d.clubName}!`,
        },
        l,
      ),
    body: (_d: { clubName: string }, l) =>
      L(
        {
          de: 'Deine Beitrittsanfrage wurde genehmigt',
          en: 'Your join request was approved',
          fr: 'Votre demande d’adhésion a été approuvée',
          it: 'La tua richiesta di adesione è stata approvata',
          pt: 'O seu pedido de adesão foi aprovado',
        },
        l,
      ),
    channelId: 'events',
  } satisfies Template<{ clubName: string }>,

  CONTRIBUTION_PAID: {
    title: (d: { clubName: string }, l) =>
      L(
        {
          de: `${d.clubName}: Zahlung erhalten`,
          en: `${d.clubName}: payment received`,
          fr: `${d.clubName} : paiement reçu`,
          it: `${d.clubName}: pagamento ricevuto`,
          pt: `${d.clubName}: pagamento recebido`,
        },
        l,
      ),
    body: (d: { planName: string; amountLabel: string }, l) =>
      L(
        {
          de: `${d.planName} als bezahlt markiert · ${d.amountLabel}. Danke!`,
          en: `${d.planName} marked paid · ${d.amountLabel}. Thanks!`,
          fr: `${d.planName} marqué payé · ${d.amountLabel}. Merci !`,
          it: `${d.planName} contrassegnato come pagato · ${d.amountLabel}. Grazie!`,
          pt: `${d.planName} marcado como pago · ${d.amountLabel}. Obrigado!`,
        },
        l,
      ),
    channelId: 'events',
  } satisfies Template<{ clubName: string; planName: string; amountLabel: string }>,

  CONTRIBUTION_DUE: {
    title: (d: { clubName: string }, l) =>
      L(
        {
          de: `${d.clubName}: Beitrag fällig`,
          en: `${d.clubName}: contribution due`,
          fr: `${d.clubName} : cotisation à régler`,
          it: `${d.clubName}: contributo da pagare`,
          pt: `${d.clubName}: contribuição em aberto`,
        },
        l,
      ),
    body: (d: { planName: string; amountLabel: string; dueDate: string }, l) =>
      L(
        {
          de: `${d.planName} · ${d.amountLabel} · fällig am ${d.dueDate}`,
          en: `${d.planName} · ${d.amountLabel} · due ${d.dueDate}`,
          fr: `${d.planName} · ${d.amountLabel} · échéance ${d.dueDate}`,
          it: `${d.planName} · ${d.amountLabel} · scadenza ${d.dueDate}`,
          pt: `${d.planName} · ${d.amountLabel} · vence ${d.dueDate}`,
        },
        l,
      ),
    channelId: 'events',
  } satisfies Template<{ clubName: string; planName: string; amountLabel: string; dueDate: string }>,

  TRIAL_INVITE: {
    title: (d: { clubName: string }, l) =>
      L(
        {
          de: `${d.clubName} lädt dich zum Probetraining ein`,
          en: `${d.clubName} invited you for a trial`,
          fr: `${d.clubName} vous invite à un essai`,
          it: `${d.clubName} ti invita a una prova`,
          pt: `${d.clubName} convidou-o para um treino experimental`,
        },
        l,
      ),
    body: (d: { teamName: string }, l) =>
      L(
        {
          de: `${d.teamName} möchte dich beim Training sehen.`,
          en: `${d.teamName} wants to see you at training.`,
          fr: `${d.teamName} veut vous voir à l’entraînement.`,
          it: `${d.teamName} vuole vederti all’allenamento.`,
          pt: `${d.teamName} quer vê-lo no treino.`,
        },
        l,
      ),
    channelId: 'events',
  } satisfies Template<{ clubName: string; teamName: string }>,

  TRIAL_RESPONSE: {
    title: (d: { playerName: string; accepted: boolean }, l) =>
      d.accepted
        ? L(
            {
              de: `${d.playerName} hat die Probe angenommen`,
              en: `${d.playerName} accepted the trial`,
              fr: `${d.playerName} a accepté l’essai`,
              it: `${d.playerName} ha accettato la prova`,
              pt: `${d.playerName} aceitou o treino experimental`,
            },
            l,
          )
        : L(
            {
              de: `${d.playerName} hat die Probe abgelehnt`,
              en: `${d.playerName} declined the trial`,
              fr: `${d.playerName} a refusé l’essai`,
              it: `${d.playerName} ha rifiutato la prova`,
              pt: `${d.playerName} recusou o treino experimental`,
            },
            l,
          ),
    body: (d: { teamName: string; accepted: boolean }, l) =>
      d.accepted
        ? L(
            {
              de: `${d.teamName} kann den Probezugang jetzt aktivieren.`,
              en: `${d.teamName} can now activate the trial access.`,
              fr: `${d.teamName} peut maintenant activer l’accès à l’essai.`,
              it: `${d.teamName} può ora attivare l’accesso alla prova.`,
              pt: `${d.teamName} pode agora ativar o acesso ao treino experimental.`,
            },
            l,
          )
        : L(
            {
              de: `${d.teamName} braucht eine neue Einladung für einen weiteren Versuch.`,
              en: `${d.teamName} will need a new invite if you want to retry.`,
              fr: `${d.teamName} aura besoin d’une nouvelle invitation pour réessayer.`,
              it: `${d.teamName} avrà bisogno di un nuovo invito per riprovare.`,
              pt: `${d.teamName} precisará de um novo convite para tentar de novo.`,
            },
            l,
          ),
    channelId: 'events',
  } satisfies Template<{ playerName: string; accepted: boolean; teamName: string }>,

  LINEUP_POSTED: {
    title: (_d: { formation: string }, l) =>
      L(
        {
          de: 'Aufstellung veröffentlicht',
          en: 'Lineup posted',
          fr: 'Composition publiée',
          it: 'Formazione pubblicata',
          pt: 'Escalação publicada',
        },
        l,
      ),
    body: (d: { formation: string }, l) =>
      `${L(
        {
          de: 'Startelf',
          en: 'Starting XI',
          fr: 'Onze de départ',
          it: 'Undici titolare',
          pt: 'Onze inicial',
        },
        l,
      )} · ${d.formation}`,
    channelId: 'chat',
  } satisfies Template<{ formation: string }>,

  GOAL: {
    title: (_d: { scoreline: string }, l) =>
      L({ de: '⚽ Tor!', en: '⚽ Goal!', fr: '⚽ But !', it: '⚽ Gol!', pt: '⚽ Golo!' }, l),
    body: (d: { scoreline: string }) => d.scoreline,
    channelId: 'events',
  } satisfies Template<{ scoreline: string }>,

  FULL_TIME: {
    title: (_d: { scoreline: string }, l) =>
      L(
        {
          de: 'Schlusspfiff',
          en: 'Full time',
          fr: 'Fin du match',
          it: 'Fine partita',
          pt: 'Fim do jogo',
        },
        l,
      ),
    body: (d: { scoreline: string }) => d.scoreline,
    channelId: 'events',
  } satisfies Template<{ scoreline: string }>,
} as const

export type NotificationType = keyof typeof PUSH_TEMPLATES

export type TemplateData<T extends NotificationType> = Parameters<
  (typeof PUSH_TEMPLATES)[T]['title']
>[0] &
  Parameters<(typeof PUSH_TEMPLATES)[T]['body']>[0]

/**
 * Format a localized push notification.
 *
 *   formatPush('CONTRIBUTION_DUE', { clubName, planName, amountLabel, dueDate }, 'fr')
 */
export function formatPush<T extends NotificationType>(
  type: T,
  data: TemplateData<T>,
  locale: Locale = 'de',
): { title: string; body: string; channelId: string } {
  const template = PUSH_TEMPLATES[type]
  return {
    title: (template.title as (d: TemplateData<T>, l: Locale) => string)(data, locale),
    body: (template.body as (d: TemplateData<T>, l: Locale) => string)(data, locale),
    channelId: template.channelId,
  }
}
