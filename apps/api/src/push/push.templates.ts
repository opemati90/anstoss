/**
 * Typed, localized push-notification templates.
 *
 * Every template renders title + body for all six app locales
 * (de/en/fr/it/pt/tr). `Record<Locale, …>` keeps this exhaustive: adding a
 * locale to `Locale` fails the build until every template carries it.
 * Pure passthrough notifications (chat / DM carry only a sender name +
 * message preview) are locale-agnostic by construction. Dynamic values the
 * caller supplies (names, scorelines, amounts, dates) are interpolated as-is,
 * so dates must already be formatted in the reader's locale.
 *
 * Copy rules: no emoji in titles, informal address everywhere (du / tu / tu /
 * tu (pt-PT) / sen), and Turkish phrasings that never attach a suffix to a
 * variable (club and team names use "… kulübü" / "… takımı" or a separator).
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

/** Pick a locale-specific string from an exhaustive per-locale table. */
function L<T>(table: Record<Locale, T>, locale: Locale): T {
  return table[locale]
}

/** RSVP answer labels (enum RsvpStatus) as the app shows them. */
const RSVP_LABEL: Record<Locale, Record<string, string>> = {
  de: { YES: 'Zusage', MAYBE: 'Vielleicht', NO: 'Absage' },
  en: { YES: 'Going', MAYBE: 'Maybe', NO: 'Not going' },
  fr: { YES: 'Présent', MAYBE: 'Peut-être', NO: 'Absent' },
  it: { YES: 'Presente', MAYBE: 'Forse', NO: 'Assente' },
  pt: { YES: 'Vou', MAYBE: 'Talvez', NO: 'Não vou' },
  tr: { YES: 'Katılıyor', MAYBE: 'Belki', NO: 'Katılmıyor' },
}

const ATTACHMENT_LABEL: Record<Locale, Record<string, string> & { fallback: string }> = {
  de: { VOICE: 'Sprachnachricht', IMAGE: 'Foto', VIDEO: 'Video', FILE: 'Datei', LINEUP: 'Aufstellung', fallback: 'Anhang' },
  en: { VOICE: 'Voice message', IMAGE: 'Photo', VIDEO: 'Video', FILE: 'File', LINEUP: 'Lineup', fallback: 'Attachment' },
  fr: { VOICE: 'Message vocal', IMAGE: 'Photo', VIDEO: 'Vidéo', FILE: 'Fichier', LINEUP: 'Composition', fallback: 'Pièce jointe' },
  it: { VOICE: 'Messaggio vocale', IMAGE: 'Foto', VIDEO: 'Video', FILE: 'File', LINEUP: 'Formazione', fallback: 'Allegato' },
  pt: { VOICE: 'Mensagem de voz', IMAGE: 'Fotografia', VIDEO: 'Vídeo', FILE: 'Ficheiro', LINEUP: 'Onze inicial', fallback: 'Anexo' },
  tr: { VOICE: 'Sesli mesaj', IMAGE: 'Fotoğraf', VIDEO: 'Video', FILE: 'Dosya', LINEUP: 'İlk 11', fallback: 'Ek' },
}

export const PUSH_TEMPLATES = {
  EVENT_CREATED: {
    title: (d: { teamName: string }) => d.teamName,
    body: (d: { eventType: string; eventTitle: string; date: string }, l) =>
      L(
        {
          de: `Neuer Termin: ${d.eventTitle} am ${d.date}`,
          en: `New ${d.eventType === 'match' || d.eventType === 'training' ? d.eventType : 'event'}: ${d.eventTitle} on ${d.date}`,
          fr: `Nouveau : ${d.eventTitle} le ${d.date}`,
          it: `Nuovo: ${d.eventTitle} il ${d.date}`,
          pt: `Novo: ${d.eventTitle}, ${d.date}`,
          tr: `Yeni etkinlik: ${d.eventTitle} · ${d.date}`,
        },
        l,
      ),
    channelId: 'events',
  } satisfies Template<{ teamName: string; eventType: string; eventTitle: string; date: string }>,

  EVENT_UPDATED: {
    title: (d: { teamName: string }) => d.teamName,
    body: (d: { eventTitle: string; date: string }, l) =>
      L(
        {
          de: `Geändert: ${d.eventTitle} ist jetzt am ${d.date}`,
          en: `Changed: ${d.eventTitle} is now on ${d.date}`,
          fr: `Modifié : ${d.eventTitle} a lieu désormais le ${d.date}`,
          it: `Modificato: ${d.eventTitle} ora è il ${d.date}`,
          pt: `Alterado: ${d.eventTitle} passou para ${d.date}`,
          tr: `Değişiklik: ${d.eventTitle} · yeni tarih ${d.date}`,
        },
        l,
      ),
    channelId: 'events',
  } satisfies Template<{ teamName: string; eventTitle: string; date: string }>,

  EVENT_CANCELLED: {
    title: (d: { teamName: string }) => d.teamName,
    body: (d: { eventTitle: string; date: string; reason: string }, l) => {
      const reason = d.reason ? ` – ${d.reason}` : ''
      return L(
        {
          de: `Abgesagt: ${d.eventTitle} am ${d.date}${reason}`,
          en: `Cancelled: ${d.eventTitle} on ${d.date}${reason}`,
          fr: `Annulé : ${d.eventTitle} le ${d.date}${reason}`,
          it: `Annullato: ${d.eventTitle} il ${d.date}${reason}`,
          pt: `Cancelado: ${d.eventTitle}, ${d.date}${reason}`,
          tr: `İptal edildi: ${d.eventTitle} · ${d.date}${reason}`,
        },
        l,
      )
    },
    channelId: 'events',
  } satisfies Template<{ teamName: string; eventTitle: string; date: string; reason: string }>,

  EVENT_REMINDER: {
    // `timeUntil` arrives already localized (see formatTimeUntil in the worker).
    title: (d: { eventTitle: string; timeUntil: string }) => `${d.eventTitle} · ${d.timeUntil}`,
    body: (d: { location?: string }, l) =>
      d.location ||
      L(
        {
          de: 'Ort noch offen',
          en: 'Location to be confirmed',
          fr: 'Lieu à confirmer',
          it: 'Luogo da definire',
          pt: 'Local a definir',
          tr: 'Yer henüz belli değil',
        },
        l,
      ),
    channelId: 'events',
  } satisfies Template<{ eventTitle: string; timeUntil: string; location?: string }>,

  // SQUAD_NOMINATED moved to events/event-copy.ts (player + guardian copy, six
  // languages, dates in the reader's locale).

  RSVP_UPDATE: {
    title: (d: { userName: string }, l) =>
      L(
        {
          de: `${d.userName} hat geantwortet`,
          en: `${d.userName} replied`,
          fr: `${d.userName} a répondu`,
          it: `${d.userName} ha risposto`,
          pt: `${d.userName} respondeu`,
          tr: `${d.userName} yanıt verdi`,
        },
        l,
      ),
    body: (d: { status: string; eventTitle: string }, l) =>
      `${RSVP_LABEL[l][d.status] ?? d.status} · ${d.eventTitle}`,
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

  // ── Chat revamp (L2): localized chat pushes, no emoji in chrome ──────────
  ANNOUNCEMENT: {
    title: (d: { senderName: string }, l) =>
      d.senderName
        ? L(
            {
              de: `Ankündigung von ${d.senderName}`,
              en: `Announcement from ${d.senderName}`,
              fr: `Annonce de ${d.senderName}`,
              it: `Avviso da ${d.senderName}`,
              pt: `Aviso de ${d.senderName}`,
              tr: `${d.senderName} bir duyuru paylaştı`,
            },
            l,
          )
        : L(
            { de: 'Ankündigung', en: 'Announcement', fr: 'Annonce', it: 'Avviso', pt: 'Aviso', tr: 'Duyuru' },
            l,
          ),
    body: (d: { messagePreview: string }) => d.messagePreview,
    channelId: 'announcements',
  } satisfies Template<{ senderName: string; messagePreview: string }>,

  CHAT_REPLY: {
    title: (d: { senderName: string }, l) =>
      L(
        {
          de: `${d.senderName} hat dir geantwortet`,
          en: `${d.senderName} replied to you`,
          fr: `${d.senderName} t’a répondu`,
          it: `${d.senderName} ti ha risposto`,
          pt: `${d.senderName} respondeu-te`,
          tr: `${d.senderName} sana yanıt verdi`,
        },
        l,
      ),
    body: (d: { messagePreview: string }) => d.messagePreview,
    channelId: 'chat',
  } satisfies Template<{ senderName: string; messagePreview: string }>,

  CHAT_MENTION: {
    title: (d: { senderName: string }, l) =>
      L(
        {
          de: `${d.senderName} hat dich erwähnt`,
          en: `${d.senderName} mentioned you`,
          fr: `${d.senderName} t’a mentionné`,
          it: `${d.senderName} ti ha menzionato`,
          pt: `${d.senderName} mencionou-te`,
          tr: `${d.senderName} senden bahsetti`,
        },
        l,
      ),
    body: (d: { messagePreview: string }) => d.messagePreview,
    channelId: 'chat',
  } satisfies Template<{ senderName: string; messagePreview: string }>,

  /** A media / card message; body names the attachment when there is no caption. */
  CHAT_ATTACHMENT: {
    title: (d: { senderName: string }) => d.senderName,
    body: (d: { kind: string; caption?: string | null }, l) =>
      d.caption?.trim()
        ? d.caption.trim()
        : (ATTACHMENT_LABEL[l][d.kind] ?? ATTACHMENT_LABEL[l].fallback),
    channelId: 'chat',
  } satisfies Template<{ senderName: string; kind: string; caption?: string | null }>,

  CHAT_REACTION: {
    title: (d: { senderName: string }) => d.senderName,
    body: (d: { emoji: string }, l) =>
      L(
        {
          de: `hat mit ${d.emoji} auf deine Nachricht reagiert`,
          en: `reacted ${d.emoji} to your message`,
          fr: `a réagi ${d.emoji} à ton message`,
          it: `ha reagito ${d.emoji} al tuo messaggio`,
          pt: `reagiu ${d.emoji} à tua mensagem`,
          tr: `mesajına ${d.emoji} ile tepki verdi`,
        },
        l,
      ),
    channelId: 'chat',
  } satisfies Template<{ senderName: string; emoji: string }>,

  DM_FALLBACK_TITLE: {
    title: (_d: { messagePreview: string }, l) =>
      L(
        {
          de: 'Neue Nachricht',
          en: 'New message',
          fr: 'Nouveau message',
          it: 'Nuovo messaggio',
          pt: 'Nova mensagem',
          tr: 'Yeni mesaj',
        },
        l,
      ),
    body: (d: { messagePreview: string }) => d.messagePreview,
    channelId: 'chat',
  } satisfies Template<{ messagePreview: string }>,

  JOIN_REQUEST: {
    title: (_d: { userName: string; clubName: string }, l) =>
      L(
        {
          de: 'Neue Beitrittsanfrage',
          en: 'New join request',
          fr: 'Nouvelle demande d’adhésion',
          it: 'Nuova richiesta di adesione',
          pt: 'Novo pedido de adesão',
          tr: 'Yeni üyelik başvurusu',
        },
        l,
      ),
    body: (d: { userName: string; clubName: string }, l) =>
      L(
        {
          de: `${d.userName} möchte ${d.clubName} beitreten`,
          en: `${d.userName} wants to join ${d.clubName}`,
          fr: `${d.userName} souhaite rejoindre ${d.clubName}`,
          it: `${d.userName} vuole entrare nel ${d.clubName}`,
          pt: `${d.userName} quer entrar no ${d.clubName}`,
          tr: `${d.userName}, ${d.clubName} kulübüne katılmak istiyor`,
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
          en: 'Reminder: join request',
          fr: 'Rappel : demande d’adhésion',
          it: 'Promemoria: richiesta di adesione',
          pt: 'Lembrete: pedido de adesão',
          tr: 'Hatırlatma: üyelik başvurusu',
        },
        l,
      ),
    body: (d: { clubName: string }, l) =>
      L(
        {
          de: `Jemand wartet noch auf die Freigabe für ${d.clubName}.`,
          en: `Someone is still waiting for approval to join ${d.clubName}.`,
          fr: `Quelqu’un attend encore ton accord pour rejoindre ${d.clubName}.`,
          it: `Qualcuno aspetta ancora l’approvazione per entrare nel ${d.clubName}.`,
          pt: `Alguém ainda aguarda aprovação para entrar no ${d.clubName}.`,
          tr: `${d.clubName} kulübüne katılmak için onay bekleyen biri var.`,
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
          it: `Benvenuto nel ${d.clubName}!`,
          pt: `Bem-vindo ao ${d.clubName}!`,
          tr: `${d.clubName} kulübüne hoş geldin!`,
        },
        l,
      ),
    body: (_d: { clubName: string }, l) =>
      L(
        {
          de: 'Deine Beitrittsanfrage wurde angenommen.',
          en: 'Your join request was approved.',
          fr: 'Ta demande d’adhésion a été acceptée.',
          it: 'La tua richiesta di adesione è stata accettata.',
          pt: 'O teu pedido de adesão foi aceite.',
          tr: 'Üyelik başvurun onaylandı.',
        },
        l,
      ),
    channelId: 'events',
  } satisfies Template<{ clubName: string }>,

  JOIN_REJECTED: {
    title: (d: { clubName: string }, l) =>
      L(
        {
          de: `${d.clubName}: Beitrittsanfrage`,
          en: `${d.clubName}: join request`,
          fr: `${d.clubName} : demande d’adhésion`,
          it: `${d.clubName}: richiesta di adesione`,
          pt: `${d.clubName}: pedido de adesão`,
          tr: `${d.clubName}: üyelik başvurusu`,
        },
        l,
      ),
    body: (_d: { clubName: string }, l) =>
      L(
        {
          de: 'Deine Beitrittsanfrage wurde leider nicht angenommen.',
          en: 'Unfortunately, your join request was not accepted.',
          fr: 'Ta demande d’adhésion n’a malheureusement pas été acceptée.',
          it: 'Purtroppo la tua richiesta di adesione non è stata accettata.',
          pt: 'Infelizmente, o teu pedido de adesão não foi aceite.',
          tr: 'Üyelik başvurun maalesef kabul edilmedi.',
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
          tr: `${d.clubName}: ödeme alındı`,
        },
        l,
      ),
    body: (d: { planName: string; amountLabel: string }, l) =>
      L(
        {
          de: `${d.planName} als bezahlt markiert · ${d.amountLabel}. Danke!`,
          en: `${d.planName} marked as paid · ${d.amountLabel}. Thanks!`,
          fr: `${d.planName} marqué comme payé · ${d.amountLabel}. Merci !`,
          it: `${d.planName} segnato come pagato · ${d.amountLabel}. Grazie!`,
          pt: `${d.planName} marcado como pago · ${d.amountLabel}. Obrigado!`,
          tr: `Ödendi: ${d.planName} · ${d.amountLabel}. Teşekkürler!`,
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
          en: `${d.clubName}: fee due`,
          fr: `${d.clubName} : cotisation à régler`,
          it: `${d.clubName}: quota da pagare`,
          pt: `${d.clubName}: quota por pagar`,
          tr: `${d.clubName}: aidat ödemesi`,
        },
        l,
      ),
    body: (d: { planName: string; amountLabel: string; dueDate: string }, l) =>
      L(
        {
          de: `${d.planName} · ${d.amountLabel} · fällig am ${d.dueDate}`,
          en: `${d.planName} · ${d.amountLabel} · due ${d.dueDate}`,
          fr: `${d.planName} · ${d.amountLabel} · échéance le ${d.dueDate}`,
          it: `${d.planName} · ${d.amountLabel} · scadenza ${d.dueDate}`,
          pt: `${d.planName} · ${d.amountLabel} · até ${d.dueDate}`,
          tr: `${d.planName} · ${d.amountLabel} · son ödeme tarihi ${d.dueDate}`,
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
          en: `${d.clubName} invited you to a trial session`,
          fr: `${d.clubName} t’invite à un entraînement d’essai`,
          it: `${d.clubName} ti invita a un allenamento di prova`,
          pt: `O ${d.clubName} convidou-te para um treino à experiência`,
          tr: `${d.clubName} kulübü seni deneme antrenmanına davet ediyor`,
        },
        l,
      ),
    body: (d: { teamName: string }, l) =>
      L(
        {
          de: `${d.teamName} möchte dich beim Training sehen.`,
          en: `${d.teamName} would like to see you at training.`,
          fr: `${d.teamName} aimerait te voir à l’entraînement.`,
          it: `${d.teamName} vuole vederti all’allenamento.`,
          pt: `A equipa ${d.teamName} quer ver-te no treino.`,
          tr: `${d.teamName} takımı seni antrenmanda görmek istiyor.`,
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
              de: `${d.playerName} hat das Probetraining angenommen`,
              en: `${d.playerName} accepted the trial`,
              fr: `${d.playerName} a accepté l’essai`,
              it: `${d.playerName} ha accettato la prova`,
              pt: `${d.playerName} aceitou o treino à experiência`,
              tr: `${d.playerName} deneme antrenmanını kabul etti`,
            },
            l,
          )
        : L(
            {
              de: `${d.playerName} hat das Probetraining abgelehnt`,
              en: `${d.playerName} declined the trial`,
              fr: `${d.playerName} a refusé l’essai`,
              it: `${d.playerName} ha rifiutato la prova`,
              pt: `${d.playerName} recusou o treino à experiência`,
              tr: `${d.playerName} deneme antrenmanını reddetti`,
            },
            l,
          ),
    body: (d: { teamName: string; accepted: boolean }, l) =>
      d.accepted
        ? L(
            {
              de: `Der Termin bei ${d.teamName} steht.`,
              en: `The session with ${d.teamName} is confirmed.`,
              fr: `La séance avec ${d.teamName} est confirmée.`,
              it: `L’allenamento con ${d.teamName} è confermato.`,
              pt: `O treino com a equipa ${d.teamName} está confirmado.`,
              tr: `${d.teamName} takımıyla antrenman kesinleşti.`,
            },
            l,
          )
        : L(
            {
              de: `Für einen neuen Anlauf braucht es eine neue Einladung von ${d.teamName}.`,
              en: `${d.teamName} will need to send a new invite for another try.`,
              fr: `Pour une nouvelle tentative, ${d.teamName} devra envoyer une nouvelle invitation.`,
              it: `Per riprovare, ${d.teamName} dovrà inviare un nuovo invito.`,
              pt: `Para tentar de novo, a equipa ${d.teamName} terá de enviar um novo convite.`,
              tr: `Yeniden denemek için ${d.teamName} takımının yeni bir davet göndermesi gerekiyor.`,
            },
            l,
          ),
    channelId: 'events',
  } satisfies Template<{ playerName: string; accepted: boolean; teamName: string }>,

  // ── Wechselbörse (2026-09) ─────────────────────────────────
  TRIAL_REQUEST: {
    title: (d: { playerName: string }, l) =>
      L(
        {
          de: `${d.playerName} fragt ein Probetraining an`,
          en: `${d.playerName} asked for a trial session`,
          fr: `${d.playerName} demande un entraînement d’essai`,
          it: `${d.playerName} chiede un allenamento di prova`,
          pt: `${d.playerName} pediu um treino à experiência`,
          tr: `${d.playerName} deneme antrenmanı istiyor`,
        },
        l,
      ),
    body: (d: { teamName: string }, l) =>
      L(
        {
          de: `Zu eurem Gesuch für ${d.teamName}. Lade zum Training ein oder sag ab.`,
          en: `About your ${d.teamName} listing. Invite them to a session or decline.`,
          fr: `Pour ton annonce ${d.teamName}. Invite-le à une séance ou refuse.`,
          it: `Per il tuo annuncio ${d.teamName}. Invitalo a un allenamento o rifiuta.`,
          pt: `Sobre o teu anúncio da equipa ${d.teamName}. Convida para um treino ou recusa.`,
          tr: `${d.teamName} takımı ilanın için. Antrenmana davet et ya da reddet.`,
        },
        l,
      ),
    channelId: 'events',
  } satisfies Template<{ playerName: string; teamName: string }>,

  TRIAL_OFFER: {
    title: (d: { clubName: string }, l) =>
      L(
        {
          de: `${d.clubName} möchte dich aufnehmen`,
          en: `${d.clubName} wants you in the squad`,
          fr: `${d.clubName} veut t’intégrer à l’effectif`,
          it: `${d.clubName} vuole tesserarti`,
          pt: `O ${d.clubName} quer-te no plantel`,
          tr: `${d.clubName} kulübü seni kadroya almak istiyor`,
        },
        l,
      ),
    body: (d: { teamName: string }, l) =>
      L(
        {
          de: `Fülle den Aufnahmeantrag für ${d.teamName} aus, dann kümmert sich der Verein um den Passantrag.`,
          en: `Fill in the membership application for ${d.teamName}; the club handles the player registration.`,
          fr: `Remplis la demande d’adhésion pour ${d.teamName} ; le club s’occupe de la licence.`,
          it: `Compila la domanda di iscrizione per ${d.teamName}; al tesseramento pensa il club.`,
          pt: `Preenche o pedido de adesão para a equipa ${d.teamName}; o clube trata da inscrição.`,
          tr: `${d.teamName} takımı için üyelik başvurusunu doldur; lisans başvurusunu kulüp yapacak.`,
        },
        l,
      ),
    channelId: 'events',
  } satisfies Template<{ clubName: string; teamName: string }>,

  TRIAL_DECLINED_BY_CLUB: {
    title: (d: { clubName: string }, l) =>
      L(
        {
          de: `Antwort von ${d.clubName}`,
          en: `Reply from ${d.clubName}`,
          fr: `Réponse de ${d.clubName}`,
          it: `Risposta dal ${d.clubName}`,
          pt: `Resposta do ${d.clubName}`,
          tr: `${d.clubName} kulübünden yanıt`,
        },
        l,
      ),
    body: (d: { teamName: string }, l) =>
      L(
        {
          de: `${d.teamName} hat sich gegen eine Aufnahme entschieden. Danke fürs Kommen!`,
          en: `${d.teamName} decided not to take this further. Thanks for coming!`,
          fr: `${d.teamName} a décidé de ne pas donner suite. Merci d’être venu !`,
          it: `${d.teamName} ha deciso di non proseguire. Grazie per essere venuto!`,
          pt: `A equipa ${d.teamName} decidiu não avançar. Obrigado por teres vindo!`,
          tr: `${d.teamName} takımı devam etmeme kararı aldı. Geldiğin için teşekkürler!`,
        },
        l,
      ),
    channelId: 'events',
  } satisfies Template<{ clubName: string; teamName: string }>,

  // ── Wechselbörse review fixes (M8): the coach withdrew a Probetraining invite.
  TRIAL_REVOKED: {
    title: (d: { clubName: string }, l) =>
      L(
        {
          de: `Probetraining bei ${d.clubName} abgesagt`,
          en: `Trial at ${d.clubName} called off`,
          fr: `Essai à ${d.clubName} annulé`,
          it: `Prova con il ${d.clubName} annullata`,
          pt: `Treino à experiência no ${d.clubName} cancelado`,
          tr: `${d.clubName} kulübündeki deneme antrenmanı iptal edildi`,
        },
        l,
      ),
    body: (d: { teamName: string }, l) =>
      L(
        {
          de: `${d.teamName} hat die Einladung zurückgezogen. Deine Termine sind gestrichen.`,
          en: `${d.teamName} withdrew the invitation. Your sessions have been removed.`,
          fr: `${d.teamName} a retiré l’invitation. Tes séances ont été supprimées.`,
          it: `${d.teamName} ha ritirato l’invito. I tuoi allenamenti sono stati cancellati.`,
          pt: `A equipa ${d.teamName} retirou o convite. Os teus treinos foram removidos.`,
          tr: `${d.teamName} takımı daveti geri çekti. Antrenmanların takviminden kaldırıldı.`,
        },
        l,
      ),
    channelId: 'events',
  } satisfies Template<{ clubName: string; teamName: string }>,
  // ── end Wechselbörse review fixes

  LINEUP_POSTED: {
    title: (_d: { formation: string }, l) =>
      L(
        {
          de: 'Aufstellung veröffentlicht',
          en: 'Lineup posted',
          fr: 'Composition publiée',
          it: 'Formazione pubblicata',
          pt: 'Onze inicial publicado',
          tr: 'İlk 11 açıklandı',
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
          tr: 'İlk 11',
        },
        l,
      )} · ${d.formation}`,
    channelId: 'chat',
  } satisfies Template<{ formation: string }>,

  GOAL: {
    title: (_d: { scoreline: string }, l) =>
      L({ de: 'Tor!', en: 'Goal!', fr: 'But !', it: 'Gol!', pt: 'Golo!', tr: 'Gol!' }, l),
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
          it: 'Fischio finale',
          pt: 'Final do jogo',
          tr: 'Maç sona erdi',
        },
        l,
      ),
    body: (d: { scoreline: string }) => d.scoreline,
    channelId: 'events',
  } satisfies Template<{ scoreline: string }>,

  // club-admin revamp: admin asks a member to present a document
  // (Führungszeugnis, SEPA mandate, …). `document` is already localized.
  COMPLIANCE_REMINDER: {
    title: (d: { clubName: string }) => d.clubName,
    body: (d: { clubName: string; document: string }, l) =>
      L(
        {
          de: `Bitte reiche beim Verein ein: ${d.document}.`,
          en: `Please submit this to the club: ${d.document}.`,
          fr: `Merci de transmettre ce document au club : ${d.document}.`,
          it: `Consegna questo documento al club: ${d.document}.`,
          pt: `Entrega este documento ao clube: ${d.document}.`,
          tr: `Lütfen şu belgeyi kulübe ilet: ${d.document}.`,
        },
        l,
      ),
    channelId: 'events',
  } satisfies Template<{ clubName: string; document: string }>,

  // Privacy: a guardian withdrew parental consent (GDPR Art. 7(3)). Sent to
  // club admins, and to the guardian when an admin acted on their request.
  CONSENT_WITHDRAWN: {
    title: (d: { clubName: string }) => d.clubName,
    body: (d: { childName: string; teamName: string; accessRevoked: boolean }, l) =>
      d.accessRevoked
        ? L(
            {
              de: `Die Einwilligung der Eltern für ${d.childName} (${d.teamName}) wurde widerrufen. Der Zugang zum Team ist gesperrt.`,
              en: `Parental consent for ${d.childName} (${d.teamName}) was withdrawn. Team access has been removed.`,
              fr: `Le consentement parental pour ${d.childName} (${d.teamName}) a été retiré. L’accès à l’équipe est suspendu.`,
              it: `Il consenso dei genitori per ${d.childName} (${d.teamName}) è stato revocato. L’accesso alla squadra è sospeso.`,
              pt: `O consentimento parental para ${d.childName} (${d.teamName}) foi retirado. O acesso à equipa foi removido.`,
              tr: `Veli onayı geri çekildi: ${d.childName} (${d.teamName}). Takıma erişim kapatıldı.`,
            },
            l,
          )
        : L(
            {
              de: `Eine Einwilligung der Eltern für ${d.childName} (${d.teamName}) wurde widerrufen.`,
              en: `A parental consent for ${d.childName} (${d.teamName}) was withdrawn.`,
              fr: `Un consentement parental pour ${d.childName} (${d.teamName}) a été retiré.`,
              it: `Un consenso dei genitori per ${d.childName} (${d.teamName}) è stato revocato.`,
              pt: `Um consentimento parental para ${d.childName} (${d.teamName}) foi retirado.`,
              tr: `Bir veli onayı geri çekildi: ${d.childName} (${d.teamName}).`,
            },
            l,
          ),
    channelId: 'events',
  } satisfies Template<{ clubName: string; childName: string; teamName: string; accessRevoked: boolean }>,

  // Privacy/UGC: a member reported a chat message. Sent to club admins, who
  // must review it within 24h (docs/compliance/UGC_MODERATION.md).
  MODERATION_REPORT_CREATED: {
    title: (d: { clubName: string }) => d.clubName,
    body: (_d: { clubName: string }, l) =>
      L(
        {
          de: 'Eine Chat-Nachricht wurde gemeldet. Bitte prüfe sie innerhalb von 24 Stunden.',
          en: 'A chat message was reported. Please review it within 24 hours.',
          fr: 'Un message du chat a été signalé. Merci de le vérifier sous 24 heures.',
          it: 'Un messaggio in chat è stato segnalato. Controllalo entro 24 ore.',
          pt: 'Uma mensagem do chat foi denunciada. Revê-a nas próximas 24 horas.',
          tr: 'Bir sohbet mesajı şikâyet edildi. Lütfen 24 saat içinde incele.',
        },
        l,
      ),
    channelId: 'events',
  } satisfies Template<{ clubName: string }>,

  // ── Safeguarding review fixes (2026-09-24) ──────────────────────────────
  // Guardian asked to approve a child's parental consent (new or re-request).
  CONSENT_REQUESTED: {
    title: (d: { clubName: string }) => d.clubName,
    body: (d: { childName: string; teamName: string }, l) =>
      L(
        {
          de: `Bitte prüfe die Einwilligung für ${d.childName} (${d.teamName}).`,
          en: `Please review the consent request for ${d.childName} (${d.teamName}).`,
          fr: `Merci de vérifier la demande de consentement pour ${d.childName} (${d.teamName}).`,
          it: `Controlla la richiesta di consenso per ${d.childName} (${d.teamName}).`,
          pt: `Revê o pedido de consentimento para ${d.childName} (${d.teamName}).`,
          tr: `Lütfen veli onayı talebini incele: ${d.childName} (${d.teamName}).`,
        },
        l,
      ),
    channelId: 'events',
  } satisfies Template<{ clubName: string; childName: string; teamName: string }>,

  // L2: several reports inside the debounce window collapse into one push.
  MODERATION_REPORTS_BATCH: {
    title: (d: { clubName: string }) => d.clubName,
    body: (d: { clubName: string; count: number }, l) =>
      L(
        {
          de: `${d.count} Chat-Nachrichten wurden gemeldet. Bitte prüfe sie innerhalb von 24 Stunden.`,
          en: `${d.count} chat messages were reported. Please review them within 24 hours.`,
          fr: `${d.count} messages du chat ont été signalés. Merci de les vérifier sous 24 heures.`,
          it: `${d.count} messaggi in chat sono stati segnalati. Controllali entro 24 ore.`,
          pt: `${d.count} mensagens do chat foram denunciadas. Revê-as nas próximas 24 horas.`,
          tr: `Şikâyet edilen sohbet mesajı sayısı: ${d.count}. Lütfen 24 saat içinde incele.`,
        },
        l,
      ),
    channelId: 'events',
  } satisfies Template<{ clubName: string; count: number }>,
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
